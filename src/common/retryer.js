// src/common/retryer.js
// @ts-check

import { CustomError } from "./error.js";
import { logger } from "./log.js";

// Count the number of GitHub API tokens available.
const PATs = Object.keys(process.env).filter((key) =>
  /^PAT_\d+$/.test(key),
).length;

// Number of retries = number of PATs (or 7 in test mode).
const RETRIES = process.env.NODE_ENV === "test" ? 7 : PATs;

/**
 * @typedef {import("axios").AxiosResponse} AxiosResponse Axios response.
 * @typedef {(variables: any, token: string, retriesForTests?: number) => Promise<AxiosResponse>} FetcherFunction
 */

/**
 * Try to execute the fetcher function until it succeeds or the max number of retries is reached.
 *
 * @param {FetcherFunction} fetcher The fetcher function.
 * @param {any} variables Object with arguments to pass to the fetcher function.
 * @param {number} retries How many times to retry (defaults to 0).
 * @returns {Promise<AxiosResponse>} The response from the fetcher function.
 */
const retryer = async (fetcher, variables, retries = 0) => {
  if (!RETRIES) {
    throw new CustomError("No GitHub API tokens found", CustomError.NO_TOKENS);
  }

  if (retries >= RETRIES) {
    throw new CustomError(
      "Downtime due to GitHub API rate limiting",
      CustomError.MAX_RETRY,
    );
  }

  // Pick the token for this attempt
  const token = process.env[`PAT_${retries + 1}`];

  try {
    const response = await fetcher(variables, token, retries);

    // Check for GraphQL rate limit errors
    const errors = response?.data?.errors;
    const errorType = errors?.[0]?.type;
    const errorMsg = errors?.[0]?.message || "";
    const isRateLimited =
      (errors && errorType === "RATE_LIMITED") || /rate limit/i.test(errorMsg);

    if (isRateLimited) {
      logger.log(`PAT_${retries + 1} exhausted`);
      return retryer(fetcher, variables, retries + 1);
    }

    return response;
  } catch (err) {
    const e = /** @type {any} */ (err);

    // Network/unexpected error → bubble up
    if (!e?.response) {
      throw e;
    }

    const isBadCredential = e?.response?.data?.message === "Bad credentials";
    const isAccountSuspended =
      e?.response?.data?.message === "Sorry. Your account was suspended.";

    if (isBadCredential || isAccountSuspended) {
      logger.log(`PAT_${retries + 1} invalid`);
      return retryer(fetcher, variables, retries + 1);
    }

    // Return HTTP error response for caller-side handling
    return e.response;
  }
};

export { retryer, RETRIES };
export default retryer;