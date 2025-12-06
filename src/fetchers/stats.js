// src/fetchers/stats.js
// @ts-check

import axios from "axios";
import * as dotenv from "dotenv";
import githubUsernameRegex from "github-username-regex";
import { calculateRank } from "../calculateRank.js";
import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { excludeRepositories } from "../common/envs.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

dotenv.config();

// GraphQL queries.
const GRAPHQL_REPOS_FIELD = `
  repositories(first: 100, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}, after: $after) {
    totalCount
    nodes {
      name
      stargazers {
        totalCount
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
`;

const GRAPHQL_REPOS_QUERY = `
  query userInfo($login: String!, $after: String) {
    user(login: $login) {
      ${GRAPHQL_REPOS_FIELD}
    }
  }
`;

const GRAPHQL_STATS_QUERY = `
  query userInfo($login: String!, $after: String, $includeMergedPullRequests: Boolean!, $includeDiscussions: Boolean!, $includeDiscussionsAnswers: Boolean!, $startTime: DateTime = null) {
    user(login: $login) {
      name
      login
      commits: contributionsCollection (from: $startTime) {
        totalCommitContributions,
      }
      reviews: contributionsCollection {
        totalPullRequestReviewContributions
      }
      repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
      pullRequests(first: 1) {
        totalCount
      }
      mergedPullRequests: pullRequests(states: MERGED) @include(if: $includeMergedPullRequests) {
        totalCount
      }
      openIssues: issues(states: OPEN) {
        totalCount
      }
      closedIssues: issues(states: CLOSED) {
        totalCount
      }
      followers {
        totalCount
      }
      repositoryDiscussions @include(if: $includeDiscussions) {
        totalCount
      }
      repositoryDiscussionComments(onlyAnswers: true) @include(if: $includeDiscussionsAnswers) {
        totalCount
      }
      ${GRAPHQL_REPOS_FIELD}
    }
  }
`;

/**
 * Stats fetcher object.
 *
 * @param {object & { after: string | null }} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const fetcher = (variables, token) => {
  const query = variables.after ? GRAPHQL_REPOS_QUERY : GRAPHQL_STATS_QUERY;
  return request(
    {
      query,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

/**
 * Fetch stats information for a given username.
 *
 * @param {object} variables Fetcher variables.
 * @param {string} variables.username GitHub username.
 * @param {boolean} variables.includeMergedPullRequests Include merged pull requests.
 * @param {boolean} variables.includeDiscussions Include discussions.
 * @param {boolean} variables.includeDiscussionsAnswers Include discussions answers.
 * @param {string|undefined} variables.startTime Time to start the count of total commits.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 *
 * @description This function supports multi-page fetching if the 'FETCH_MULTI_PAGE_STARS' environment variable is set to true.
 */
const statsFetcher = async ({
  username,
  includeMergedPullRequests,
  includeDiscussions,
  includeDiscussionsAnswers,
  startTime,
}) => {
  let accumulated = null;
  let hasNextPage = true;
  let endCursor = null;

  while (hasNextPage) {
    const variables = {
      login: username,
      first: 100,
      after: endCursor,
      includeMergedPullRequests: Boolean(includeMergedPullRequests),
      includeDiscussions: Boolean(includeDiscussions),
      includeDiscussionsAnswers: Boolean(includeDiscussionsAnswers),
      startTime,
    };

    // Let retryer pick PAT_1, PAT_2, …
    // retryer is expected to call fetcher(variables, token)
    const res = await retryer(fetcher, variables);

    // Defensive checks
    if (!res || !res.data) {
      throw new CustomError(
        "Empty response from GitHub API",
        CustomError.GRAPHQL_ERROR,
      );
    }

    // If GraphQL returned errors, bubble them up to caller (handler will format)
    if (res.data.errors) {
      return res;
    }

    const user = res.data.data && res.data.data.user;
    if (!user || !user.repositories) {
      // Return the response so caller can handle NOT_FOUND or other GraphQL errors
      return res;
    }

    const repoField = res.data.data.user.repositories;
    const repoNodes = Array.isArray(repoField.nodes) ? repoField.nodes : [];

    if (!accumulated) {
      // Create a fresh accumulator to avoid mutating the original response object
      accumulated = {
        data: {
          data: {
            user: {
              ...user,
              repositories: {
                totalCount: repoField.totalCount,
                nodes: [...repoNodes],
                pageInfo: repoField.pageInfo,
              },
            },
          },
        },
      };
    } else {
      accumulated.data.data.user.repositories.nodes.push(...repoNodes);
      // update pageInfo for next iteration
      accumulated.data.data.user.repositories.pageInfo = repoField.pageInfo;
    }

    const repoNodesWithStars = repoNodes.filter(
      (node) => node && node.stargazers && node.stargazers.totalCount !== 0,
    );

    hasNextPage =
      process.env.FETCH_MULTI_PAGE_STARS === "true" &&
      repoNodes.length === repoNodesWithStars.length &&
      Boolean(repoField.pageInfo && repoField.pageInfo.hasNextPage);

    endCursor = repoField.pageInfo ? repoField.pageInfo.endCursor : null;
  }

  return accumulated;
};

/**
 * Fetch total commits using the REST API.
 *
 * @param {object} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 *
 * @see https://developer.github.com/v3/search/#search-commits
 */
const fetchTotalCommits = (variables, token) => {
  return axios({
    method: "get",
    url: `https://api.github.com/search/commits?q=author:${variables.login}`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github.cloak-preview",
      Authorization: `token ${token}`,
    },
  });
};

/**
 * Fetch all the commits for all the repositories of a given username.
 *
 * @param {string} username GitHub username.
 * @returns {Promise<number>} Total commits.
 *
 * @description Done like this because the GitHub API does not provide a way to fetch all the commits. See
 * #92#issuecomment-661026467 and #211 for more information.
 */
const totalCommitsFetcher = async (username) => {
  if (!githubUsernameRegex.test(username)) {
    logger.log("Invalid username provided.");
    throw new Error("Invalid username provided.");
  }

  let res;
  try {
    // retryer will inject the token as the second argument to fetchTotalCommits
    res = await retryer(fetchTotalCommits, { login: username });
  } catch (err) {
    logger.log(err);
    throw new Error(err);
  }

  const totalCount = Number(res?.data?.total_count);
  if (Number.isNaN(totalCount)) {
    throw new CustomError(
      "Could not fetch total commits.",
      CustomError.GITHUB_REST_API_ERROR,
    );
  }
  return totalCount;
};

/**
 * Fetch stats for a given username.
 *
 * @param {string} username GitHub username.
 * @param {boolean} include_all_commits Include all commits.
 * @param {string[]} exclude_repo Repositories to exclude.
 * @param {boolean} include_merged_pull_requests Include merged pull requests.
 * @param {boolean} include_discussions Include discussions.
 * @param {boolean} include_discussions_answers Include discussions answers.
 * @param {number|undefined} commits_year Year to count total commits
 * @returns {Promise<import("./types").StatsData>} Stats data.
 */
const fetchStats = async (
  username,
  include_all_commits = false,
  exclude_repo = [],
  include_merged_pull_requests = false,
  include_discussions = false,
  include_discussions_answers = false,
  commits_year,
) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  const stats = {
    name: "",
    totalPRs: 0,
    totalPRsMerged: 0,
    mergedPRsPercentage: 0,
    totalReviews: 0,
    totalCommits: 0,
    totalIssues: 0,
    totalStars: 0,
    totalDiscussionsStarted: 0,
    totalDiscussionsAnswered: 0,
    contributedTo: 0,
    rank: { level: "C", percentile: 100 },
  };

  const res = await statsFetcher({
    username,
    includeMergedPullRequests: include_merged_pull_requests,
    includeDiscussions: include_discussions,
    includeDiscussionsAnswers: include_discussions_answers,
    startTime: commits_year ? `${commits_year}-01-01T00:00:00Z` : undefined,
  });

  // If GraphQL returned errors, handle them
  if (!res || !res.data) {
    throw new CustomError(
      "Something went wrong while trying to retrieve the stats data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  if (res.data.errors) {
    logger.error(res.data.errors);
    if (res.data.errors[0] && res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (res.data.errors[0] && res.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(res.data.errors[0].message, 90, 1)[0],
        res.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the stats data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const user = res.data.data.user;

  if (!user) {
    throw new CustomError("User data missing from GitHub response", CustomError.GRAPHQL_ERROR);
  }

  stats.name = user.name || user.login;

  // if include_all_commits, fetch all commits using the REST API.
  if (include_all_commits) {
    stats.totalCommits = await totalCommitsFetcher(username);
  } else {
    stats.totalCommits = user.commits ? user.commits.totalCommitContributions : 0;
  }

  stats.totalPRs = user.pullRequests ? user.pullRequests.totalCount : 0;
  if (include_merged_pull_requests && user.mergedPullRequests) {
    stats.totalPRsMerged = user.mergedPullRequests.totalCount;
    stats.mergedPRsPercentage =
      (user.mergedPullRequests.totalCount / (user.pullRequests?.totalCount || 1)) * 100 || 0;
  }
  stats.totalReviews = user.reviews ? user.reviews.totalPullRequestReviewContributions : 0;
  stats.totalIssues =
    (user.openIssues ? user.openIssues.totalCount : 0) +
    (user.closedIssues ? user.closedIssues.totalCount : 0);
  if (include_discussions && user.repositoryDiscussions) {
    stats.totalDiscussionsStarted = user.repositoryDiscussions.totalCount;
  }
  if (include_discussions_answers && user.repositoryDiscussionComments) {
    stats.totalDiscussionsAnswered = user.repositoryDiscussionComments.totalCount;
  }
  stats.contributedTo = user.repositoriesContributedTo
    ? user.repositoriesContributedTo.totalCount
    : 0;

  // Retrieve stars while filtering out repositories to be hidden.
  const allExcludedRepos = [...exclude_repo, ...excludeRepositories].map((r) =>
    String(r || "").toLowerCase(),
  );
  const repoToHide = new Set(allExcludedRepos);

  const repoNodes = Array.isArray(user.repositories?.nodes) ? user.repositories.nodes : [];

  stats.totalStars = repoNodes
    .filter((data) => {
      if (!data || !data.name) return false;
      return !repoToHide.has(String(data.name).toLowerCase());
    })
    .reduce((prev, curr) => {
      const count = curr?.stargazers?.totalCount || 0;
      return prev + count;
    }, 0);

  stats.rank = calculateRank({
    all_commits: include_all_commits,
    commits: stats.totalCommits,
    prs: stats.totalPRs,
    reviews: stats.totalReviews,
    issues: stats.totalIssues,
    repos: user.repositories ? user.repositories.totalCount : 0,
    stars: stats.totalStars,
    followers: user.followers ? user.followers.totalCount : 0,
  });

  return stats;
};

export { fetchStats };
export default fetchStats;