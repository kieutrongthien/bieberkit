---
'@bieberkit/storage': minor
---

Add the storage. `@bieberkit/storage` gets `createStorage` (`put`, `get`, `stream`, `exists`, `stat`, `delete`, `copy`, `move`, `setVisibility`, `url`, `signedUrl`, `signedUploadUrl`, `confirmUpload` and the `tenant` view) with a policy for uploads (size, extensions, content sniffing), files that are private by default through a `private/` and `public/` prefix, a memory disk, `@bieberkit/storage/flydrive` (`flydriveDisk`, `createStorageFromConfig` for the `local` and `s3` disks) and `@bieberkit/storage/testing` with the disk suite.
