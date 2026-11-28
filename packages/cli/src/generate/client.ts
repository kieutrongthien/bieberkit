/**
 * BieberKit
 *
 * @file        packages/cli/src/generate/client.ts
 * @description Writes the typed API client of the project from its OpenAPI document: one typed function for each operation, and the error that carries the problem of the server (API-07, GEN-03).
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

import type { ProjectConfigInput } from '@bieberkit/core';
import { generatedHeader } from './header.ts';
import { typeOf } from './schema-types.ts';

export const CLIENT_COMMAND = 'bieberkit client:generate';

type Json = Readonly<Record<string, unknown>>;
const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

interface Parameter {
  readonly name: string;
  readonly where: 'path' | 'query' | 'header';
  readonly required: boolean;
  readonly schema: unknown;
}

interface Operation {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly parameters: readonly Parameter[];
  readonly body: unknown;
  readonly output: unknown;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function jsonOf(content: unknown): unknown {
  return isJson(content) && isJson(content['application/json']) ? content['application/json']['schema'] : undefined;
}

/** Every operation of the document, in the order of its paths and methods. */
function operationsOf(document: Json): Operation[] {
  const paths = isJson(document['paths']) ? document['paths'] : {};
  return Object.entries(paths).flatMap(([path, methods]) =>
    METHODS.flatMap((method) => {
      const operation = isJson(methods) ? methods[method] : undefined;
      if (!isJson(operation) || typeof operation['operationId'] !== 'string') return [];
      const parameters = list(operation['parameters']).flatMap((entry): Parameter[] => {
        if (!isJson(entry) || typeof entry['name'] !== 'string') return [];
        const where = entry['in'];
        if (where !== 'path' && where !== 'query' && where !== 'header') return [];
        return [
          {
            name: entry['name'],
            where,
            required: entry['required'] === true || where === 'path',
            schema: entry['schema'],
          },
        ];
      });
      const body = isJson(operation['requestBody']) ? jsonOf(operation['requestBody']['content']) : undefined;
      const responses = isJson(operation['responses']) ? operation['responses'] : {};
      const success = Object.keys(responses)
        .filter((status) => /^2\d\d$/.test(status))
        .toSorted()[0];
      const output =
        success === undefined || !isJson(responses[success]) ? undefined : jsonOf(responses[success]['content']);
      return [{ id: operation['operationId'], method: method.toUpperCase(), path, parameters, body, output }];
    }),
  );
}

const pascal = (id: string): string => `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
const keyOf = (name: string): string => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

function fields(parameters: readonly Parameter[], where: Parameter['where']): string | undefined {
  const own = parameters.filter((entry) => entry.where === where);
  if (own.length === 0) return undefined;
  return `{ ${own.map((entry) => `${keyOf(entry.name)}${entry.required ? '' : '?'}: ${typeOf(entry.schema, '  ')}`).join('; ')} }`;
}

/** The input of an operation: what it takes in its path, its query, its headers and its body. */
interface Input {
  readonly name: string;
  readonly text: string;
  readonly required: boolean;
  /** The operation takes nothing: no path, query, header or body. */
  readonly empty: boolean;
}

function inputOf(operation: Operation): Input {
  const parts: [string, string, boolean][] = [];
  for (const where of ['path', 'query', 'headers'] as const) {
    const text = fields(operation.parameters, where === 'headers' ? 'header' : where);
    if (text !== undefined)
      parts.push([
        where,
        text,
        operation.parameters.some(
          (entry) => entry.where === (where === 'headers' ? 'header' : where) && entry.required,
        ),
      ]);
  }
  if (operation.body !== undefined) parts.push(['body', typeOf(operation.body, '  '), true]);
  const name = `${pascal(operation.id)}Input`;
  const body = parts.map(([key, text, required]) => `  readonly ${key}${required ? '' : '?'}: ${text};`).join('\n');
  return {
    name,
    text: `export interface ${name} {\n${body}\n}`,
    required: parts.some(([, , required]) => required),
    empty: parts.length === 0,
  };
}

const RUNTIME = `/** The error of an answer that is not a success: the status, and the problem that the server wrote (RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | undefined;

  constructor(status: number, problem: Problem | undefined) {
    super(problem?.detail ?? \`The request failed with \${status}.\`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

export interface ClientOptions {
  /** The address of the API, without a slash at its end. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  /** Headers for every call, read at each call: a token, a tenant. */
  readonly headers?: () => Readonly<Record<string, string>> | Promise<Readonly<Record<string, string>>>;
  readonly credentials?: RequestInit['credentials'];
}

interface CallInput {
  readonly path?: Readonly<Record<string, unknown>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

/** \`filter[tier][eq]=gold\`: an object is written as nested brackets, and a list as a repeated key. */
function writeQuery(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) writeQuery(params, key, item);
  } else if (typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) writeQuery(params, \`\${key}[\${name}]\`, item);
  } else {
    params.append(key, String(value));
  }
}

async function send(options: ClientOptions, method: string, template: string, input: CallInput): Promise<unknown> {
  let path = template;
  for (const [name, value] of Object.entries(input.path ?? {})) path = path.replace(\`{\${name}}\`, encodeURIComponent(String(value)));
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(input.query ?? {})) writeQuery(params, name, value);
  const query = params.toString();
  const headers: Record<string, string> = { accept: 'application/json', ...(await options.headers?.()) };
  for (const [name, value] of Object.entries(input.headers ?? {})) if (value !== undefined) headers[name] = String(value);
  if (input.body !== undefined) headers['content-type'] = 'application/json';
  const response = await (options.fetch ?? fetch)(\`\${options.baseUrl}\${path}\${query === '' ? '' : \`?\${query}\`}\`, {
    method,
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
  });
  const text = response.status === 204 ? '' : await response.text();
  const parsed: unknown = text === '' ? undefined : JSON.parse(text);
  if (!response.ok) throw new ApiError(response.status, parsed as Problem | undefined);
  return parsed;
}
`;

/**
 * The file `packages/client/src/index.ts`: the types of the API, an `ApiError`, and `createClient`, which has one typed function for
 * each operation of the document. The same document gives the same bytes (GEN-03).
 */
export function generateClient(document: Json, config: ProjectConfigInput): string {
  const operations = operationsOf(document);
  const schemas =
    isJson(document['components']) && isJson(document['components']['schemas'])
      ? document['components']['schemas']
      : {};
  const named = Object.entries(schemas).map(([name, schema]) => `export type ${name} = ${typeOf(schema)};`);
  const entries = operations.map((operation) => ({
    operation,
    input: inputOf(operation),
    type: `${pascal(operation.id)}Output`,
  }));
  const signature = ({ operation, input, type }: (typeof entries)[number]): string =>
    `  ${operation.id}(${input.empty ? '' : `input${input.required ? '' : '?'}: ${input.name}`}): Promise<${type}>;`;
  const method = ({ operation, input, type }: (typeof entries)[number]): string =>
    `    ${operation.id}: (${input.empty ? '' : 'input'}) =>\n      send(options, '${operation.method}', '${operation.path}', ${input.empty ? '{}' : 'input ?? {}'}) as Promise<${type}>,`;
  return [
    generatedHeader(
      config,
      'packages/client/src/index.ts',
      'The typed client of the API, generated from its OpenAPI document.',
      CLIENT_COMMAND,
    ),
    ...named.flatMap((line) => [line, '']),
    RUNTIME,
    ...entries.flatMap(({ operation, input, type }) => [
      ...(input.empty ? [] : [input.text]),
      `export type ${type} = ${operation.output === undefined ? 'void' : typeOf(operation.output)};`,
      '',
    ]),
    'export interface Client {',
    ...entries.map(signature),
    '}',
    '',
    '/** A client of the API at `options.baseUrl`. */',
    'export function createClient(options: ClientOptions): Client {',
    '  return {',
    ...entries.map(method),
    '  };',
    '}',
    '',
  ].join('\n');
}
