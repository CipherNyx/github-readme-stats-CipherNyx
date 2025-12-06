// api/_utils/guard.js
function isAllowedUser(req) {
  const raw = process.env.ALLOWED_USERS || "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const username = String(req.query.username || "").toLowerCase();
  return allowed.includes(username);
}

function requireTokenIfEnabled(req) {
  const require = String(process.env.REQUIRE_TOKEN || "false").toLowerCase() === "true";
  if (!require) return true;
  const token = process.env.ACCESS_TOKEN || "";
  return token && req.query.token === token;
}

function svgForbidden(message = "Forbidden") {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="450" height="120" role="img">
  <title>${message}</title>
  <rect width="100%" height="100%" fill="#1a1b27"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial, sans-serif"
        font-size="18" fill="#ff6b6b">
    ${message}
  </text>
</svg>`.trim();
}

module.exports = { isAllowedUser, requireTokenIfEnabled, svgForbidden };