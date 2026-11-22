/**
 * BieberKit
 *
 * @file        packages/data/src/orm/uuid7-type.test.ts
 * @description Tests for the UUIDv7 column type on the three platforms, without a database (DATA-14).
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

import { MySqlPlatform } from '@mikro-orm/mysql';
import { PostgreSqlPlatform } from '@mikro-orm/postgresql';
import { SqlitePlatform } from '@mikro-orm/sqlite';
import { describe, expect, it } from 'vitest';
import { uuid7, uuid7ToBytes } from '../keys/uuid7.ts';
import { Uuid7Type } from './uuid7-type.ts';

const platforms = {
  postgres: new PostgreSqlPlatform(),
  mysql: new MySqlPlatform(),
  sqlite: new SqlitePlatform(),
} as const;
const ID = '0190f6b2-7c4e-7000-8000-0123456789ab';
const type = new Uuid7Type();

// The type only reads the platform to choose a column kind, so the column type is checked with a stand-in property.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const prop = {} as never;

describe('DATA-14 column types', () => {
  it('DATA-14 is uuid on PostgreSQL, binary(16) on MySQL and blob on SQLite', () => {
    expect(type.getColumnType(prop, platforms.postgres)).toBe('uuid');
    expect(type.getColumnType(prop, platforms.mysql)).toBe('binary(16)');
    expect(type.getColumnType(prop, platforms.sqlite)).toBe('blob');
  });
});

describe('DATA-14 to the database', () => {
  it('DATA-14 PostgreSQL gets the lower case text', () => {
    expect(type.convertToDatabaseValue(ID.toUpperCase(), platforms.postgres)).toBe(ID);
  });

  it.each(['mysql', 'sqlite'] as const)('DATA-14 %s gets 16 bytes', (name) => {
    const value = type.convertToDatabaseValue(ID, platforms[name]);
    expect(Buffer.isBuffer(value)).toBe(true);
    expect(value).toEqual(Buffer.from(uuid7ToBytes(ID)));
  });

  it('DATA-14 accepts a value that is already 16 bytes, because the Kysely plugin can convert twice', () => {
    const bytes = Buffer.from(uuid7ToBytes(ID));
    expect(type.convertToDatabaseValue(bytes, platforms.sqlite)).toEqual(bytes);
    expect(type.convertToDatabaseValue(bytes, platforms.postgres)).toBe(ID);
  });

  it('DATA-14 null and undefined stay null', () => {
    for (const name of ['postgres', 'mysql', 'sqlite'] as const) {
      expect(type.convertToDatabaseValue(null, platforms[name])).toBeNull();
      expect(type.convertToDatabaseValue(undefined, platforms[name])).toBeNull();
    }
  });

  it.each([[''], ['not-a-uuid'], ['0190f6b2-7c4e-7000-8000-0123456789a'], [' ' + ID], [ID + ' ']])(
    'DATA-14 refuses the text %j with DATA_UUID_INVALID on every platform, before the database sees it',
    (value) => {
      for (const name of ['postgres', 'mysql', 'sqlite'] as const) {
        expect(() => type.convertToDatabaseValue(value, platforms[name])).toThrowError(
          expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
        );
      }
    },
  );

  it('DATA-14 refuses bytes of the wrong length', () => {
    for (const length of [0, 15, 17]) {
      expect(() => type.convertToDatabaseValue(Buffer.alloc(length), platforms.mysql)).toThrowError(
        expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
      );
    }
  });

  it('DATA-14 refuses a value that is neither text nor bytes', () => {
    for (const value of [42, {}, [], true]) {
      // @ts-expect-error the type says string, and the run time check backs it up
      expect(() => type.convertToDatabaseValue(value, platforms.postgres)).toThrowError(
        expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
      );
    }
  });
});

describe('DATA-14 from the database', () => {
  it('DATA-14 reads 16 bytes, a Uint8Array or text as a lower case string', () => {
    expect(type.convertToJSValue(Buffer.from(uuid7ToBytes(ID)), platforms.mysql)).toBe(ID);
    expect(type.convertToJSValue(new Uint8Array(uuid7ToBytes(ID)), platforms.sqlite)).toBe(ID);
    expect(type.convertToJSValue(ID.toUpperCase(), platforms.postgres)).toBe(ID);
  });

  it('DATA-14 a stored value that is not a UUID is an error, never a wrong id', () => {
    expect(() => type.convertToJSValue(Buffer.alloc(0), platforms.mysql)).toThrowError(
      expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
    );
    expect(() => type.convertToJSValue('x', platforms.postgres)).toThrowError(
      expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
    );
  });

  it('DATA-14 null stays null', () => {
    expect(type.convertToJSValue(null, platforms.postgres)).toBeNull();
  });

  it('DATA-14 a generated id survives the round trip on every platform', () => {
    for (const name of ['postgres', 'mysql', 'sqlite'] as const) {
      const id = uuid7();
      expect(type.convertToJSValue(type.convertToDatabaseValue(id, platforms[name]), platforms[name])).toBe(id);
    }
  });

  it('DATA-14 compares as text and serializes as text', () => {
    expect(type.compareAsType()).toBe('string');
    expect(type.toJSON(ID, platforms.sqlite)).toBe(ID);
  });
});
