---
'@bieberkit/auth': minor
---

Add the service of roles: `createRole`, `setRolePermissions`, `updateRole`, `deleteRole`, `assignRole` and `revokeRole`. Each change is one transaction with its audit entry and its outbox event, a change that changes nothing leaves nothing, and a system role is not changed.
