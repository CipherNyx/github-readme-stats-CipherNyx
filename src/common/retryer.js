// src/common/retryer.js
// @ts-check

import { CustomError } from "./error.js";
import { logger } from "./log.js";

/**
 * Build ordered token list:
 *  - PAT_1, PAT_2, ... (in numeric order)
 *  - then PAT (legacy)
 *  - then GITHUB_TOKEN (legacy)
 */
const patKeys = Object.keys(process.env)
  .filter((k) => /^PAT_\d+$/.test(k))
  .sort((a, b) => {
    // sort PAT_1, PAT_2, ... numerically
    const ai = Number(a.split("_")[1]);
    const bi = Number(b.split("_")[1]);
    return ai - bi;
  });

const tokens = [
  ...patKeys.map((k) => process.env[k]).filter(Boolean),
  process.env.PAT || null,
  process.env.GITHUB_TOKEN || null,
].filter(Boolean);

/** Number of retries = number of tokens (or 7 in test mode). */
const RETRIES = process.env.NODE_ENV === "test" ? 7 : tokens.length;

/**
 * @typedef {import("axios").AxiosResponse} AxiosResponse
 * @typedef {(variables: any, token: string, attempt?: number) => Promise<AxiosResponse>} FetcherFunction
 */

/**
 * Try to execute the fetcher function until it succeeds or the max number of retries is reached.
 *
 * @param {FetcherFunction} fetcher The fetcher function.
 * @param {any} variables Object with arguments to pass to the fetcher function.
 * @returns {Promise<AxiosResponse>} The response from the fetcher function.
 */
const retryer = async (fetcher, variables) => {
  if (!RETRIES) {
    throw new CustomError("No GitHub API tokens found", CustomError.NO_TOKENS);
  }

  // Safe debug: log presence/count only (do not log token values)
  logger.log(`retryer: token count = ${RETRIES}`);

  // Iteratively try each token (or up to RETRIES attempts in test mode)
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    // pick token for this attempt; if in test mode and tokens array is empty,
    // token will be undefined which will cause fetcher to fail (test harness may mock)
    const token = tokens[attempt % tokens.length];

    try {
      // fetcher must accept (variables, token, attempt)
      const response = await fetcher(variables, token, attempt);

      // Check for GraphQL rate limit errors in response body
      const errors = response?.data?.errors;
      const errorType = errors?.[0]?.type;
      const errorMsg = errors?.[0]?.message || "";
      const isRateLimited =
        (errors && errorType === "RATE_LIMITED") || /rate limit/i.test(errorMsg);

      if (isRateLimited) {
        logger.log(`retryer: token #${attempt + 1} rate-limited, trying next token`);
        // continue to next attempt
        continue;
      }

      // Successful or non-rate-limit response — return it
      return response;
    } catch (err) {
      const e = /** @type {any} */ (err);

      // If there's no HTTP response (network error), bubble up
      if (!e?.response) {
        throw e;
      }

      const message = e?.response?.data?.message || "";

      const isBadCredential = message === "Bad credentials";
      const isAccountSuspended = message === "Sorry. Your account was suspended.";

      if (isBadCredential || isAccountSuspended) {
        logger.log(`retryer: token #${attempt + 1} invalid or suspended, trying next token`);
        // try next token
        continue;
      }

      // For other HTTP errors, return the response so caller can handle it
      return e.response;
    }
  }

  // If we exhausted attempts
  throw new CustomError(
    "Downtime due to GitHub API rate limiting or invalid tokens",
    CustomError.MAX_RETRY,
  );
};

export { retryer, RETRIES };
export default retryer;