---
'@bieberkit/auth': minor
---

Add API keys. `createAuth` gets `apiKeys` (the plugin `@better-auth/api-key`, the table `auth_api_keys` as steps 0.4.0), and `createApiKey` and `revokeApiKey` make and revoke a key in one transaction with its audit entry and its outbox event. A key is shown once, stored hashed, expires, and carries its permissions and its tenant. The authenticator reads `X-API-Key` and a `Bearer bk_...` token, the tenant resolver gives the tenant of the key, and the authorizer builds the ability from the permissions of the key and not from roles. The routes of Better Auth for keys are not served.
