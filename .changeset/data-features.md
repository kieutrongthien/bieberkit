---
'@bieberkit/data': minor
---

Add the record features of `features: [...]` under `@bieberkit/data/orm`: comments, tags, attachments and timeline on four generic tables (`addComment`, `listComments`, `deleteComment`, `addTag`, `listTags`, `removeTag`, `addAttachment`, `listAttachments`, `removeAttachment`, `addTimeline`, `listTimeline`). Each call loads the record under the tenant and soft delete filters and writes the tenant of the record, never the caller's. Tags are case insensitive on every database, and `transition` adds a timeline entry when the entity has one.
