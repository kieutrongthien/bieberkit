<!--
  BieberKit

  @file        plugins/media/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/plugin-media.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm changeset version (license header normalized)
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# @bieberkit/plugin-media

## 0.3.0

### Minor Changes

- 1ba8b1a: Media is complete on the API side (MED-01 to MED-08). Files belong to a tenant and live at `<visibility>/<tenant>/media/<id>/<filename>`. The visibility is fixed when the record is made. `GET .../:id/url` gives a public URL, a signed URL, or on a disk that cannot sign the new `GET .../:id/content` stream. Deleting a record removes its object after commit through the outbox, and a scheduled job removes files left `pending` after `MEDIA_PENDING_TTL_HOURS`. Confirm stores a SHA-256 checksum, keeps refused uploads as `rejected` and emits `media.file.confirmed`. Files have `alt`, `description`, folders (`/api/v1/media/folders`, at most 8 deep) and tags. The list filters by name prefix, kind, folder, status, visibility, size and creation, and the size, type and tenant quota limits are checked before a signed URL is given.

  `createTestApp` takes `disk`, the options of its memory disk.

  Breaking for clients of the thin slice: the generated entity routes of `media.Media` are replaced by the plugin's own routes. Their paths stay, the body of create takes only the fields above, and `PATCH` changes metadata only. `pathOf` now takes the tenant. A refused upload is `rejected`, not `pending`.

- 34f5f66: Operations for an enterprise (OPS-01 to OPS-06). The mail and delete routes of the base plugins honor `Idempotency-Key`; a `DELETE` route may now be `idempotent`, and a 204 is replayed. Invitations and the audit export are limited per person (`limitActor`, `AUTH_ACTION_LIMITED`). `GET /api/v1/settings/export` and `POST /api/v1/settings/import?dryRun=true` carry settings between environments, with secrets left out. `MEDIA_AUDIT_DOWNLOADS=true` audits the reading of private files. New indexes keep the lists of users and of the audit log off full scans (data step 0.5.0, auth migration 0.7.0), and `@bieberkit/testing` exports `planOf`, `fullScans` and `analyze` for tests of a query plan. The lists of users, media and the audit log are tested at 100 000 rows on the three dialects.

### Patch Changes

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
- Updated dependencies [c90bf7e]
- Updated dependencies [34f5f66]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [7c9da65]
- Updated dependencies [301f5ab]
- Updated dependencies [28782a9]
- Updated dependencies [3bdd7f9]
- Updated dependencies [a0c784c]
- Updated dependencies [1aa0d82]
- Updated dependencies [0089e52]
  - @bieberkit/data@0.3.0
  - @bieberkit/core@0.3.0
  - @bieberkit/queue@0.3.0
  - @bieberkit/http@0.3.0
  - @bieberkit/storage@0.3.0

## 0.2.0

### Patch Changes

- @bieberkit/http@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
  - @bieberkit/storage@0.2.0
