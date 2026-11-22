---
'@bieberkit/data': minor
'@bieberkit/http': minor
---

Add aggregations. `@bieberkit/data` gets the field modifier `.aggregatable()` and `aggregate()`, which counts and sums rows by group through the filters of the entity manager (tenant and soft delete) and orders the groups the same way on every database. `@bieberkit/http` gets `GET /<resource>/aggregate` for an entity with an aggregatable field, with the filters of a list, field masks and an ETag, and `_meta` marks the fields that can be aggregated.
