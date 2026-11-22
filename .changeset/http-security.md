---
'@bieberkit/http': minor
---

Add the security layer of the HTTP server: security headers on every answer (a strict policy for a JSON API, nosniff, referrer and permissions policies, and HSTS in production), a CORS allowlist of exact origins with answers to preflights before authentication, CSRF protection for signed in browsers (Fetch Metadata first, then a token signed with HMAC and bound to the session, from `createCsrf` and `GET /api/v1/csrf`), and `createHttpFetch`, an outbound fetch that refuses private, loopback and metadata addresses, pins the connection to the address that it checked, follows redirects with the same checks, times out, retries only what is idempotent, and opens a circuit for each host that fails. A `Principal` can say `via` and `sessionId`.
