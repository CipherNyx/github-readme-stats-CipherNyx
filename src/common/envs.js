// src/common/envs.js
// @ts-check

const toArray = (str, { lowercase = false } = {}) =>
  (str || "")
    .split(",")
    .map((s) => (lowercase ? s.trim().toLowerCase() : s.trim()))
    .filter(Boolean);

// Whitelist of usernames/orgs allowed
const whitelist = toArray(process.env.WHITELIST || "", { lowercase: true });

// Whitelist of gist IDs allowed
const gistWhitelist = toArray(process.env.GIST_WHITELIST || "");

// Repositories to exclude from stats
const excludeRepositories = toArray(process.env.EXCLUDE_REPO || "");

// Count PAT_N environment variables and expose helper to get them
const patKeys = Object.keys(process.env).filter((k) => /^PAT_\d+$/.test(k));
const PAT_COUNT = patKeys.length;

/**
 * Get PAT by 1-based index. Returns null if not found.
 * @param {number} idx 1-based index
 * @returns {string|null}
 */
function getPatByIndex(idx) {
  if (!Number.isInteger(idx) || idx < 1) return null;
  return process.env[`PAT_${idx}`] || null;
}

// Primary token selection precedence
// Prefer PAT_1, then PAT_2, ..., then PAT, then GITHUB_TOKEN
let githubToken = null;
if (process.env.PAT_1) {
  githubToken = process.env.PAT_1;
} else if (PAT_COUNT > 0) {
  // fallback to first PAT_N if PAT_1 not present but others exist
  githubToken = getPatByIndex(1);
} else if (process.env.PAT) {
  githubToken = process.env.PAT;
} else if (process.env.GITHUB_TOKEN) {
  githubToken = process.env.GITHUB_TOKEN;
}

export {
  toArray,
  whitelist,
  gistWhitelist,
  excludeRepositories,
  githubToken,
  PAT_COUNT,
  getPatByIndex,
};