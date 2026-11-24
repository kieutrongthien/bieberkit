<!--
  BieberKit

  @file        docs/adr/0017-storage-disks.md
  @description ADR 0017: the storage sits on FlyDrive drivers behind a plain key-store disk, with visibility as a key prefix and content checked by sniffing.
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

# 0017. Storage disks: FlyDrive drivers, visibility as a prefix, content by sniffing

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and this one follows the requirements and the evidence above.
- Date: 2026-11-23
- Deciders: Bieber Kieu
- Requirements: S-01 to S-04, CFG-07, PKG-03, SEC-04, P9

## Context

The storage contract (spec 15.3) must keep private files by default (S-03), let a browser send a file straight to the bucket and let the API confirm it (S-01), check size, type by content and extension (S-02), and run on a local folder and on S3-compatible stores (S-04). The roadmap names FlyDrive. Reading FlyDrive 2.2.0 and testing it against MinIO shows what decides the shape:

1. Visibility is not per file on every driver. The `fs` driver has one visibility for the whole disk. The `s3` driver uses ACLs, which R2 and every bucket that turns ACLs off (the default of AWS since 2023) refuse.
2. `getSignedUploadUrl` of the `s3` driver signs `content-length` and nothing about the content type, and the AWS SDK adds a CRC32 of an empty body to a presigned upload, which S3 refuses for any file that is not empty.
3. `putStream` on S3 needs a length. A stream of unknown length needs `@aws-sdk/lib-storage`.
4. A missing key on the `fs` driver fails when the stream is read, not when it is opened.

## Options

| Option                                                               | For                                                         | Against                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| A. FlyDrive as it is, with ACLs for visibility                       | Least code of ours                                          | No per-file visibility on `local`, no ACL on R2 and on current buckets  |
| B. The AWS SDK and `node:fs` directly                                | Full control                                                | Two drivers of our own, and no GCS later                                |
| C. A plain key-store `Disk` on FlyDrive, with visibility as a prefix | The same behavior on every disk and without ACLs, GCS later | We write the policy, and we correct the S3 upload URL ourselves (below) |

## Decision

Option C. `@bieberkit/storage` defines `Disk`, a plain key store. The storage puts the rules in the key: `private/<path>` or `public/<path>`, `t/<tenantId>/` for a tenant. A bucket policy or a CDN serves `public/*` only, and the local disk serves its `public/` folder. `@bieberkit/storage/flydrive` is the only code that imports `flydrive` and the AWS SDK (PKG-03). On S3 it creates the client with `requestChecksumCalculation: 'WHEN_REQUIRED'`, and it builds the upload URL itself with `content-type` as a signed header, so a browser can send the size and the type that the policy gave, and nothing else (S-02). `confirmUpload` still reads what arrived, because a signature says nothing of the bytes. Content is checked by sniffing the first 64 KiB (`file-type`), against a list of extensions that has no `svg` and no `html`.

Streams on S3 are read into memory up to `maxBytes` (25 MiB by default) until a multipart upload is added, which needs `@aws-sdk/lib-storage` and its own ADR line.

Runtime dependencies added (P9):

| Package                         | Version  | Used by                       | License    | Maintainers (npm)     | Reason                                                       |
| ------------------------------- | -------- | ----------------------------- | ---------- | --------------------- | ------------------------------------------------------------ |
| `flydrive`                      | 2.2.0    | storage (`/flydrive` subpath) | MIT        | virk                  | The `fs` and `s3` drivers, and GCS later, behind the `Disk`  |
| `@aws-sdk/client-s3`            | 3.1169.0 | storage (`/flydrive` subpath) | Apache-2.0 | amzn-oss, aws-sdk-bot | The S3 client, a peer dependency of the `s3` driver          |
| `@aws-sdk/s3-request-presigner` | 3.1169.0 | storage (`/flydrive` subpath) | Apache-2.0 | amzn-oss, aws-sdk-bot | Signed read and upload URLs, a peer dependency of the driver |
| `file-type`                     | 22.3.0   | storage                       | MIT        | sindresorhus          | The type of a file from its first bytes (S-02)               |

The tree has 55 packages. Their licenses are MIT (26), Apache-2.0 (26), BSD-3-Clause (`ieee754`), and 0BSD (`tslib`), and none has an install script. The two AWS packages have the same version, and a new version of one needs the other.

## Consequences

- Easier: `STORAGE_DISK` changes the disk and nothing else. A new disk passes `diskContractSuite` or it is not a disk. A file never changes visibility by an ACL that a provider may not have.
- Harder: moving a file between `private/` and `public/` is a copy and a delete on S3. Public files need a bucket policy or a CDN for `public/*`, which the deploy templates must set up. The local disk cannot sign URLs, so a local project receives uploads in the API.
- Ruled out: ACLs, `svg` uploads by default, and trusting the content type or the extension that a client sends.

## Spec changes

- 15.3: add S-05 (visibility is a key prefix) and S-06 (a signed upload fixes the type and the size, and `confirmUpload` checks the bytes). Done in this series.
