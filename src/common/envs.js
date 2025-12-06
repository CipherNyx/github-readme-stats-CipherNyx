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

/**
 * GitHub Personal Access Token.
 * Supports multiple tokens (PAT_1, PAT_2, …) or a single PAT/GITHUB_TOKEN.
 */
export const githubToken =
  process.env.PAT ||
  process.env.GITHUB_TOKEN ||
  process.env.PAT_1 ||
  process.env.PAT_2 ||
  null;

export { whitelist, gistWhitelist, excludeRepositories, githubToken };