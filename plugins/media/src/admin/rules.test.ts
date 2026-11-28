/**
 * BieberKit
 *
 * @file        plugins/media/src/admin/rules.test.ts
 * @description The rules of the control of a file: the types that a field takes, a file that was picked, its name and its size (UI-11).
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

import type { MetaField } from '@bieberkit/admin-core';
import { describe, expect, it } from 'vitest';
import { acceptAttribute, acceptsType, fileProblem, isPicture, sizeText, uploadName } from './rules.ts';
import type { MediaFile } from './rules.ts';

const field = (accept?: string[]): MetaField => ({
  key: 'logo',
  kind: 'string',
  widget: 'image',
  required: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  ...(accept === undefined ? {} : { accept }),
});

describe('UI-11 the types that a field takes', () => {
  it('UI-11 a star takes a family, an exact type takes itself, a list takes any of them, none takes anything', () => {
    expect(acceptsType(['image/*'], 'image/webp')).toBe(true);
    expect(acceptsType(['image/*'], 'application/pdf')).toBe(false);
    expect(acceptsType(['application/pdf', 'image/png'], 'IMAGE/PNG; q=1')).toBe(true);
    expect(acceptsType([], 'x/y')).toBe(true);
  });

  it('UI-11 the attribute of a file input is the types, joined, and nothing when the field takes any', () => {
    expect(acceptAttribute(field(['image/*', 'application/pdf']))).toBe('image/*,application/pdf');
    expect(acceptAttribute(field([]))).toBeUndefined();
    expect(acceptAttribute(field())).toBeUndefined();
  });
});

describe('UI-11 a file that was picked', () => {
  it('UI-11 is refused when it is empty or of another type, and left to the server when the browser does not know its type', () => {
    expect(fileProblem(field(['image/*']), { name: 'a.png', size: 0, type: 'image/png' })).toBe('empty');
    expect(fileProblem(field(['image/*']), { name: 'a.pdf', size: 10, type: 'application/pdf' })).toBe('type');
    expect(fileProblem(field(['image/*']), { name: 'a.png', size: 10, type: 'image/png' })).toBeUndefined();
    expect(fileProblem(field(['image/*']), { name: 'a.xyz', size: 10, type: '' })).toBeUndefined();
  });

  it('UI-11 is sent under a name that the media routes take: letters, digits and . _ -, three characters at least', () => {
    expect(uploadName('Báo cáo (final).pdf')).toMatch(/^[\w.-]+$/);
    expect(uploadName('my file.png')).toBe('my_file.png');
    expect(uploadName('é')).toMatch(/^file_/);
    expect(uploadName('a'.repeat(300)).length).toBe(200);
    expect(uploadName('..hidden')).toBe('hidden');
  });

  it('UI-11 a size is shown the way that people read it, and a file is a picture when it is an image that was uploaded', () => {
    expect([sizeText(12), sizeText(2048), sizeText(5 * 1024 * 1024)]).toEqual(['12 B', '2.0 kB', '5.0 MB']);
    const file: MediaFile = {
      id: 'm',
      filename: 'a.png',
      contentType: 'image/png',
      kind: 'image',
      size: 1,
      status: 'ready',
    };
    expect(isPicture(file)).toBe(true);
    expect(isPicture({ ...file, status: 'pending' })).toBe(false);
    expect(isPicture({ ...file, contentType: 'application/pdf' })).toBe(false);
  });
});
