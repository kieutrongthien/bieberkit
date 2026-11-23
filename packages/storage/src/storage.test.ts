/**
 * BieberKit
 *
 * @file        packages/storage/src/storage.test.ts
 * @description Tests of createStorage on the memory disk: paths, the policy for uploads, visibility, signed URLs, confirmed uploads and the tenant view (S-01 to S-03).
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

import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runAsTenant } from '@bieberkit/data/orm';
import { StorageError } from './contract.ts';
import { createMemoryDisk } from './memory-disk.ts';
import { createStorage } from './storage.ts';
import { EXE, FILES, SVG } from './testing/fixtures.ts';

const ONE = randomUUID();
const TWO = randomUUID();
const text = (value: string) => new TextEncoder().encode(value);

function make(options: { signing?: boolean; maxBytes?: number; publicBaseUrl?: string } = {}) {
  const disk = createMemoryDisk(options.signing === undefined ? {} : { signing: options.signing });
  const storage = createStorage({
    disk,
    ...(options.maxBytes === undefined ? {} : { policy: { maxBytes: options.maxBytes } }),
    ...(options.publicBaseUrl === undefined ? {} : { publicBaseUrl: options.publicBaseUrl }),
  });
  return { disk, storage };
}

async function codeOf(promise: Promise<unknown> | (() => unknown)): Promise<string | undefined> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    return error instanceof StorageError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
}

async function* broken(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array(70_000).fill(120);
  throw new Error('the connection dropped');
}

async function upload(
  storage: ReturnType<typeof make>['storage'],
  disk: ReturnType<typeof make>['disk'],
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const signed = await storage.signedUploadUrl(path, { contentType, size: bytes.length });
  await disk.upload(signed.url, signed.headers, bytes);
  return signed;
}

describe('S-02 paths', () => {
  it('S-02 refuses paths that leave the folder or are not plain', async () => {
    const { storage } = make();
    for (const path of [
      '',
      '/abs.txt',
      '../x.txt',
      'a/../b.txt',
      'a//b.txt',
      './x.txt',
      'a/./b.txt',
      'x\u0000.txt',
      'a\\b.txt',
      ' x.txt',
      'x .txt/',
      'ünï.txt',
      'a'.repeat(513),
      'x.txt?y=1',
      'a b  c.txt',
    ]) {
      expect(await codeOf(storage.put(path, text('x')))).toBe('STORAGE_PATH_INVALID');
      expect(await codeOf(storage.get(path))).toBe('STORAGE_PATH_INVALID');
    }
  });

  it('S-02 accepts ordinary paths', async () => {
    const { storage } = make();
    for (const path of ['a.txt', 'docs/2026/report v2.txt', 'x/.hidden.txt', 'A_b-c.d/e.txt']) {
      expect(await codeOf(storage.put(path, text('x')))).toBeUndefined();
    }
  });
});

describe('S-02 the policy for uploads', () => {
  it.each(Object.keys(FILES))('S-02 stores a real .%s file, with the content type of its rule', async (extension) => {
    const { storage } = make();
    const stored = await storage.put(`file.${extension}`, FILES[extension] ?? new Uint8Array());
    expect(stored.size).toBe(FILES[extension]?.length);
    expect(stored.contentType.length).toBeGreaterThan(0);
    expect(await storage.get(`file.${extension}`)).toEqual(FILES[extension]);
  });

  it('S-02 refuses an extension that is not on the list, and a file with no extension', async () => {
    const { storage } = make();
    for (const path of ['run.exe', 'page.html', 'image.svg', 'script.js', 'noextension', '.env', 'a.PHP']) {
      expect(await codeOf(storage.put(path, text('x')))).toBe('STORAGE_TYPE_NOT_ALLOWED');
    }
  });

  it('S-02 the extension is read in lower case, and only the last one counts', async () => {
    const { storage } = make();
    expect(await codeOf(storage.put('PHOTO.PNG', FILES['png'] ?? new Uint8Array()))).toBeUndefined();
    expect(await codeOf(storage.put('shell.php.txt', text('plain')))).toBeUndefined();
    expect(await codeOf(storage.put('photo.png.exe', FILES['png'] ?? new Uint8Array()))).toBe(
      'STORAGE_TYPE_NOT_ALLOWED',
    );
  });

  it('S-02 refuses content that is not what the extension says', async () => {
    const { storage } = make();
    const cases: [string, Uint8Array][] = [
      ['program.png', EXE],
      ['script.jpg', SVG],
      ['photo.png', FILES['jpg'] ?? new Uint8Array()],
      ['fake.pdf', text('just text')],
      ['archive.docx', FILES['zip'] ?? new Uint8Array()],
      ['sheet.docx', FILES['xlsx'] ?? new Uint8Array()],
      ['video.mp4', FILES['png'] ?? new Uint8Array()],
      ['notes.txt', FILES['png'] ?? new Uint8Array()],
      ['notes.csv', EXE],
      ['empty.png', new Uint8Array()],
    ];
    for (const [path, bytes] of cases) {
      expect(await codeOf(storage.put(path, bytes))).toBe('STORAGE_CONTENT_MISMATCH');
    }
  });

  it('S-02 text must be UTF-8 with no NUL byte', async () => {
    const { storage } = make();
    expect(await codeOf(storage.put('a.txt', Uint8Array.from([0x68, 0x00, 0x69])))).toBe('STORAGE_CONTENT_MISMATCH');
    expect(await codeOf(storage.put('a.txt', Uint8Array.from([0xff, 0xfe, 0xfd])))).toBe('STORAGE_CONTENT_MISMATCH');
    expect(await codeOf(storage.put('empty.txt', new Uint8Array()))).toBeUndefined();
    expect(await codeOf(storage.put('a.json', text('{"vi":"tiếng Việt"}')))).toBeUndefined();
  });

  it('S-02 a text file cut in the middle of a character in the first 64 KiB is still text', async () => {
    const { storage } = make();
    const body = text('é'.repeat(40_000));
    expect(await codeOf(storage.put('long.txt', body))).toBeUndefined();
  });

  it('S-02 a text file of 3 and 4 byte characters is text wherever the first 64 KiB end, and bad bytes after the start are caught', async () => {
    const { storage } = make();
    for (const unit of ['€', '😀']) {
      for (const shift of ['', 'a', 'ab', 'abc']) {
        expect(await codeOf(storage.put('long.txt', shift + unit.repeat(40_000)))).toBeUndefined();
      }
    }
    const bad = new Uint8Array(70_000).fill(120);
    bad[10] = 0xff;
    expect(await codeOf(storage.put('bad.txt', bad))).toBe('STORAGE_CONTENT_MISMATCH');
  });

  it('S-02 refuses a file over the limit, from bytes and from a string', async () => {
    const { storage } = make({ maxBytes: 100 });
    expect(await codeOf(storage.put('a.txt', text('x'.repeat(101))))).toBe('STORAGE_TOO_LARGE');
    expect(await codeOf(storage.put('a.txt', 'x'.repeat(101)))).toBe('STORAGE_TOO_LARGE');
    expect(await codeOf(storage.put('a.txt', 'x'.repeat(100)))).toBeUndefined();
  });

  it('S-02 the content type that the client sent is never used', async () => {
    const { storage, disk } = make();
    await storage.put('photo.png', FILES['png'] ?? new Uint8Array());
    expect(disk.files.get('private/photo.png')?.contentType).toBe('image/png');
  });

  it('S-02 a project can replace the list of types, and nothing of the old one stays', async () => {
    const storage = createStorage({
      disk: createMemoryDisk(),
      policy: { types: { png: { kind: 'binary', contentType: 'image/png', detected: ['image/png'] } } },
    });
    expect(await codeOf(storage.put('a.png', FILES['png'] ?? new Uint8Array()))).toBeUndefined();
    expect(await codeOf(storage.put('a.txt', text('x')))).toBe('STORAGE_TYPE_NOT_ALLOWED');
    expect(await codeOf(storage.put('constructor', text('x')))).toBe('STORAGE_TYPE_NOT_ALLOWED');
  });

  it('S-02 refuses a policy with a bad limit', () => {
    expect(() => createStorage({ disk: createMemoryDisk(), policy: { maxBytes: 0 } })).toThrow(/maxBytes/);
  });
});

describe('S-02 streams', () => {
  it('S-02 stores a stream, checking its first bytes and counting the rest', async () => {
    const { storage } = make();
    const big = new Uint8Array(200_000).fill(120);
    const stored = await storage.put(
      'big.txt',
      Readable.from([big.subarray(0, 70_000), big.subarray(70_000)], { objectMode: false }),
    );
    expect(stored.size).toBe(200_000);
    expect((await storage.get('big.txt')).length).toBe(200_000);
  });

  it('S-02 stores a stream of a real image', async () => {
    const { storage } = make();
    const png = FILES['png'] ?? new Uint8Array();
    await storage.put('s.png', Readable.from([png.subarray(0, 10), png.subarray(10)], { objectMode: false }));
    expect(await storage.get('s.png')).toEqual(png);
  });

  it('S-02 a stream that passes the limit is cut, and nothing is left on the disk', async () => {
    const { storage, disk } = make({ maxBytes: 150_000 });
    const chunks = Array.from({ length: 10 }, () => new Uint8Array(30_000).fill(120));
    expect(await codeOf(storage.put('big.txt', Readable.from(chunks, { objectMode: false })))).toBe(
      'STORAGE_TOO_LARGE',
    );
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('S-02 a stream whose first chunk is already over the limit is refused', async () => {
    const { storage, disk } = make({ maxBytes: 1000 });
    expect(
      await codeOf(storage.put('big.txt', Readable.from([new Uint8Array(5000).fill(120)], { objectMode: false }))),
    ).toBe('STORAGE_TOO_LARGE');
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('S-02 a stream with the wrong content is refused before anything is written', async () => {
    const { storage, disk } = make();
    expect(await codeOf(storage.put('a.png', Readable.from([EXE], { objectMode: false })))).toBe(
      'STORAGE_CONTENT_MISMATCH',
    );
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('S-02 a stream that fails in the middle leaves nothing and tells why', async () => {
    const { storage, disk } = make();
    expect(await codeOf(storage.put('a.txt', Readable.from(broken(), { objectMode: false })))).toMatch(/dropped/);
    expect([...disk.files.keys()]).toEqual([]);
  });
});

describe('S-03 visibility', () => {
  it('S-03 a file is private unless it is asked to be public', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('x'));
    expect([...disk.files.keys()]).toEqual(['private/a.txt']);
    expect((await storage.stat('a.txt'))?.visibility).toBe('private');
  });

  it('S-03 url refuses a private file, and never signs one', async () => {
    const { storage } = make({ publicBaseUrl: 'https://cdn.example.com' });
    await storage.put('a.txt', text('x'));
    expect(await codeOf(storage.url('a.txt'))).toBe('STORAGE_NOT_PUBLIC');
  });

  it('S-03 url of a public file is the address of the CDN and the public key', async () => {
    const { storage } = make({ publicBaseUrl: 'https://cdn.example.com/' });
    await storage.put('docs/report v2.txt', text('x'), { visibility: 'public' });
    expect(await storage.url('docs/report v2.txt')).toBe('https://cdn.example.com/public/docs/report%20v2.txt');
  });

  it('S-03 url with no base falls back to the disk, and says when the disk has none', async () => {
    const { storage } = make();
    await storage.put('a.txt', text('x'), { visibility: 'public' });
    expect(await codeOf(storage.url('a.txt'))).toBe('STORAGE_PUBLIC_UNSUPPORTED');
    const disk = createMemoryDisk({ publicBaseUrl: 'https://files.example.com' });
    const other = createStorage({ disk });
    await other.put('a.txt', text('x'), { visibility: 'public' });
    expect(await other.url('a.txt')).toBe('https://files.example.com/public/a.txt');
  });

  it('S-03 url of a file that is not there is a 404', async () => {
    const { storage } = make({ publicBaseUrl: 'https://cdn.example.com' });
    expect(await codeOf(storage.url('nothing.txt'))).toBe('STORAGE_NOT_FOUND');
  });

  it('S-03 setVisibility moves the file between the prefixes, and a path has one copy', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('x'));
    await storage.setVisibility('a.txt', 'public');
    expect([...disk.files.keys()]).toEqual(['public/a.txt']);
    await storage.setVisibility('a.txt', 'public');
    await storage.setVisibility('a.txt', 'private');
    expect([...disk.files.keys()]).toEqual(['private/a.txt']);
    expect(await codeOf(storage.setVisibility('missing.txt', 'public'))).toBe('STORAGE_NOT_FOUND');
  });

  it('S-03 a put with the other visibility replaces the old copy', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('first'), { visibility: 'public' });
    await storage.put('a.txt', text('second'));
    expect([...disk.files.keys()]).toEqual(['private/a.txt']);
    expect(new TextDecoder().decode(await storage.get('a.txt'))).toBe('second');
  });

  it('S-03 reads find a file under either prefix', async () => {
    const { storage } = make();
    await storage.put('a.txt', text('pub'), { visibility: 'public' });
    await storage.put('b.txt', text('priv'));
    expect(new TextDecoder().decode(await storage.get('a.txt'))).toBe('pub');
    expect(new TextDecoder().decode(await storage.get('b.txt'))).toBe('priv');
    expect(await storage.exists('a.txt')).toBe(true);
    expect(await storage.exists('c.txt')).toBe(false);
    expect(await codeOf(storage.get('c.txt'))).toBe('STORAGE_NOT_FOUND');
  });
});

describe('storage operations', () => {
  it('stat answers the size, the type and the visibility, and undefined for a missing file', async () => {
    const { storage } = make();
    await storage.put('a.png', FILES['png'] ?? new Uint8Array());
    expect(await storage.stat('a.png')).toMatchObject({
      path: 'a.png',
      size: FILES['png']?.length,
      contentType: 'image/png',
      visibility: 'private',
    });
    expect(await storage.stat('missing.png')).toBeUndefined();
  });

  it('stream gives the file, or a range of it, and refuses a bad range', async () => {
    const { storage } = make();
    await storage.put('a.txt', text('0123456789'));
    const read = async (range?: { start: number; end: number }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of await storage.stream('a.txt', range === undefined ? {} : { range }))
        chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString();
    };
    expect(await read()).toBe('0123456789');
    expect(await read({ start: 2, end: 4 })).toBe('234');
    for (const bad of [
      { start: -1, end: 3 },
      { start: 5, end: 2 },
      { start: 0.5, end: 3 },
    ]) {
      expect(await codeOf(storage.stream('a.txt', { range: bad }))).toBe('STORAGE_RANGE_INVALID');
    }
    expect(await codeOf(storage.stream('missing.txt'))).toBe('STORAGE_NOT_FOUND');
  });

  it('delete removes the file under any prefix, and a missing file is no error', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('x'), { visibility: 'public' });
    await storage.delete('a.txt');
    await storage.delete('a.txt');
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('copy and move keep the visibility and the content, and the extension', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('x'), { visibility: 'public' });
    await storage.copy('a.txt', 'dir/b.txt');
    await storage.move('a.txt', 'dir/c.txt');
    expect([...disk.files.keys()].toSorted()).toEqual(['public/dir/b.txt', 'public/dir/c.txt']);
    expect(await codeOf(storage.copy('dir/b.txt', 'dir/b.png'))).toBe('STORAGE_TYPE_NOT_ALLOWED');
    expect(await codeOf(storage.move('dir/b.txt', 'dir/b.exe'))).toBe('STORAGE_TYPE_NOT_ALLOWED');
    expect(await codeOf(storage.copy('missing.txt', 'x.txt'))).toBe('STORAGE_NOT_FOUND');
    await storage.copy('dir/b.txt', 'dir/b.txt');
    expect(await storage.exists('dir/b.txt')).toBe(true);
  });

  it('a copy over a path of the other visibility leaves one copy', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('pub'), { visibility: 'public' });
    await storage.put('b.txt', text('priv'));
    await storage.copy('a.txt', 'b.txt');
    expect([...disk.files.keys()].toSorted()).toEqual(['public/a.txt', 'public/b.txt']);
  });
});

describe('S-01 signed URLs', () => {
  it('S-01 a disk that cannot sign says so', async () => {
    const { storage } = make();
    await storage.put('a.txt', text('x'));
    expect(await codeOf(storage.signedUrl('a.txt'))).toBe('STORAGE_SIGNING_UNSUPPORTED');
    expect(await codeOf(storage.signedUploadUrl('a.txt', { contentType: 'text/plain', size: 1 }))).toBe(
      'STORAGE_SIGNING_UNSUPPORTED',
    );
  });

  it('S-01 signedUrl is for a file that exists, for a short time, with a safe name to save it under', async () => {
    const { storage } = make({ signing: true });
    await storage.put('a.txt', text('x'));
    const url = new URL(await storage.signedUrl('a.txt', { download: 'my "report"\r\n.txt' }));
    expect(url.pathname).toBe('/private/a.txt');
    expect(url.searchParams.get('download')).toBe('my _report___.txt');
    const expires = Number(url.searchParams.get('expires'));
    expect(expires).toBeGreaterThan(Date.now() + 4 * 60_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
    expect(await codeOf(storage.signedUrl('missing.txt'))).toBe('STORAGE_NOT_FOUND');
  });

  it('S-01 signedUrl refuses a TTL that is not a whole number of milliseconds up to 7 days', async () => {
    const { storage } = make({ signing: true });
    await storage.put('a.txt', text('x'));
    for (const ttlMs of [0, -5, 1.5, Number.NaN, 7 * 86_400_000 + 1]) {
      expect(await codeOf(storage.signedUrl('a.txt', { ttlMs }))).toBe('STORAGE_TTL_INVALID');
    }
    expect(await codeOf(storage.signedUrl('a.txt', { ttlMs: 7 * 86_400_000 }))).toBeUndefined();
  });

  it('S-01 signedUploadUrl checks the path, the type, the content type and the size before it signs', async () => {
    const { storage } = make({ signing: true, maxBytes: 1000 });
    const ok = { contentType: 'image/png', size: 500 };
    expect(await codeOf(storage.signedUploadUrl('../a.png', ok))).toBe('STORAGE_PATH_INVALID');
    expect(await codeOf(storage.signedUploadUrl('a.exe', ok))).toBe('STORAGE_TYPE_NOT_ALLOWED');
    expect(await codeOf(storage.signedUploadUrl('a.png', { ...ok, contentType: 'text/html' }))).toBe(
      'STORAGE_TYPE_NOT_ALLOWED',
    );
    expect(await codeOf(storage.signedUploadUrl('a.png', { ...ok, size: 1001 }))).toBe('STORAGE_TOO_LARGE');
    expect(await codeOf(storage.signedUploadUrl('a.png', { ...ok, size: 0 }))).toBe('STORAGE_TOO_LARGE');
    expect(await codeOf(storage.signedUploadUrl('a.png', { ...ok, size: 1.5 }))).toBe('STORAGE_TOO_LARGE');
    expect(await codeOf(storage.signedUploadUrl('a.png', { ...ok, ttlMs: 3_600_001 }))).toBe('STORAGE_TTL_INVALID');
    expect(await codeOf(storage.signedUploadUrl('a.png', { ...ok, contentType: 'IMAGE/PNG; x=y' }))).toBeUndefined();
  });

  it('S-01 signedUploadUrl asks for the private key and for the content type of the rule', async () => {
    const { storage } = make({ signing: true });
    const signed = await storage.signedUploadUrl('docs/a.txt', { contentType: 'text/plain', size: 10 });
    expect(signed.method).toBe('PUT');
    expect(signed.path).toBe('docs/a.txt');
    expect(signed.headers['content-type']).toBe('text/plain; charset=utf-8');
    const target = new URL(signed.url);
    expect(`${target.hostname}${target.pathname}`).toBe('upload/private/docs/a.txt');
    expect(signed.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('S-01 confirmUpload', () => {
  it('S-01 keeps a good upload, private by default, and answers what it is', async () => {
    const { storage, disk } = make({ signing: true });
    const png = FILES['png'] ?? new Uint8Array();
    await upload(storage, disk, 'photos/a.png', png, 'image/png');
    expect(await storage.confirmUpload('photos/a.png')).toMatchObject({
      path: 'photos/a.png',
      size: png.length,
      contentType: 'image/png',
      visibility: 'private',
    });
    expect([...disk.files.keys()]).toEqual(['private/photos/a.png']);
  });

  it('S-01 can make the upload public when it confirms it', async () => {
    const { storage, disk } = make({ signing: true });
    await upload(storage, disk, 'a.png', FILES['png'] ?? new Uint8Array(), 'image/png');
    expect((await storage.confirmUpload('a.png', { visibility: 'public' })).visibility).toBe('public');
    expect([...disk.files.keys()]).toEqual(['public/a.png']);
  });

  it('S-02 deletes an upload whose content is not what its extension says, and says why', async () => {
    const { storage, disk } = make({ signing: true });
    await upload(storage, disk, 'a.png', EXE, 'image/png');
    let error: unknown;
    try {
      await storage.confirmUpload('a.png');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: 'STORAGE_UPLOAD_REJECTED', status: 422 });
    expect(error instanceof Error ? error.cause : undefined).toBeInstanceOf(StorageError);
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('S-02 deletes an upload that is larger than the limit even when the browser lied about the size', async () => {
    const { storage, disk } = make({ signing: true, maxBytes: 100 });
    await disk.put('private/big.txt', text('x'.repeat(500)), { contentType: 'text/plain' });
    expect(await codeOf(storage.confirmUpload('big.txt'))).toBe('STORAGE_UPLOAD_REJECTED');
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('S-02 deletes an upload to a path whose type is not allowed', async () => {
    const { storage, disk } = make({ signing: true });
    await disk.put('private/run.exe', EXE, { contentType: 'application/octet-stream' });
    expect(await codeOf(storage.confirmUpload('run.exe'))).toBe('STORAGE_UPLOAD_REJECTED');
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('S-01 an upload that never arrived is a 404, and confirming twice keeps the file', async () => {
    const { storage, disk } = make({ signing: true });
    expect(await codeOf(storage.confirmUpload('a.png'))).toBe('STORAGE_NOT_FOUND');
    await upload(storage, disk, 'a.png', FILES['png'] ?? new Uint8Array(), 'image/png');
    await storage.confirmUpload('a.png');
    expect(await codeOf(storage.confirmUpload('a.png'))).toBeUndefined();
  });

  it('S-01 the disk does not accept the upload of another size than the one that was signed', async () => {
    const { storage, disk } = make({ signing: true });
    const signed = await storage.signedUploadUrl('a.png', { contentType: 'image/png', size: 10 });
    await expect(disk.upload(signed.url, signed.headers, new Uint8Array(11))).rejects.toMatchObject({
      code: 'STORAGE_UPLOAD_REFUSED',
    });
  });
});

describe('S-02 the tenant view', () => {
  it('S-02 puts the files of a tenant in a folder of their own', async () => {
    const { storage, disk } = make();
    await runAsTenant(ONE, () => storage.tenant.put('a.txt', text('one')));
    await runAsTenant(TWO, () => storage.tenant.put('a.txt', text('two')));
    await storage.put('a.txt', text('root'));
    expect([...disk.files.keys()].toSorted()).toEqual(
      [`private/a.txt`, `private/t/${ONE}/a.txt`, `private/t/${TWO}/a.txt`].toSorted(),
    );
    expect(new TextDecoder().decode(await runAsTenant(ONE, () => storage.tenant.get('a.txt')))).toBe('one');
    expect(new TextDecoder().decode(await runAsTenant(TWO, () => storage.tenant.get('a.txt')))).toBe('two');
  });

  it('S-02 a tenant cannot reach the files of another, or the root, by a path', async () => {
    const { storage } = make();
    await runAsTenant(ONE, () => storage.tenant.put('secret.txt', text('one')));
    expect(await runAsTenant(TWO, () => storage.tenant.exists('secret.txt'))).toBe(false);
    expect(await codeOf(runAsTenant(TWO, () => storage.tenant.get(`../${ONE}/secret.txt`)))).toBe(
      'STORAGE_PATH_INVALID',
    );
    expect(await codeOf(runAsTenant(TWO, () => storage.tenant.get(`t/${ONE}/secret.txt`)))).toBe('STORAGE_NOT_FOUND');
  });

  it('S-02 without a tenant every call throws, and never falls back to the root folder', async () => {
    const { storage } = make();
    await storage.put('a.txt', text('root'));
    expect(await codeOf(storage.tenant.get('a.txt'))).toBe('STORAGE_TENANT_REQUIRED');
    expect(await codeOf(storage.tenant.put('b.txt', text('x')))).toBe('STORAGE_TENANT_REQUIRED');
    expect(await codeOf(storage.tenant.exists('a.txt'))).toBe('STORAGE_TENANT_REQUIRED');
  });

  it('S-02 a view that is kept follows the tenant of each call, and answers paths without the folder', async () => {
    const { storage } = make();
    const kept = storage.tenant;
    const stored = await runAsTenant(ONE, () => kept.put('a.txt', text('one')));
    expect(stored.path).toBe('a.txt');
    expect(await runAsTenant(TWO, () => kept.exists('a.txt'))).toBe(false);
    expect((await runAsTenant(ONE, () => kept.stat('a.txt')))?.path).toBe('a.txt');
  });

  it('S-02 urls, copies and signed URLs of a tenant stay in its folder', async () => {
    const { storage, disk } = make({ signing: true, publicBaseUrl: 'https://cdn.example.com' });
    await runAsTenant(ONE, async () => {
      await storage.tenant.put('p.txt', text('x'), { visibility: 'public' });
      expect(await storage.tenant.url('p.txt')).toBe(`https://cdn.example.com/public/t/${ONE}/p.txt`);
      await storage.tenant.copy('p.txt', 'q.txt');
      expect(new URL(await storage.tenant.signedUrl('q.txt')).pathname).toBe(`/public/t/${ONE}/q.txt`);
    });
    expect([...disk.files.keys()].every((key) => key.includes(`t/${ONE}/`))).toBe(true);
  });
});

describe('lifecycle', () => {
  it('close closes the disk', async () => {
    const { storage, disk } = make();
    await storage.put('a.txt', text('x'));
    await storage.close();
    expect(disk.files.size).toBe(0);
  });
});
