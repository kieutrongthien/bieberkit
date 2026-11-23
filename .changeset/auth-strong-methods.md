---
'@bieberkit/auth': minor
'@bieberkit/http': minor
---

Add the strong sign in methods. `@bieberkit/auth` gets `methods` in `createAuth` (TOTP with backup codes, passkeys with `@better-auth/passkey`, the magic link), the tables `auth_two_factors` and `auth_passkeys` as steps 0.3.0, `__Host-` names for every cookie of Better Auth, `previousSecrets` for the rotation of the secret, limits on the magic link and on the second factor, audit entries for the new flows, and MFA for the roles flagged `requireMfa` (403 `AUTH_MFA_REQUIRED`). `@bieberkit/http` gets `Principal.mfa`, `Principal.grants` and `Principal.tenantId`.
