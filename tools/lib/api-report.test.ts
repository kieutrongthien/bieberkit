/**
 * BieberKit
 *
 * @file        tools/lib/api-report.test.ts
 * @description Tests for the API report that snapshots the public surface of each package.
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
import { changesetRule, normalize, render, reportFileName } from './api-report.ts';

const LICENSE_BLOCK = `/**
 * BieberKit
 *
 * @file        packages/core/src/index.ts
 * @description Public entry point.
 */`;

describe('API report', () => {
  it('drops comments, so a doc change is not an API change', () => {
    const a = `${LICENSE_BLOCK}\n/** npm name of this package. */\nexport declare const packageName = "@bieberkit/core";`;
    const b = `/** Another description. */\nexport declare const packageName = "@bieberkit/core"; // trailing`;
    expect(normalize(a)).toBe(normalize(b));
    expect(normalize(a)).toBe('export declare const packageName = "@bieberkit/core";\n');
  });

  it('keeps comment-like text inside string literals', () => {
    const dts = 'export declare const url = "http://example.test/*not a comment*/";';
    expect(normalize(dts)).toBe(`${dts}\n`);
  });

  it('drops source map comments and blank lines', () => {
    const dts =
      'export declare const a: number;\n\n\n//# sourceMappingURL=index.d.ts.map\n\nexport declare const b: number;\n';
    expect(normalize(dts)).toBe('export declare const a: number;\nexport declare const b: number;\n');
  });

  it('sorts a block of import lines, so import order is not an API change', () => {
    const one = "import { b } from './b';\nimport { a } from './a';\nexport declare const x: a & b;";
    const two = "import { a } from './a';\nimport { b } from './b';\nexport declare const x: a & b;";
    expect(normalize(one)).toBe(normalize(two));
  });

  it('keeps every export and every changed signature visible', () => {
    const before = 'export declare function run(input: string): number;';
    const after = 'export declare function run(input: string, strict: boolean): number;';
    expect(normalize(before)).not.toBe(normalize(after));
    expect(normalize('export declare const a = 1;\nexport declare const b = 2;')).toContain(
      'export declare const b = 2;',
    );
  });

  it('is idempotent', () => {
    const dts = `${LICENSE_BLOCK}\nexport declare const a: number; // x\n\nexport interface I { a: 1 }`;
    expect(normalize(normalize(dts))).toBe(normalize(dts));
  });

  it('names the report after the declaration file', () => {
    expect(reportFileName('index.d.ts')).toBe('index.api.md');
    expect(reportFileName('cli.d.ts')).toBe('cli.api.md');
  });

  it('renders a Markdown file with the header, the @generated tag and the declarations in a code block', () => {
    const text = render({
      packageName: '@bieberkit/core',
      repoPath: 'packages/core/api/index.api.md',
      declarations: 'export declare const a: number;\n',
    });
    expect(text.startsWith('<!--\n  BieberKit\n')).toBe(true);
    expect(text).toContain('@file        packages/core/api/index.api.md');
    expect(text).toContain('@generated   pnpm api:update');
    expect(text).toContain('```ts\nexport declare const a: number;\n```');
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('changeset rule (spec 22.3, step 4)', () => {
  it('needs no changeset when nothing in an API report changed', () => {
    expect(changesetRule(['M\tdocs/ROADMAP.md', 'A\ttools/api-report.ts'])).toEqual({
      needed: false,
      present: false,
      reports: [],
    });
  });

  it('needs a changeset when an existing API report is modified', () => {
    const r = changesetRule(['M\tpackages/core/api/index.api.md', 'M\tpackages/core/src/index.ts']);
    expect(r.needed).toBe(true);
    expect(r.present).toBe(false);
    expect(r.reports).toEqual(['packages/core/api/index.api.md']);
  });

  it('needs a changeset when an API report is deleted', () => {
    expect(changesetRule(['D\tpackages/http/api/index.api.md']).needed).toBe(true);
  });

  it('needs no changeset for the first report of a package, which is only added', () => {
    expect(changesetRule(['A\tpackages/new/api/index.api.md']).needed).toBe(false);
  });

  it('is satisfied by an added changeset file', () => {
    const r = changesetRule(['M\tpackages/core/api/index.api.md', 'A\t.changeset/quiet-lions-sing.md']);
    expect(r).toEqual({ needed: true, present: true, reports: ['packages/core/api/index.api.md'] });
  });

  it('does not count the changesets README or config as a changeset', () => {
    const r = changesetRule([
      'M\tpackages/core/api/index.api.md',
      'M\t.changeset/README.md',
      'M\t.changeset/config.json',
    ]);
    expect(r.present).toBe(false);
  });

  it('reads renames as a modification of the new path', () => {
    expect(changesetRule(['R100\tpackages/a/api/x.api.md\tpackages/a/api/index.api.md']).needed).toBe(true);
  });
});
