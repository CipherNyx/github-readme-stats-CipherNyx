// src/fetchers/top-languages.js
// @ts-check

import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { excludeRepositories } from "../common/envs.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

/**
 * Top languages fetcher object.
 *
 * @param {any} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import("axios").AxiosResponse>} Languages fetcher response.
 */
const fetcher = (variables, token) => {
  // Query both user and organization in the same request. We'll prefer user result and
  // fallback to organization if user is null. This avoids an extra round-trip.
  return request(
    {
      query: `
      query topLangs($login: String!) {
        user: user(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
            totalCount
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        org: organization(login: $login) {
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
            totalCount
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

/**
 * @typedef {import("./types").TopLangData} TopLangData Top languages data.
 */

/**
 * Fetch top languages for a given username or organization.
 *
 * @param {string} username GitHub username or organization login.
 * @param {string[]} exclude_repo List of repositories to exclude.
 * @param {number} size_weight Weightage to be given to size.
 * @param {number} count_weight Weightage to be given to count.
 * @returns {Promise<TopLangData>} Top languages data.
 */
const fetchTopLanguages = async (
  username,
  exclude_repo = [],
  size_weight = 1,
  count_weight = 0,
) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  // Run the combined user/org query via retryer (retryer will inject token)
  const res = await retryer(fetcher, { login: username });

  // Defensive checks
  if (!res || !res.data) {
    throw new CustomError(
      "Empty response from GitHub API",
      CustomError.GRAPHQL_ERROR,
    );
  }

  if (res.data.errors) {
    logger.error(res.data.errors);
    if (res.data.errors[0] && res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user or organization.",
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
      "Something went wrong while trying to retrieve the language data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  // Prefer user result; fallback to org result
  const userNode = res.data.data?.user;
  const orgNode = res.data.data?.org;
  const repoContainer = userNode?.repositories || orgNode?.repositories;

  if (!repoContainer) {
    // If neither user nor org repositories are present, surface the original response
    // so caller can handle NOT_FOUND or other GraphQL messages.
    throw new CustomError(
      "Could not resolve to a User or Organization with the provided login.",
      CustomError.USER_NOT_FOUND,
    );
  }

  const repoNodes = Array.isArray(repoContainer.nodes) ? repoContainer.nodes : [];

  // Build exclusion set (lowercased) from both caller and env
  const allExcluded = [...(exclude_repo || []), ...(excludeRepositories || [])]
    .map((r) => String(r || "").trim().toLowerCase())
    .filter(Boolean);
  const excludedSet = new Set(allExcluded);

  // Filter out excluded repos and repos without languages
  const filteredRepos = repoNodes.filter((repo) => {
    if (!repo || !repo.name) return false;
    const repoName = String(repo.name).toLowerCase();
    if (excludedSet.has(repoName)) return false;
    return Array.isArray(repo.languages?.edges) && repo.languages.edges.length > 0;
  });

  // Aggregate languages across repositories
  /** @type {Record<string, { name: string; color?: string; size: number; count: number }>} */
  const langMap = {};

  for (const repo of filteredRepos) {
    // Use a Set to ensure each language is counted once per repo for 'count'
    const seenInThisRepo = new Set();
    const edges = Array.isArray(repo.languages.edges) ? repo.languages.edges : [];

    for (const edge of edges) {
      if (!edge || !edge.node || !edge.node.name) continue;
      const langName = String(edge.node.name);
      const langKey = langName; // preserve original casing for keys
      const size = Number(edge.size) || 0;
      const color = edge.node.color || undefined;

      if (!langMap[langKey]) {
        langMap[langKey] = { name: langName, color, size: 0, count: 0 };
      }

      // accumulate size
      langMap[langKey].size += size;

      // increment count once per repo per language
      if (!seenInThisRepo.has(langKey)) {
        langMap[langKey].count += 1;
        seenInThisRepo.add(langKey);
      }
    }
  }

  // Apply weights
  Object.keys(langMap).forEach((k) => {
    const entry = langMap[k];
    entry.size =
      Math.pow(entry.size, Number(size_weight) || 1) *
      Math.pow(entry.count, Number(count_weight) || 0);
  });

  // Sort by computed size descending and return an ordered object
  const sortedKeys = Object.keys(langMap).sort((a, b) => langMap[b].size - langMap[a].size);

  /** @type {Record<string, { name: string; color?: string; size: number; count: number }>} */
  const topLangs = {};
  for (const key of sortedKeys) {
    topLangs[key] = langMap[key];
  }

  return topLangs;
};

export { fetchTopLanguages };
export default fetchTopLanguages;