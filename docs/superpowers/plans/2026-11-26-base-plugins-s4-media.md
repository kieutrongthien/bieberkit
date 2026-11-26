<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-26-base-plugins-s4-media.md
  @description Implementation plan for slice S4 of the complete base plugins: media visibility, read URLs, deletion after commit, metadata, folders, filters and limits.
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

# M1.11 slice S4: media (MED-01..08)

## Context

S1 to S3 are in local `main` (c90bf7e). S4 has no gate. Today `plugins/media` is one entity with generated list, get, create and delete, plus `upload-url` and `confirm`. It is not tenant-scoped, it keeps a `pending` row when the bytes are refused, and deleting a record leaves its object in the bucket. The design is `docs/modules/base-plugins-complete.md`, section `media`.

## Decisions (builder's, per "Left to the builder")

- **Thin routes over a `media` service** (MOD-16, as in `users`). The entities have no generated routes: the rules (fixed file fields, limits, the deletion event with the path) are more than the generated routes express. Each mutation writes its audit entry `media.file.<verb>` or `media.folder.<verb>` in its transaction (BPL-05).
- **Tenant**: `media.Media` and `media.Folder` are tenant entities (DATA-09). The object path is `<tenant>/media/<id>/<filename>` on the root storage, so the key is `<visibility>/<tenant>/media/<id>/<filename>` (OPS-04 layout; the download audit of OPS-04 stays in S6).
- **Columns of `bk_media`**: `filename` (a safe storage segment), `nameKey` (lower case filename, indexed, for `q`), `contentType` (the declared type until confirm, then the type the storage verified, S-06), `kind`, `size`, `status` (`pending`, `ready`, `rejected`), `visibility`, `alt`, `description`, `folderId`, `checksum`, `tags` feature (MOD-13).
- **MED-01**: `visibility` is given on create (default `private`) and never changed; `PATCH` refuses it (schema, `additionalProperties: false`).
- **MED-02**: `GET /:id/url` answers `{ url, expiresAt }`: the public URL (no expiry) for a public file; a signed URL for a private file on a signing disk; on a disk that cannot sign, the URL of `GET /:id/content`, which streams the file with its verified type, `nosniff` and `attachment`. A file that is not `ready` is `MEDIA_NOT_READY` (409).
- **MED-03**: `DELETE /:id` removes the row and emits `media.file.deleted` with the path in its transaction. A subscription maps it to the job `media.delete-object` (10 attempts; a final failure leaves the job `dead` and is reported). The job `media.prune-pending`, on `41 * * * *`, deletes rows still `pending` after `MEDIA_PENDING_TTL_HOURS` (default 24) through the same event. Hours in the key name, as `USERS_INVITE_TTL_DAYS`.
- **MED-04**: on confirm the service streams the object and stores its SHA-256 (hex), outside the transaction. `PATCH` takes `alt`, `description`, `folderId` only.
- **MED-05**: `bk_media_folders`: `parentId`, `name`, `depth` (1 to 8), unique on tenant, parent key and name (`parentKey` is the parent id or the nil uuid, since a NULL is never equal in a unique index). Routes: list by parent, create, rename (`PATCH name`), delete. Moving a folder is not in S4. Errors: `MEDIA_FOLDER_NOT_EMPTY` (409), `MEDIA_FOLDER_TOO_DEEP` (422), `MEDIA_FOLDER_NAME_TAKEN` (409), `MEDIA_FOLDER_NOT_FOUND` (404).
- **MED-06**: `GET /api/v1/media/media` with `q`, `kind`, `folderId`, `status`, `visibility`, `sizeMin`, `sizeMax`, `createdFrom`, `createdTo`; newest first by the UUIDv7 id, keyset cursor, page at most 100, `withTotal` (BPL-06).
- **MED-07**: `MEDIA_MAX_SIZE_MB` (default 25), `MEDIA_ALLOWED_TYPES` (comma-separated MIME types; default the images, PDF, text, CSV and Office types of the storage's list), `MEDIA_TENANT_QUOTA_MB` (optional). Checked on create and again on `upload-url`: `MEDIA_TOO_LARGE` (413), `MEDIA_TYPE_REFUSED` (422), `MEDIA_QUOTA_EXCEEDED` (422). The quota counts `pending` and `ready` files of the tenant. The storage policy still applies on top.
- **MED-08**: confirm emits `media.file.confirmed` `{ id, path }`. Refused bytes set `rejected` (audited `media.file.rejected`) and answer the storage's `STORAGE_UPLOAD_REJECTED` (422). Confirming a file that is not `pending` is `MEDIA_NOT_PENDING` (409); `upload-url` of one keeps `MEDIA_ALREADY_READY` (409).
- **Test app**: `createTestApp({ disk })` takes the options of the memory disk (default `signing: true`), so a case can use a disk with a public URL or one that cannot sign.
- **Jobs reach the storage** through the service factory, as the notifier does (`MEDIA_NOT_READY_TO_RUN` when a job runs first).

## Tasks

1. Tests first, under `describeDialects` with `createTestApp`: MED-01 to MED-08, BPL-05, BPL-06, the tenant boundary and "no storage call inside a transaction".
2. Testing: the `disk` option.
3. Plugin: entities, service, jobs, subscription, schedule, routes, env keys, scaffolder index.
4. Docs: spec section 12.5, module spec status, `docs/modules/plugins.md`, manifests, changeset, roadmap. Then the full battery.
