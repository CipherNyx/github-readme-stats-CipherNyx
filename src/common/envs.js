// src/common/envs.js
// @ts-check

/**
 * Utility: convert comma-separated env var to array.
 * Trims whitespace and optionally lowercases entries.
 */
const toArray = (str, { lowercase = false } = {}) =>
  (str || "")
    .split(",")
    .map((s) => (lowercase ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean);

/**
 * Whitelist of usernames/orgs allowed.
 * Example env: WHITELIST="CipherNyx,Universal-Coding-Experiments"
 */
const whitelist = process.env.WHITELIST
  ? toArray(process.env.WHITELIST, { lowercase: true })
  : undefined;

/**
 * Whitelist of gist IDs allowed.
 * Example env: GIST_WHITELIST="abcd1234,efgh5678"
 */
const gistWhitelist = process.env.GIST_WHITELIST
  ? toArray(process.env.GIST_WHITELIST)
  : undefined;

/**
 * Repositories to exclude from stats.
 * Example env: EXCLUDE_REPO="repo1,repo2"
 */
const excludeRepositories = process.env.EXCLUDE_REPO
  ? toArray(process.env.EXCLUDE_REPO)
  : [];

export { whitelist, gistWhitelist, excludeRepositories };