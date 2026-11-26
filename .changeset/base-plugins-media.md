---
'@bieberkit/plugin-media': minor
'@bieberkit/testing': minor
'create-bieberkit': patch
---

<!--
  BieberKit

  @file        .changeset/base-plugins-media.md
  @description Changeset for slice S4 of the base plugins: media files of a tenant with fixed visibility, read URLs, deletion after commit, folders, filters and limits.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
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

Media is complete on the API side (MED-01 to MED-08). Files belong to a tenant and live at `<visibility>/<tenant>/media/<id>/<filename>`. The visibility is fixed when the record is made. `GET .../:id/url` gives a public URL, a signed URL, or on a disk that cannot sign the new `GET .../:id/content` stream. Deleting a record removes its object after commit through the outbox, and a scheduled job removes files left `pending` after `MEDIA_PENDING_TTL_HOURS`. Confirm stores a SHA-256 checksum, keeps refused uploads as `rejected` and emits `media.file.confirmed`. Files have `alt`, `description`, folders (`/api/v1/media/folders`, at most 8 deep) and tags. The list filters by name prefix, kind, folder, status, visibility, size and creation, and the size, type and tenant quota limits are checked before a signed URL is given.

`createTestApp` takes `disk`, the options of its memory disk.

Breaking for clients of the thin slice: the generated entity routes of `media.Media` are replaced by the plugin's own routes. Their paths stay, the body of create takes only the fields above, and `PATCH` changes metadata only. `pathOf` now takes the tenant. A refused upload is `rejected`, not `pending`.
