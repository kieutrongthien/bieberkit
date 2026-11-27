<!--
  BieberKit

  @file        docs/adr/0036-file-fields.md
  @description Decision record: a file or image field holds the id of a media record, the browser sends the file to the storage with a signed URL, and the policy of the admin names that one origin.
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

# 0036. A file field holds the id of a media record, and the browser sends the file to the storage

- Status: Accepted
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: UI-11, API-03, MED-01, MED-02, MED-07, SEC-01, S-02, P1, P9, PKG-01

## Context

UI-11 asks for "file and image fields with direct upload". The media plugin already has what an upload needs: a record (`POST /api/v1/media`), a signed upload URL (`POST /:id/upload-url`), a confirm that checks the bytes (`POST /:id/confirm`), and a signed read URL (`GET /:id/url`). API-03 says that a file goes straight to the storage and never through the API. What is missing is the field of an entity, the check on a write, and the part of the browser.

Constraints:

- **Layers (PKG-01).** `@bieberkit/http` and `@bieberkit/data` are below the media plugin. The media entity is hand written and has no `EntityDef`, so a relation to it (`f.belongsTo`) is not possible.
- **Policy of the admin (SEC-01).** `connect-src 'self'` and `img-src 'self' data:` stop a browser from sending a file to a bucket or showing a picture from it.
- **The local disk cannot sign** (`STORAGE_SIGNING_UNSUPPORTED`). Only the S3 disk can take an upload from a browser.

## Options

| Option                                                                                             | For                                                                                                                 | Against                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A. A string of 36 characters with the widget `file` or `image`; the write asks the `media` service | No new kind of field (the compiler, the schema, the mapper and the metadata are unchanged); no import of the plugin | The name `media` of the service is a convention that `http` reads at run time                           |
| B. A new field kind `media` and a relation to the media table                                      | A foreign key, and the database says that the file exists                                                           | A table of a plugin in the schema of another (PLG-02); a new kind in every switch of the framework (P1) |
| C. The bytes in the row, or a data URL                                                             | No plugin                                                                                                           | Breaks API-03; a row of megabytes; no quota, no scan, no signed URL                                     |
| D. A route of the API that takes the bytes, for the local disk                                     | The local disk works                                                                                                | A second way to upload (P1); a body limit above 1 MB for one route; the API carries files               |

## Decision

Option A. The rest follows.

1. **The field.** `f.file({ accept })` and `f.image({ accept })` are a string of 36 characters, with `admin: { widget: 'file' | 'image', accept }`. `accept` is a list of media types, each `type/subtype` or `type/*` (`image/*` for an image by default). The value is the id of a media record, or `null` for an optional field. `_meta` gives `widget` and `accept`.
2. **The check.** Before a create or an update opens its transaction, the route reads the files that the body names through the service `media` of the container (the media plugin registers it). A file must exist for the tenant (a file that is not there and a file of another tenant are the same answer), be `ready`, and be of a type that `accept` takes. A refusal is a `400` at the field (`body.<key>`), all the files that are wrong together. A record that names a file when no `media` service is registered is `500` `HTTP_MEDIA_MISSING`. The check is before the transaction because the service opens its own.
3. **The upload.** The admin makes the record, asks for the signed URL, sends the bytes to it with the headers that were signed and no cookie, confirms, and holds the id. It uses the routes that exist. A disk that cannot sign gives `STORAGE_SIGNING_UNSUPPORTED`, which the widget says in words: files need an S3 disk. Option D is not built.
4. **The policy.** When `STORAGE_DISK` is `s3`, the origin of the bucket is added to `connect-src` and `img-src` of the admin, and to no other directive: the endpoint with a path style, the bucket in the host of the endpoint with a virtual style, and `<bucket>.s3.<region>.amazonaws.com` without an endpoint. The local disk adds nothing.

## Consequences

- **Easier.** Any entity of any plugin can have a file with one line, and the field is in the form, in `_meta`, in OpenAPI and in the types as a string.
- **Harder.** The database does not hold the guarantee: a file that is removed from the library later leaves an id that points at nothing, and a read of the record shows a name that is missing (the widget shows the id). A follow-up can have the media plugin refuse to remove a file that a record names, or clear it, through the outbox.
- **Not tested here.** The upload against a real S3 or MinIO. The tests cover the sequence of calls with the storage played by the page, the checks of the server with a fake media service, and the policy. The first run against a bucket is a manual check.
- **Ruled out.** Bytes in the API, a table of the media plugin in another schema, and a new kind of field.

## Spec changes

- UI-11: the file and image fields hold the id of a media record, and the admin sends the file to the storage with a signed URL.
- SEC-01: the policy of the admin names the origin of the bucket in `connect-src` and `img-src` when the disk is S3.
- Document history.
