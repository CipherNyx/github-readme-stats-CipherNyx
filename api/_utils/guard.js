// api/_utils/guard.js
// ESM version to match src/common/envs.js
// @ts-check

import { whitelist as WHITELIST_FROM_ENV } from "../../src/common/envs.js";

/** Escape text for safe SVG insertion */
const escapeSvgText = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Normalize and cache whitelist (already lowercased by envs.js) */
const WHITELIST = Array.isArray(WHITELIST_FROM_ENV)
  ? WHITELIST_FROM_ENV
  : [];

/**
 * Check if the request's username is allowed.
 * If WHITELIST is empty, allow all usernames.
 * @param {import("http").IncomingMessage & { query?: Record<string, any>; headers?: Record<string, any> }} req
 * @returns {boolean}
 */
export function isAllowedUser(req) {
  const username = String(req?.query?.username || "").trim().toLowerCase();
  if (!username) return false;
  if (WHITELIST.length === 0) return true; // no whitelist configured -> allow all
  return WHITELIST.includes(username);
}

/**
 * If token gating is enabled, verify provided token.
 * Accepts x-access-token header or `token` query parameter as fallback.
 * @param {import("http").IncomingMessage & { query?: Record<string, any>; headers?: Record<string, any> }} req
 * @returns {boolean}
 */
export function requireTokenIfEnabled(req) {
  const REQUIRE_TOKEN =
    String(process.env.REQUIRE_TOKEN || "false").trim().toLowerCase() === "true";
  if (!REQUIRE_TOKEN) return true;

  const ACCESS_TOKEN = String(process.env.ACCESS_TOKEN || "").trim();
  if (!ACCESS_TOKEN) return false;

  const headerToken =
    (req?.headers?.["x-access-token"] || req?.headers?.["X-Access-Token"] || "") + "";
  const queryToken = String(req?.query?.token || "").trim();

  const provided = (headerToken || queryToken).trim();
  return provided && provided === ACCESS_TOKEN;
}

/**
 * Render a simple forbidden SVG response.
 * @param {string} [message]
 * @returns {string}
 */
export function svgForbidden(message = "Forbidden") {
  const safe = escapeSvgText(message);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="450" height="120" role="img" aria-label="${safe}">
  <title>${safe}</title>
  <rect width="100%" height="100%" fill="#1a1b27"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, sans-serif"
        font-size="18" fill="#ff6b6b">${safe}</text>
</svg>`.trim();
}