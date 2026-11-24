---
'@bieberkit/data': minor
'@bieberkit/auth': minor
'@bieberkit/queue': minor
'@bieberkit/plugin-settings': minor
'@bieberkit/plugin-notifications': minor
'@bieberkit/plugin-media': minor
---

Every table that the framework or a first-party plugin owns now starts with `bk_` (ADR 0027, DATA-28): `bk_migrations`, `bk_outbox`, `bk_audit_log`, `bk_auth_users` and the other auth tables, `bk_settings`, `bk_notifications`, `bk_media`. The indexes and constraints follow. Nothing is released, so a database made by a development build is made again.
