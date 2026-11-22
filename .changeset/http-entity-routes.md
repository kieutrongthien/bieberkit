---
'@bieberkit/http': minor
'@bieberkit/data': minor
---

Add `registerEntityRoutes` and `entityRoutes` to `@bieberkit/http`: list, get, create, update and delete routes from the `api` options of an entity, with paging by `page` or `cursor`, `sort`, `filter[field][op]`, `include`, `fields` and `locale`, ETag and `If-None-Match`, `If-Match` on update and delete (428 without it, 412 with the current row for a stale one), and an event and an audit entry in the transaction of every write. A body is normalized to NFC before it is validated, and a unique or foreign key violation answers 409. `@bieberkit/data/orm` gets `ListOptions.offset`, `entityEventName` and `entityOfSchema`, a `null` filter on a compared field, and `expectVersion` takes any object.
