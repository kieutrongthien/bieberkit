/**
 * BieberKit
 *
 * @file        packages/cli/src/run.test.ts
 * @description Tests of the runner: help, version, a command that does not exist, the shape of --json, stdout and stderr, and the exit codes (section 5.3, AI-02, AI-03).
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
import { runCli } from './run.ts';
import type { Io } from './run.ts';

function capture(cwd = process.cwd()): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (text) => out.push(text), stderr: (text) => err.push(text), cwd, env: {} }, out, err };
}

const documentOf = (out: readonly string[]): Record<string, unknown> => {
  expect(out).toHaveLength(1);
  const parsed: unknown = JSON.parse(out[0] ?? '');
  return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
};

describe('section 5.3 output and exit codes', () => {
  it('5.3 no command prints the help and exits with 0', async () => {
    const { io, out, err } = capture();
    expect(await runCli([], io)).toBe(0);
    expect(out.join('')).toContain('Usage: bieberkit <command>');
    expect(out.join('')).toContain('env:check');
    expect(err).toEqual([]);
  });

  it('5.3 the help of a command lists its own flags and the flags of every command', async () => {
    const { io, out } = capture();
    expect(await runCli(['env:example', '--help'], io)).toBe(0);
    const text = out.join('');
    expect(text).toContain('Usage: bieberkit env:example');
    expect(text).toContain('--write');
    expect(text).toContain('--json');
  });

  it('5.3 --version prints the version', async () => {
    const { io, out } = capture();
    expect(await runCli(['--version'], io)).toBe(0);
    expect(out.join('')).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('AI-03 --json prints one document on stdout: ok, the command and the data', async () => {
    const { io, out, err } = capture();
    expect(await runCli(['--json', '--version'], io)).toBe(0);
    expect(documentOf(out)).toMatchObject({
      ok: true,
      command: 'version',
      data: { version: expect.stringMatching(/^\d/) },
    });
    expect(err).toEqual([]);
  });

  it('AI-02 a command that does not exist is a usage error with a code, a fix, a link and a suggestion, exit code 2', async () => {
    const { io, out, err } = capture();
    expect(await runCli(['plugin'], io)).toBe(2);
    expect(out).toEqual([]);
    const text = err.join('');
    expect(text).toContain('error[BK_USAGE_UNKNOWN_COMMAND]');
    expect(text).toContain('Did you mean plugins?');
    expect(text).toContain('docs: https://');
  });

  it('AI-02 with --json a failure is a document on stdout, and stderr stays empty', async () => {
    const { io, out, err } = capture();
    expect(await runCli(['--json', 'zzzzzzzz'], io)).toBe(2);
    expect(documentOf(out)).toMatchObject({
      ok: false,
      command: 'zzzzzzzz',
      error: {
        code: 'BK_USAGE_UNKNOWN_COMMAND',
        exit: 2,
        fix: expect.any(String),
        docs: expect.stringContaining('BK_USAGE_UNKNOWN_COMMAND'),
      },
    });
    expect(err).toEqual([]);
  });

  it('5.3 a flag that the command does not take is a usage error', async () => {
    const { io, err } = capture();
    expect(await runCli(['plugins', '--write'], io)).toBe(2);
    expect(err.join('')).toContain('BK_USAGE_UNKNOWN_FLAG');
  });

  it('5.3 a command that is not in a project fails with exit code 1 and a code that says what to do', async () => {
    const { io, err } = capture('/');
    expect(await runCli(['plugins'], io)).toBe(1);
    expect(err.join('')).toContain('BK_PROJECT_NOT_FOUND');
    expect(err.join('')).toContain('fix:');
  });

  it('5.3 --cwd runs the command as if it was started in that directory', async () => {
    const { io, err } = capture(process.cwd());
    expect(await runCli(['plugins', '--cwd', '/'], io)).toBe(1);
    expect(err.join('')).toContain('BK_PROJECT_NOT_FOUND');
  });
});
