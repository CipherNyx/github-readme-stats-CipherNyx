// src/common/http.js
// @ts-check

import axios from "axios";

/**
 * Send GraphQL request to GitHub API.
 *
 * @param {import('axios').AxiosRequestConfig['data']} data Request data (e.g., { query, variables }).
 * @param {import('axios').AxiosRequestConfig['headers']} headers Request headers (e.g., { Authorization: 'bearer ...' }).
 * @param {{ url?: string, timeoutMs?: number }} [opts] Optional overrides.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const request = async (data, headers = {}, opts = {}) => {
  const url = opts.url || "https://api.github.com/graphql";
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 10000;

  // Default headers but allow caller to override
  const defaultHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const mergedHeaders = { ...defaultHeaders, ...headers };

  try {
    const response = await axios({
      url,
      method: "post",
      headers: mergedHeaders,
      data,
      timeout: timeoutMs,
    });
    return response;
  } catch (err) {
    // Normalize network/timeout errors so callers can handle them consistently
    const e = /** @type {any} */ (err);
    if (e.code === "ECONNABORTED") {
      // timeout
      throw new Error("Request timed out");
    }
    if (!e.response) {
      // network or other unexpected error
      throw new Error(e.message || "Network error while calling GitHub API");
    }
    // HTTP error response — rethrow the axios error so callers can inspect e.response
    throw e;
  }
};

export { request };