// src/common/access.js
// @ts-check

import { renderError } from "./render.js";
import { blacklist } from "./blacklist.js";
import { whitelist as WHITELIST_FROM_ENV, gistWhitelist as GIST_WHITELIST_FROM_ENV } from "./envs.js";

/**
 * Escape text for safe insertion into SVG-rendered error cards.
 * Keeps it minimal and safe.
 * @param {string} s
 * @returns {string}
 */
const escapeText = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Messages */
const NOT_WHITELISTED_USERNAME_MESSAGE = "This username is not whitelisted";
const NOT_WHITELISTED_GIST_MESSAGE = "This gist ID is not whitelisted";
const BLACKLISTED_MESSAGE = "This username is blacklisted";

/**
 * Normalize a comma-separated whitelist (already produced by envs.js, but safe-guard here).
 * @param {string[]|undefined} arr
 * @returns {string[]}
 */
const normalizeList = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean)
    : [];

/** Normalized whitelists (cached) */
const WHITELIST = normalizeList(WHITELIST_FROM_ENV);
const GIST_WHITELIST = normalizeList(GIST_WHITELIST_FROM_ENV);

/**
 * Guards access using whitelist/blacklist.
 *
 * @param {Object} args
 * @param {any} args.res The response object.
 * @param {string} args.id Resource identifier (username or gist id).
 * @param {"username"|"gist"|"wakatime"} args.type The type of identifier.
 * @param {{ title_color?: string, text_color?: string, bg_color?: string, border_color?: string, theme?: string }} args.colors Color options for the error card.
 * @returns {{ isPassed: boolean, result?: any }} The result object indicating success or failure.
 */
const guardAccess = ({ res, id, type, colors }) => {
  if (!["username", "gist", "wakatime"].includes(type)) {
    throw new Error('Invalid type. Expected "username", "gist", or "wakatime".');
  }

  const normalizedId = String(id || "").trim().toLowerCase();

  // Choose the appropriate whitelist
  const currentWhitelist = type === "gist" ? GIST_WHITELIST : WHITELIST;
  const notWhitelistedMsg = type === "gist" ? NOT_WHITELISTED_GIST_MESSAGE : NOT_WHITELISTED_USERNAME_MESSAGE;

  // If a whitelist is configured (non-empty), enforce it
  if (Array.isArray(currentWhitelist) && currentWhitelist.length > 0) {
    if (!normalizedId || !currentWhitelist.includes(normalizedId)) {
      const result = res.send(
        renderError({
          message: escapeText(notWhitelistedMsg),
          secondaryMessage: "Please deploy your own instance",
          renderOptions: {
            ...colors,
            show_repo_link: false,
          },
        }),
      );
      return { isPassed: false, result };
    }
    // Whitelisted — allow
    return { isPassed: true };
  }

  // No whitelist configured: apply blacklist for username type only
  if (type === "username") {
    const normalizedBlacklist = Array.isArray(blacklist)
      ? blacklist.map((s) => String(s || "").trim().toLowerCase())
      : [];

    if (normalizedId && normalizedBlacklist.includes(normalizedId)) {
      const result = res.send(
        renderError({
          message: escapeText(BLACKLISTED_MESSAGE),
          secondaryMessage: "Please deploy your own instance",
          renderOptions: {
            ...colors,
            show_repo_link: false,
          },
        }),
      );
      return { isPassed: false, result };
    }
  }

  // No whitelist and not blacklisted (or gist/wakatime) — allow
  return { isPassed: true };
};

export { guardAccess };