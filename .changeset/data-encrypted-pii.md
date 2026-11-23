---
'@bieberkit/data': minor
'@bieberkit/core': minor
'@bieberkit/http': minor
---

Add encrypted and personal data fields. `@bieberkit/data` gets the field modifiers `.encrypted()` (AES-256-GCM at rest, a key for each field from `APP_KEY`, a value that names its key, `createDatabase({ encryption })`, `useEncryptionKeys` and `reencryptAll` for the rotation with `APP_KEY_PREVIOUS`) and `.pii()`, with `piiFields` for the data inventory, `redactPii`, and `recordAudit({ piiOf })`. `@bieberkit/core` gets `redactKeys` in `createLogger`. `@bieberkit/http` marks `pii` and `encrypted` fields in `/api/v1/_meta`.
