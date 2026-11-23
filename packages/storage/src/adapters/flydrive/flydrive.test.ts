/**
 * BieberKit
 *
 * @file        packages/storage/src/adapters/flydrive/flydrive.test.ts
 * @description Tests of the FlyDrive disks: the disk suite on the local folder and on S3 (MinIO), the storage on S3, and the storage that the config selects (S-01 to S-04).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @copyright   Copyright (c) 2026 Bieber Kieu
 * @license     Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { StorageError } from '../../contract.ts';
import { diskContractSuite } from '../../testing/disk-suite.ts';
import { EXE, FILES } from '../../testing/fixtures.ts';
import { describeS3 } from '../../testing/s3.ts';
import { makeTestBucket } from './test-bucket.ts';
import { createStorageFromConfig, diskFromConfig } from './index.ts';
import type { StorageConfig } from './index.ts';

const root = mkdtempSync(join(tmpdir(), 'bk-storage-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const LOCAL: StorageConfig = {
  STORAGE_DISK: 'local',
  STORAGE_LOCAL_ROOT: root,
  S3_BUCKET: undefined,
  S3_REGION: undefined,
  S3_ENDPOINT: undefined,
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
  S3_FORCE_PATH_STYLE: false,
};

const text = (value: string) => new TextEncoder().encode(value);

diskContractSuite('flydrive local', {
  make: async () => diskFromConfig({ ...LOCAL, STORAGE_LOCAL_ROOT: join(root, 'suite') }),
});

describe('S-04 the local disk', () => {
  it('S-04 keeps private and public files in two folders, so a static server can serve public/ only', async () => {
    const storage = createStorageFromConfig({ ...LOCAL, STORAGE_LOCAL_ROOT: join(root, 'tree') });
    await storage.put('a/secret.txt', text('s'));
    await storage.put('a/open.txt', text('o'), { visibility: 'public' });
    expect(readdirSync(join(root, 'tree'))).toEqual(['private', 'public'].toSorted());
    expect(statSync(join(root, 'tree', 'private', 'a', 'secret.txt')).size).toBe(1);
    expect(statSync(join(root, 'tree', 'public', 'a', 'open.txt')).size).toBe(1);
    await storage.setVisibility('a/secret.txt', 'public');
    expect(readdirSync(join(root, 'tree', 'public', 'a')).toSorted()).toEqual(['open.txt', 'secret.txt']);
    await storage.close();
  });

  it('S-04 has no signed URLs and no public URL of its own, and says so', async () => {
    const storage = createStorageFromConfig({ ...LOCAL, STORAGE_LOCAL_ROOT: join(root, 'plain') });
    await storage.put('a.txt', text('x'), { visibility: 'public' });
    await expect(storage.signedUrl('a.txt')).rejects.toMatchObject({ code: 'STORAGE_SIGNING_UNSUPPORTED' });
    await expect(storage.url('a.txt')).rejects.toMatchObject({ code: 'STORAGE_PUBLIC_UNSUPPORTED' });
    const withBase = createStorageFromConfig(
      { ...LOCAL, STORAGE_LOCAL_ROOT: join(root, 'plain') },
      { publicBaseUrl: 'https://files.example.com' },
    );
    expect(await withBase.url('a.txt')).toBe('https://files.example.com/public/a.txt');
  });

  it('S-02 a path cannot leave the folder of the disk', async () => {
    const storage = createStorageFromConfig({ ...LOCAL, STORAGE_LOCAL_ROOT: join(root, 'jail') });
    await expect(storage.put('../../escape.txt', text('x'))).rejects.toMatchObject({ code: 'STORAGE_PATH_INVALID' });
    expect(() => statSync(join(root, 'escape.txt'))).toThrow(/ENOENT/);
  });

  it('S-02 the policy runs on the local disk too, with a stream', async () => {
    const storage = createStorageFromConfig(
      { ...LOCAL, STORAGE_LOCAL_ROOT: join(root, 'policy') },
      { policy: { maxBytes: 100_000 } },
    );
    await storage.put('a.png', FILES['png'] ?? new Uint8Array());
    await expect(storage.put('b.png', EXE)).rejects.toBeInstanceOf(StorageError);
    expect((await storage.stat('a.png'))?.contentType).toBe('image/png');
    expect(await storage.stat('b.png')).toBeUndefined();
  });
});

describe('S-04 the config', () => {
  it('S-04 STORAGE_DISK=s3 needs the bucket and the keys', () => {
    expect(() => diskFromConfig({ ...LOCAL, STORAGE_DISK: 's3' })).toThrow(/S3_BUCKET/);
    expect(() => diskFromConfig({ ...LOCAL, STORAGE_DISK: 's3', S3_BUCKET: 'b' })).toThrow(/S3_ACCESS_KEY_ID/);
  });
});

describeS3('flydrive s3', (endpoint) => {
  diskContractSuite('flydrive s3', {
    make: async () => diskFromConfig(await makeTestBucket(endpoint)),
    keepsContentType: true,
  });

  it('S-01 a browser sends a file straight to the bucket, and the API confirms it', async () => {
    const storage = createStorageFromConfig(await makeTestBucket(endpoint));
    const png = FILES['png'] ?? new Uint8Array();
    const signed = await storage.signedUploadUrl('photos/a.png', { contentType: 'image/png', size: png.length });
    expect((await fetch(signed.url, { method: signed.method, headers: signed.headers, body: png })).status).toBe(200);
    expect(await storage.confirmUpload('photos/a.png')).toMatchObject({
      size: png.length,
      contentType: 'image/png',
      visibility: 'private',
    });
    expect(await storage.get('photos/a.png')).toEqual(png);
    await storage.close();
  });

  it('S-02 a browser that sends something else than a PNG is caught by the confirmation, and the object is deleted', async () => {
    const storage = createStorageFromConfig(await makeTestBucket(endpoint));
    const signed = await storage.signedUploadUrl('photos/fake.png', { contentType: 'image/png', size: EXE.length });
    expect((await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: EXE })).status).toBe(200);
    await expect(storage.confirmUpload('photos/fake.png')).rejects.toMatchObject({ code: 'STORAGE_UPLOAD_REJECTED' });
    expect(await storage.exists('photos/fake.png')).toBe(false);
    await storage.close();
  });

  it('S-03 a private file is read only through a signed URL, a public one moves to public/', async () => {
    const config = await makeTestBucket(endpoint);
    const storage = createStorageFromConfig(config);
    await storage.put('docs/a.txt', text('private text'));
    const direct = await fetch(`${endpoint}/${config.S3_BUCKET}/private/docs/a.txt`);
    expect(direct.status).toBe(403);
    expect(await (await fetch(await storage.signedUrl('docs/a.txt'))).text()).toBe('private text');
    await storage.setVisibility('docs/a.txt', 'public');
    expect((await fetch(await storage.signedUrl('docs/a.txt'))).status).toBe(200);
    expect(await storage.url('docs/a.txt')).toBe(`${endpoint}/${config.S3_BUCKET}/public/docs/a.txt`);
    await storage.close();
  });

  it('S-02 a stream of 3 MB on S3 is checked and kept, and one over the limit leaves nothing', async () => {
    const storage = createStorageFromConfig(await makeTestBucket(endpoint), { policy: { maxBytes: 4 * 1024 * 1024 } });
    const { Readable } = await import('node:stream');
    const ok = new Uint8Array(3 * 1024 * 1024).fill(120);
    await storage.put(
      'big.txt',
      Readable.from([ok.subarray(0, 1_000_000), ok.subarray(1_000_000)], { objectMode: false }),
    );
    expect((await storage.stat('big.txt'))?.size).toBe(ok.length);
    const tooBig = new Uint8Array(5 * 1024 * 1024).fill(120);
    await expect(storage.put('huge.txt', Readable.from([tooBig], { objectMode: false }))).rejects.toMatchObject({
      code: 'STORAGE_TOO_LARGE',
    });
    expect(await storage.exists('huge.txt')).toBe(false);
    await storage.close();
  });
});
