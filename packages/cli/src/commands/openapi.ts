/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/openapi.ts
 * @description bieberkit openapi: the OpenAPI document of the application, printed or written to a file (section 5.2, API-06).
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadApp } from '../app.ts';
import type { Command } from '../command.ts';
import { openApiOf } from '../generate/files.ts';

export const openapiCommand: Command = {
  name: 'openapi',
  summary: 'Print openapi.json, or write it to a file with --out.',
  flags: [{ name: 'out', type: 'string', description: 'Write the document to this file.' }],
  async run(context) {
    const document = openApiOf(await loadApp(context.cwd));
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const out = context.args.flags['out'];
    if (typeof out === 'string') {
      const path = resolve(context.cwd, out);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      return { data: { path, operations: Object.keys(Object(document['paths'])).length }, text: `Wrote ${path}` };
    }
    return { data: document, text: text.trimEnd() };
  },
};
