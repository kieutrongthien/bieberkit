/**
 * BieberKit
 *
 * @file        packages/storage/src/testing/fixtures.ts
 * @description Small real files for the tests of the storage: one for each default type, and a builder of stored zip files for the Office types.
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

import { crc32 } from 'node:zlib';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const u16 = (value: number): Uint8Array => bytes(value & 0xff, (value >> 8) & 0xff);
const u32 = (value: number): Uint8Array =>
  bytes(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);

/** A zip file with its entries stored, not compressed. It is what an Office file is, and enough for the sniffer to read. */
export function zip(entries: Readonly<Record<string, string>>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = ascii(text);
    const nameBytes = ascii(name);
    const crc = crc32(data);
    const local = join(
      bytes(0x50, 0x4b, 0x03, 0x04),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0x21),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    );
    centrals.push(
      join(
        bytes(0x50, 0x4b, 0x01, 0x02),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ),
    );
    locals.push(local);
    offset += local.length;
  }
  const central = join(...centrals);
  const end = join(
    bytes(0x50, 0x4b, 0x05, 0x06),
    u16(0),
    u16(0),
    u16(centrals.length),
    u16(centrals.length),
    u32(central.length),
    u32(offset),
    u16(0),
  );
  return join(...locals, central, end);
}

const CONTENT_TYPES = (main: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.PLACEHOLDER.main+xml"/></Types>`;

export const FILES: Readonly<Record<string, Uint8Array>> = {
  png: Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  ),
  jpg: bytes(
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xd9,
  ),
  gif: join(
    ascii('GIF89a'),
    bytes(1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b),
  ),
  webp: join(
    ascii('RIFF'),
    u32(30),
    ascii('WEBPVP8 '),
    u32(10),
    bytes(0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00),
  ),
  pdf: ascii('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
  zip: zip({ 'hello.txt': 'hello' }),
  docx: zip({
    '[Content_Types].xml': CONTENT_TYPES('word/document.xml').replace('PLACEHOLDER', 'wordprocessingml.document'),
    'word/document.xml': '<w:document/>',
  }),
  xlsx: zip({
    '[Content_Types].xml': CONTENT_TYPES('xl/workbook.xml').replace('PLACEHOLDER', 'spreadsheetml.sheet'),
    'xl/workbook.xml': '<workbook/>',
  }),
  pptx: zip({
    '[Content_Types].xml': CONTENT_TYPES('ppt/presentation.xml').replace('PLACEHOLDER', 'presentationml.presentation'),
    'ppt/presentation.xml': '<p:presentation/>',
  }),
  mp4: join(
    bytes(0, 0, 0, 0x18),
    ascii('ftypmp42'),
    bytes(0, 0, 0, 0),
    ascii('mp42isom'),
    bytes(0, 0, 0, 8),
    ascii('free'),
  ),
  webm: bytes(
    0x1a,
    0x45,
    0xdf,
    0xa3,
    0x9f,
    0x42,
    0x86,
    0x81,
    0x01,
    0x42,
    0xf7,
    0x81,
    0x01,
    0x42,
    0xf2,
    0x81,
    0x04,
    0x42,
    0xf3,
    0x81,
    0x08,
    0x42,
    0x82,
    0x84,
    ...ascii('webm'),
    0x42,
    0x87,
    0x81,
    0x02,
    0x42,
    0x85,
    0x81,
    0x02,
  ),
  mp3: join(
    ascii('ID3'),
    bytes(3, 0, 0, 0, 0, 0, 0x21),
    new Uint8Array(33),
    bytes(0xff, 0xfb, 0x90, 0x00),
    new Uint8Array(64),
  ),
  txt: ascii('Xin chào, đây là một tệp văn bản.\n'),
  csv: ascii('id,name\n1,An\n2,Bình\n'),
  json: ascii('{"ok":true}'),
};

/** Files that are not what their name says. */
export const EXE: Uint8Array = join(
  ascii('MZ'),
  bytes(0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff),
  new Uint8Array(60),
);
export const SVG: Uint8Array = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
