/**
 * BieberKit
 *
 * @file        packages/storage/src/testing/disk-suite.ts
 * @description The suite of tests that every storage disk must pass, so that switching STORAGE_DISK changes no application code (S-04).
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

import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import type { Disk } from '../contract.ts';

export interface DiskSubject {
  /** A disk over an empty place. The suite closes it. */
  readonly make: () => Promise<Disk>;
  readonly cleanup?: () => Promise<void>;
  /** True when `head` answers the content type that `put` was given. */
  readonly keepsContentType?: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const key = (name: string) => `private/suite/${randomBytes(4).toString('hex')}/${name}`;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function read(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** The cases every disk passes. A disk that signs is also tested over real HTTP. */
export function diskContractSuite(name: string, subject: DiskSubject): void {
  describe(`${name} disk contract`, () => {
    let disk: Disk;
    const opened = subject.make().then((made) => (disk = made));
    afterAll(async () => {
      await (await opened).close();
      await subject.cleanup?.();
    });

    it('S-04 keeps bytes, and says their size', async () => {
      await opened;
      const k = key('a.txt');
      await disk.put(k, new TextEncoder().encode('hello'), { contentType: 'text/plain; charset=utf-8' });
      expect(new TextDecoder().decode(await disk.get(k))).toBe('hello');
      const head = await disk.head(k);
      expect(head?.size).toBe(5);
      expect(head?.lastModified).toBeGreaterThan(Date.now() - 60_000);
      expect(subject.keepsContentType === true ? head?.contentType?.includes('text/plain') : true).toBe(true);
    });

    it('S-04 keeps a stream of 6 MB', async () => {
      await opened;
      const k = key('big.bin');
      const bytes = randomBytes(6 * 1024 * 1024);
      await disk.put(
        k,
        Readable.from([bytes.subarray(0, 1_000_000), bytes.subarray(1_000_000)], { objectMode: false }),
        {
          contentType: 'application/octet-stream',
        },
      );
      expect(sha(await disk.get(k))).toBe(sha(bytes));
      expect((await disk.head(k))?.size).toBe(bytes.length);
    });

    it('S-04 a key that is not there has no head, and a read of it fails', async () => {
      await opened;
      const k = key('missing.txt');
      expect(await disk.head(k)).toBeUndefined();
      await expect(disk.get(k)).rejects.toBeInstanceOf(Error);
      await expect(disk.stream(k)).rejects.toBeInstanceOf(Error);
    });

    it('S-04 reads a range of a file, ends included', async () => {
      await opened;
      const k = key('range.bin');
      const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
      await disk.put(k, bytes, { contentType: 'application/octet-stream' });
      expect([...(await read(await disk.stream(k, { start: 10, end: 19 })))]).toEqual([
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      ]);
      expect((await read(await disk.stream(k))).length).toBe(100);
    });

    it('S-04 a second put replaces the file', async () => {
      await opened;
      const k = key('replace.txt');
      await disk.put(k, new TextEncoder().encode('first version'), { contentType: 'text/plain' });
      await disk.put(k, new TextEncoder().encode('second'), { contentType: 'text/plain' });
      expect(new TextDecoder().decode(await disk.get(k))).toBe('second');
    });

    it('S-04 copy keeps the source, move takes it away, and both make the folders of the destination', async () => {
      await opened;
      const source = key('source.txt');
      await disk.put(source, new TextEncoder().encode('data'), { contentType: 'text/plain' });
      const copy = key('deep/er/copy.txt');
      await disk.copy(source, copy);
      expect(new TextDecoder().decode(await disk.get(copy))).toBe('data');
      expect(await disk.head(source)).toBeDefined();
      const moved = key('deep/er/moved.txt');
      await disk.move(source, moved);
      expect(new TextDecoder().decode(await disk.get(moved))).toBe('data');
      expect(await disk.head(source)).toBeUndefined();
    });

    it('S-04 delete removes a file, and deleting what is not there is not an error', async () => {
      await opened;
      const k = key('gone.txt');
      await disk.put(k, new TextEncoder().encode('x'), { contentType: 'text/plain' });
      await disk.delete(k);
      await disk.delete(k);
      expect(await disk.head(k)).toBeUndefined();
    });

    it('S-01 keys that look alike are different files', async () => {
      await opened;
      const base = key('sim');
      await disk.put(`${base}/a.txt`, new TextEncoder().encode('a'), { contentType: 'text/plain' });
      await disk.put(`${base}/a.txt.bak`, new TextEncoder().encode('b'), { contentType: 'text/plain' });
      expect(new TextDecoder().decode(await disk.get(`${base}/a.txt`))).toBe('a');
      expect(await disk.head(`${base}/a`)).toBeUndefined();
    });

    describe('signing', () => {
      it('S-01 a signed URL reads the file, with a name to save it under when asked', async () => {
        await opened;
        if (!disk.signing) return;
        const k = key('signed.txt');
        await disk.put(k, new TextEncoder().encode('signed hello'), { contentType: 'text/plain' });
        const plain = await fetch(await disk.signedUrl(k, { ttlMs: 60_000 }));
        expect(plain.status).toBe(200);
        expect(await plain.text()).toBe('signed hello');
        const named = await fetch(await disk.signedUrl(k, { ttlMs: 60_000, download: 'report.txt' }));
        expect(named.headers.get('content-disposition')).toContain('report.txt');
      });

      it('S-01 a signed URL stops working when its time is over', async () => {
        await opened;
        if (!disk.signing) return;
        const k = key('short.txt');
        await disk.put(k, new TextEncoder().encode('x'), { contentType: 'text/plain' });
        const url = await disk.signedUrl(k, { ttlMs: 1_000 });
        expect((await fetch(url)).status).toBe(200);
        await sleep(2_500);
        expect((await fetch(url)).status).toBe(403);
      });

      it('S-01 a signed upload takes the file that was announced, and only that', async () => {
        await opened;
        if (!disk.signing) return;
        const bytes = new TextEncoder().encode('uploaded by a browser');
        const k = key('upload.txt');
        const { url, headers } = await disk.signedUploadUrl(k, {
          ttlMs: 60_000,
          contentType: 'text/plain',
          size: bytes.length,
        });
        const sent = await fetch(url, { method: 'PUT', headers, body: bytes });
        expect(sent.status).toBe(200);
        expect(new TextDecoder().decode(await disk.get(k))).toBe('uploaded by a browser');

        const other = key('upload-wrong-type.txt');
        const signed = await disk.signedUploadUrl(other, {
          ttlMs: 60_000,
          contentType: 'text/plain',
          size: bytes.length,
        });
        const wrongType = await fetch(signed.url, {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: bytes,
        });
        expect(wrongType.status).toBeGreaterThanOrEqual(400);
        expect(await disk.head(other)).toBeUndefined();
      });

      it('S-01 a signed upload refuses a file of another size', async () => {
        await opened;
        if (!disk.signing) return;
        const k = key('upload-size.txt');
        const { url, headers } = await disk.signedUploadUrl(k, { ttlMs: 60_000, contentType: 'text/plain', size: 5 });
        const bigger = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(2000) });
        expect(bigger.status).toBeGreaterThanOrEqual(400);
        expect(await disk.head(k)).toBeUndefined();
      });
    });
  });
}
