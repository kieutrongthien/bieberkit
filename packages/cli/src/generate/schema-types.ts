/**
 * BieberKit
 *
 * @file        packages/cli/src/generate/schema-types.ts
 * @description Turns a JSON Schema of the API into the TypeScript type of the value that it describes, the same text every time (API-07, GEN-03).
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

type Schema = Readonly<Record<string, unknown>>;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const key = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(name));
const isSchema = (value: unknown): value is Schema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const literal = (value: unknown): string => (typeof value === 'string' ? JSON.stringify(value) : String(value));

function objectType(schema: Schema, indent: string): string {
  const properties = isSchema(schema['properties']) ? schema['properties'] : {};
  const required = new Set(list(schema['required']).filter((name): name is string => typeof name === 'string'));
  const lines = Object.entries(properties).map(
    ([name, child]) => `${indent}  ${key(name)}${required.has(name) ? '' : '?'}: ${typeOf(child, `${indent}  `)};`,
  );
  const extra = schema['additionalProperties'];
  if (isSchema(extra)) lines.push(`${indent}  [key: string]: ${typeOf(extra, `${indent}  `)};`);
  if (lines.length === 0) return extra === false ? 'Record<string, never>' : 'Record<string, unknown>';
  return `{\n${lines.join('\n')}\n${indent}}`;
}

/** The type of one schema. A reference to `#/components/schemas/Name` is the type `Name`. */
export function typeOf(schema: unknown, indent = ''): string {
  if (schema === true || schema === undefined) return 'unknown';
  if (schema === false) return 'never';
  if (!isSchema(schema)) return 'unknown';
  const ref = schema['$ref'];
  if (typeof ref === 'string') return ref.split('/').at(-1) ?? 'unknown';
  if (Array.isArray(schema['enum'])) return schema['enum'].map(literal).join(' | ');
  if ('const' in schema) return literal(schema['const']);
  for (const [word, join] of [
    ['anyOf', ' | '],
    ['oneOf', ' | '],
    ['allOf', ' & '],
  ] as const) {
    const parts = list(schema[word]);
    if (parts.length > 0) return parts.map((part) => typeOf(part, indent)).join(join);
  }
  const type = schema['type'];
  if (Array.isArray(type)) return type.map((one) => typeOf({ ...schema, type: one }, indent)).join(' | ');
  switch (type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array': {
      const item = typeOf(schema['items'], indent);
      return /[|&]/.test(item) ? `(${item})[]` : `${item}[]`;
    }
    case 'object':
      return objectType(schema, indent);
    default:
      return isSchema(schema['properties']) ? objectType(schema, indent) : 'unknown';
  }
}
