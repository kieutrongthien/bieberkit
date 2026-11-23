/**
 * BieberKit
 *
 * @file        packages/data/src/orm/reencrypt.ts
 * @description The rotation of the key of encrypted fields: every value that was made by an old key, or that was written before the field was encrypted, is written again with the current key (SEC-08).
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

import { dataError } from '../errors.ts';
import { uuid7FromBytes } from '../keys/uuid7.ts';
import { entityOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { currentKeyRing } from './encryption.ts';
import { isEncrypted } from '../crypto/field-crypto.ts';

export interface ReencryptOptions {
  /** Rows that are read at a time. Defaults to 200. */
  readonly batchSize?: number;
}

export interface ReencryptResult {
  /** The rows that had at least one value written again. */
  readonly rows: number;
  /** The values that were written again. */
  readonly fields: number;
}

const idOf = (value: unknown): string => (value instanceof Uint8Array ? uuid7FromBytes(value) : String(value));

/**
 * Writes again every encrypted value that the current key did not make, in every tenant (it runs as the system, and the use is
 * audited). A value that no key of the ring opens stops the run with `DATA_DECRYPTION_FAILED`, so a wrong ring never goes on to damage
 * data. A second run finds nothing to do. The roll of a key is: `APP_KEY_PREVIOUS` is the old key, `APP_KEY` the new one, this
 * function, and then the old key goes (SEC-08).
 */
export async function reencryptAll(
  db: Database,
  schemas: readonly OrmSchema[],
  options: ReencryptOptions = {},
): Promise<ReencryptResult> {
  const size = options.batchSize ?? 200;
  if (!Number.isInteger(size) || size < 1) {
    throw dataError(
      'DATA_REENCRYPT_INVALID',
      400,
      'The batch size must be a whole number of 1 or more.',
      'Use a number such as 200.',
    );
  }
  const ring = currentKeyRing();
  return db.asSystem('reencrypt the encrypted fields after a rotation of the key', async () => {
    let rows = 0;
    let fields = 0;
    const platform = db.orm.em.getPlatform();
    for (const schema of schemas) {
      const def = entityOfSchema(schema);
      const encrypted = Object.entries(def.fields).filter(([, field]) => field.encrypted === true);
      if (encrypted.length === 0) continue;
      const meta = db.orm.getMetadata().get(schema);
      const columnOf = (property: string): string => {
        // The metadata is keyed by property name, which TypeScript sees as a key of an enum of the ORM.
        // oxlint-disable-next-line typescript/no-unsafe-enum-assignment
        const name = meta.properties[property]?.fieldNames[0];
        if (name === undefined)
          throw dataError(
            'DATA_REENCRYPT_INVALID',
            500,
            `${property} has no column.`,
            'This is a bug of the compiler.',
          );
        return platform.quoteIdentifier(name);
      };
      const idColumn = columnOf('id');
      const select = [idColumn, ...encrypted.map(([name]) => columnOf(name))].join(', ');
      const table = platform.quoteIdentifier(meta.tableName);
      for (let offset = 0; ; offset += size) {
        const batch: Record<string, unknown>[] = await db.orm.em
          .getConnection()
          .execute(`select ${select} from ${table} order by ${idColumn} limit ${size} offset ${offset}`);
        for (const raw of batch) {
          const values = Object.values(raw);
          const changes: Record<string, string> = {};
          encrypted.forEach(([name], index) => {
            const stored = values[index + 1];
            if (typeof stored !== 'string' || stored === '') return;
            if (isEncrypted(stored) && ring.isCurrent(stored)) return;
            changes[name] = isEncrypted(stored) ? ring.decrypt(stored, `${def.name}.${name}`) : stored;
          });
          const names = Object.keys(changes);
          if (names.length === 0) continue;
          const id = idOf(values[0]);
          await runInUnitOfWork(db, async (em) => {
            await em.nativeUpdate(schema, { id }, changes);
          });
          rows += 1;
          fields += names.length;
        }
        if (batch.length < size) break;
      }
    }
    return { rows, fields };
  });
}
