/**
 * BieberKit
 *
 * @file        packages/admin-core/src/drafts.test.ts
 * @description Tests of the unsaved changes of a form: dirty tracking, the local draft and the three-way merge of a 412 conflict (UI-17, UI-18).
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

import { describe, expect, it } from 'vitest';
import { clearDraft, draftKey, isDirty, loadDraft, reapply, saveDraft } from './drafts.ts';
import type { DraftStorage } from './drafts.ts';

const memory = (): DraftStorage & { readonly data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

describe('UI-17 dirty tracking', () => {
  it('UI-17 a form is dirty when a value differs from the one it started with, and an empty text is the same as nothing', () => {
    expect(isDirty({ a: 'x', b: 1 }, { a: 'x', b: 1 })).toBe(false);
    expect(isDirty({ a: 'x' }, { a: 'y' })).toBe(true);
    expect(isDirty({ a: undefined }, { a: '' })).toBe(false);
    expect(isDirty({ a: null }, { a: undefined })).toBe(false);
    expect(isDirty({ a: [1, 2] }, { a: [1, 2] })).toBe(false);
    expect(isDirty({ a: { amount: '1' } }, { a: { amount: '2' } })).toBe(true);
    expect(isDirty({ a: 'x' }, { a: 'x', b: 'new' })).toBe(true);
  });
});

describe('UI-17 the local draft', () => {
  const key = draftKey('crm.Account', undefined, 'user-1');

  it('UI-17 the key tells the user, the entity and the record, so two people on one browser do not share a draft', () => {
    expect(key).toBe('bk-draft:user-1:crm.Account:new');
    expect(draftKey('crm.Account', 'abc', 'user-1')).toBe('bk-draft:user-1:crm.Account:abc');
    expect(draftKey('crm.Account', 'abc', 'user-2')).not.toBe(draftKey('crm.Account', 'abc', 'user-1'));
  });

  it('UI-17 a draft is saved and read back, and it goes when the form is saved', () => {
    const storage = memory();
    saveDraft(storage, key, { name: 'Ann' }, 1_000);
    expect(loadDraft(storage, key, 2_000)).toEqual({ name: 'Ann' });
    clearDraft(storage, key);
    expect(loadDraft(storage, key, 2_000)).toBeUndefined();
  });

  it('UI-17 a draft that is a week old is not offered, and is dropped', () => {
    const storage = memory();
    saveDraft(storage, key, { name: 'Ann' }, 1_000);
    expect(loadDraft(storage, key, 1_000 + 7 * 86_400_000 + 1)).toBeUndefined();
    expect(storage.data.size).toBe(0);
  });

  it('UI-17 the fields that must not rest in a browser are left out of the draft', () => {
    const storage = memory();
    saveDraft(storage, key, { name: 'Ann', nationalId: '123' }, 1_000, new Set(['nationalId']));
    expect(loadDraft(storage, key, 2_000)).toEqual({ name: 'Ann' });
  });

  it('UI-17 a draft that is too big, a storage that refuses and a text that is not a draft are all quiet', () => {
    const storage = memory();
    saveDraft(storage, key, { note: 'x'.repeat(200_000) }, 1_000);
    expect(storage.data.size).toBe(0);
    const refusing: DraftStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveDraft(refusing, key, { a: 1 }, 1)).not.toThrow();
    expect(loadDraft(refusing, key, 1)).toBeUndefined();
    storage.data.set(key, '{not json');
    expect(loadDraft(storage, key, 1)).toBeUndefined();
    storage.data.set(key, JSON.stringify({ at: 'now', values: 3 }));
    expect(loadDraft(storage, key, 1)).toBeUndefined();
  });
});

describe('UI-18 the 412 conflict', () => {
  const base = { name: 'Ann', city: 'Hue', note: 'a' };

  it('UI-18 what only the person changed is kept, what only the others changed is taken, and what both changed is a conflict', () => {
    const mine = { name: 'Ann B', city: 'Hue', note: 'mine' };
    const theirs = { name: 'Ann', city: 'Da Nang', note: 'theirs' };
    const merged = reapply(base, mine, theirs);
    expect(merged.values).toEqual({ name: 'Ann B', city: 'Da Nang', note: 'mine' });
    expect(merged.conflicts).toEqual([{ key: 'note', base: 'a', mine: 'mine', theirs: 'theirs' }]);
  });

  it('UI-18 a field that both set to the same value is not a conflict', () => {
    const merged = reapply(base, { ...base, note: 'same' }, { ...base, note: 'same' });
    expect(merged.conflicts).toEqual([]);
    expect(merged.values['note']).toBe('same');
  });

  it('UI-18 with nothing changed by the person the result is the row of the others', () => {
    const theirs = { name: 'Zed', city: 'X', note: 'n' };
    expect(reapply(base, base, theirs)).toEqual({ values: theirs, conflicts: [] });
  });
});
