<!--
  BieberKit

  @file        docs/modules/storage.md
  @description Module spec of @bieberkit/storage: the policy for uploads, private and public files by prefix, signed URLs, the tenant view and the disks on FlyDrive.
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

# @bieberkit/storage

- Package: `@bieberkit/storage`
- Layer: contracts (it may import `@bieberkit/core` and `@bieberkit/data`)
- Spec sections: 15.3 (S-01 to S-04), CFG-07, PKG-03, SEC-04
- Status: **Prepared on 2026-11-23.** ADR 0017 (Accepted) lists the libraries (P9).

## Purpose

One API for files, with the rules of uploads in one place: what may be stored (size, type by content, extension), who may read it (private by default), and how a browser sends a file straight to the bucket. `STORAGE_DISK` changes the disk and nothing in the application.

## Public API

```ts
createStorage({ disk, policy?, logger? }): Storage

interface Storage {
  put(path, body, { visibility? }): Promise<StoredFile>          // checks the policy; the client's content type is never trusted
  get(path): Promise<Uint8Array>; stream(path, { range? }): Promise<Readable>
  exists(path); stat(path): Promise<StoredFile | undefined>
  delete(path); copy(from, to); move(from, to)
  setVisibility(path, visibility)
  url(path): Promise<string>                                       // public files only
  signedUrl(path, { ttlMs?, download? }): Promise<string>          // a private file, for a short time
  signedUploadUrl(path, { contentType, size, ttlMs? }): Promise<SignedUpload>   // S-01
  confirmUpload(path, { visibility? }): Promise<StoredFile>        // S-01, S-02: checks what arrived, deletes it if it fails
  readonly tenant: Storage
}
createMemoryDisk({ signing? }): Disk                               // for one process, and for tests
// @bieberkit/storage/flydrive
flydriveDisk(driver, options): Disk                                // any FlyDrive driver
createStorageFromConfig(config, { policy?, publicBaseUrl?, logger? }): Storage    // STORAGE_DISK, STORAGE_LOCAL_ROOT, S3_*
// @bieberkit/storage/testing
diskContractSuite(name, make)                                      // every disk passes it
```

## Rules

1. **Paths.** A path is relative, uses `/`, has 1 to 512 characters of `A-Za-z0-9._ -` per segment (a segment is never `.` or `..`, and never starts or ends with a space), and no empty segment. Anything else is `STORAGE_PATH_INVALID`. A path never leaves the disk, whatever the disk does with it.
2. **Visibility is a prefix (S-03).** A disk is a plain key store. A file is stored under `private/<path>` or `public/<path>`, so it works the same on a local folder, S3, R2 and MinIO, with no ACL. `put` makes a file private unless `visibility: 'public'` is given. `setVisibility` moves the file between the prefixes. A public file is served by a bucket policy or a CDN that allows `public/*` only, or by the static folder `public/` of the local disk. Reads look in `private/` and then in `public/`.
3. **`url(path)`** answers the public URL of a public file: `publicBaseUrl` (a CDN or a bucket host) plus `public/<path>`, or the driver's own URL when none is given. For a private file it throws `STORAGE_NOT_PUBLIC`, and it never signs one. The local disk with no `publicBaseUrl` throws `STORAGE_PUBLIC_UNSUPPORTED`.
4. **The policy (S-02).** `policy.maxBytes` (default 25 MiB) and `policy.types`, a map from extension to a rule. Without `types` the default list is used: images (`jpg`, `jpeg`, `png`, `gif`, `webp`, `avif`), `pdf`, the Office formats, `zip`, `mp4`, `webm`, `mp3`, and text (`txt`, `csv`, `json`). `svg` and `html` are not in it: they run script. A project that wants more passes its own `types`, which replaces the list (P1: there is one list).
5. **Content, not the client.** The extension must be in `types`. The first 64 KiB are sniffed (`file-type`): a binary rule needs the detected type to be the one of the rule, a text rule needs valid UTF-8 with no NUL byte and no detected binary type. The stored content type is the one of the rule, never the one the client sent. Errors: `STORAGE_TYPE_NOT_ALLOWED` (415) for an extension that is not listed, `STORAGE_CONTENT_MISMATCH` (415) for content that is not what the extension says, `STORAGE_TOO_LARGE` (413).
6. **Streams are limited while they flow.** A body that is a stream is counted, and the write is aborted when it passes `maxBytes`. Whatever was written is deleted, and the caller gets `STORAGE_TOO_LARGE`.
7. **Signed uploads (S-01).** `signedUploadUrl(path, { contentType, size })` checks the path, the extension, that `contentType` is the one of the rule and that `size` is within `maxBytes`, then asks the disk for a URL that is valid for `ttlMs` (default 5 minutes, at most 1 hour) and, where the disk can, bound to the content type and the size. The browser sends the file straight to `private/<path>`. The API then calls `confirmUpload(path)`: it reads the size and the first bytes, applies rule 5, and when anything is wrong it deletes the object and throws `STORAGE_UPLOAD_REJECTED` with the reason. A path that is not confirmed is untrusted: a project puts uploads under a prefix of its own and lets the `media` plugin confirm and move them. A disk with no signing (the local disk) throws `STORAGE_SIGNING_UNSUPPORTED`: there the API receives the file and calls `put`.
8. **Signed reads.** `signedUrl(path, { ttlMs, download })` is valid for `ttlMs` (default 5 minutes, at most 7 days). `download` is a file name that makes the browser save the file instead of showing it, with the characters of the name escaped.
9. **`copy` and `move`** keep the visibility, and the destination has the same extension as the source, so a file is never renamed into another type.
10. **The tenant view.** `storage.tenant` puts every path under `t/<tenantId>/`. Without a tenant in the request each call throws `STORAGE_TENANT_REQUIRED`. It follows the tenant of each call, as `cache.tenant` does.
11. **Disks.** `flydriveDisk` wraps a FlyDrive driver. `createStorageFromConfig` builds the `fs` driver from `STORAGE_LOCAL_ROOT` or the `s3` driver from `S3_*` with `supportsACL: false`. The adapter is the only code that imports `flydrive` and the AWS SDK (PKG-03). `STORAGE_DISK=local` with `APP_SINGLE_NODE` unset in production is already refused by the core config (S-04).
12. **Errors** are `StorageError` (a `BkError`) with the codes above, and `STORAGE_NOT_FOUND` (404), `STORAGE_TTL_INVALID`, `STORAGE_CONFIG_INVALID`. A failure of the disk itself is not hidden.

## Tests

- `diskContractSuite`, for every disk: put and get (bytes, string, a 6 MB stream), stat, range reads, copy, move, delete of a missing key, missing key errors, and, where the disk signs, a signed read and a signed upload over real HTTP.
- `storage.test.ts` on the memory disk: paths, the policy and the sniffing for each default type, the lie of an extension, streams over the limit, visibility and `url`, copy and move, the tenant view, `confirmUpload` for good and bad uploads.
- `adapters/flydrive`: the suite on the `fs` driver and on MinIO (`STORAGE_TEST_S3_ENDPOINT`; `BK_REQUIRE_DIALECTS=all` makes a missing one fail), a signed upload that is refused when the size or the type is not the one that was signed, and `createStorageFromConfig`.
