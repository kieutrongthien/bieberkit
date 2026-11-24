/**
 * BieberKit
 *
 * @file        packages/log/src/testing/contract-suite.ts
 * @description The cases every logger passes: the line of OBS-01, the levels, child loggers and the redaction of CFG-05 and SEC-09, run against the default logger of core and the pino adapter.
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

import { requestContext } from '@bieberkit/core';
import type { LogLevel, Logger, LoggerOptions } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';

export interface LoggerSubject {
  /** A logger that honours every option, and writes each line, without a trailing newline, to `options.write`. */
  readonly make: (options: LoggerOptions) => Logger;
}

const NOW = new Date('2026-11-22T10:00:00.000Z');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLine(line: string): Record<string, unknown> {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error('A log line must be a JSON object.');
  return value;
}

/**
 * The cases every logger passes (OBS-01, SEC-09, CFG-05, ADR 0003). The core default logger and `@bieberkit/log/pino` run it, so a
 * line reads the same whichever is bound. A new adapter must pass it.
 */
export function loggerContractSuite(name: string, subject: LoggerSubject): void {
  function capture(options: Partial<LoggerOptions> = {}): {
    logger: Logger;
    lines: string[];
    parsed: () => Record<string, unknown>[];
  } {
    const lines: string[] = [];
    const logger = subject.make({
      level: 'info',
      role: 'web',
      write: (line) => lines.push(line),
      now: () => NOW,
      ...options,
    });
    return { logger, lines, parsed: () => lines.map(parseLine) };
  }

  describe(`${name} logger contract`, () => {
    it('OBS-01 is one JSON object with time, level, msg and role', () => {
      const { logger, lines, parsed } = capture();
      logger.info('server started');
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('\n');
      expect(parsed()[0]).toEqual({
        time: '2026-11-22T10:00:00.000Z',
        level: 'info',
        msg: 'server started',
        role: 'web',
      });
    });

    it('OBS-01 adds request, trace, tenant and user ids from the request context', () => {
      const { logger, parsed } = capture();
      requestContext.run({ requestId: 'r1', traceId: 't1', spanId: 's1', tenantId: 'ten1', userId: 'u1' }, () =>
        logger.info('inside'),
      );
      expect(parsed()[0]).toMatchObject({
        requestId: 'r1',
        traceId: 't1',
        spanId: 's1',
        tenantId: 'ten1',
        userId: 'u1',
      });
    });

    it('OBS-01 leaves out the ids that are not known, and the ids of a request that ended', () => {
      const { logger, parsed } = capture();
      requestContext.run({ requestId: 'r1' }, () => logger.info('inside'));
      logger.info('outside');
      const [inside = {}, outside = {}] = parsed();
      expect(inside['requestId']).toBe('r1');
      for (const key of ['traceId', 'spanId', 'tenantId', 'userId']) expect(inside).not.toHaveProperty(key);
      expect(outside).not.toHaveProperty('requestId');
    });

    it('OBS-01 puts extra fields on the line and never lets them replace the base fields', () => {
      const { logger, parsed } = capture();
      logger.info('real', { time: 'x', level: 'x', msg: 'x', role: 'x', requestId: 'x', deal: 7 });
      expect(parsed()[0]).toEqual({
        time: '2026-11-22T10:00:00.000Z',
        level: 'info',
        msg: 'real',
        role: 'web',
        deal: 7,
      });
    });

    it('OBS-01 writes an Error with its name, message, code and stack', () => {
      const { logger, parsed } = capture();
      logger.error('failed', { err: Object.assign(new Error('boom', { cause: new Error('inner') }), { code: 'E_X' }) });
      const err = parsed()[0]?.['err'];
      expect(err).toMatchObject({ name: 'Error', message: 'boom', code: 'E_X', cause: { message: 'inner' } });
      expect(isRecord(err) ? err['stack'] : undefined).toEqual(expect.stringContaining('boom'));
    });

    it('OBS-01 survives circular references, bigint, undefined and a date', () => {
      const { logger, parsed } = capture();
      const loop: Record<string, unknown> = { name: 'loop' };
      loop['self'] = loop;
      logger.info('odd', { loop, big: 10n, nothing: undefined, at: new Date('2026-01-02T03:04:05.000Z') });
      expect(parsed()[0]).toMatchObject({
        loop: { name: 'loop', self: '[circular]' },
        big: '10',
        at: '2026-01-02T03:04:05.000Z',
      });
      expect(parsed()[0]).not.toHaveProperty('nothing');
    });

    it('CORE-01 writes a line only at or above the configured level, and says its level', () => {
      const { logger, parsed } = capture({ level: 'warn' });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      logger.fatal('f');
      expect(logger.level).toBe('warn');
      expect(parsed().map((line) => line['level'])).toEqual(['warn', 'error', 'fatal']);
    });

    it('CORE-01 trace level writes every level', () => {
      const { logger, parsed } = capture({ level: 'trace' });
      const levels: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
      for (const level of levels) logger[level](level);
      expect(parsed().map((line) => line['level'])).toEqual(levels);
    });

    it('CORE-01 child adds bindings to every line and keeps the level, and a child of a child keeps both', () => {
      const { logger, parsed } = capture({ level: 'warn' });
      const child = logger.child({ module: 'crm' });
      child.info('hidden');
      child.warn('shown', { deal: 7 });
      child.child({ job: 'j1' }).warn('deep');
      expect(child.level).toBe('warn');
      expect(parsed()).toHaveLength(2);
      expect(parsed()[0]).toMatchObject({ module: 'crm', deal: 7 });
      expect(parsed()[1]).toMatchObject({ module: 'crm', job: 'j1' });
    });

    it('CORE-01 a binding never replaces a base field, and the parent is unchanged by its child', () => {
      const { logger, parsed } = capture();
      logger.child({ role: 'x', module: 'crm' }).info('a');
      logger.info('b');
      expect(parsed()[0]).toMatchObject({ role: 'web', module: 'crm' });
      expect(parsed()[1]).not.toHaveProperty('module');
    });

    it('CFG-05 replaces a known secret value in the message and in fields', () => {
      const { logger, lines } = capture({ secrets: ['s3cr3t-value'] });
      logger.info('connecting with s3cr3t-value', {
        url: 'postgres://u:s3cr3t-value@host/db',
        nested: { a: ['s3cr3t-value'] },
      });
      expect(lines[0]).not.toContain('s3cr3t-value');
      expect(lines[0]).toContain('[redacted]');
    });

    it('CFG-05 hides fields whose name says they are secret', () => {
      const { logger, parsed } = capture();
      logger.info('login', {
        password: 'p',
        Authorization: 'Bearer x',
        apiKey: 'k',
        cookie: 'c',
        token: 't',
        user: 'bob',
      });
      expect(parsed()[0]).toMatchObject({
        password: '[redacted]',
        Authorization: '[redacted]',
        apiKey: '[redacted]',
        cookie: '[redacted]',
        token: '[redacted]',
        user: 'bob',
      });
    });

    it('CFG-05 hides a secret inside an error message, a stack and a cause, and in a binding', () => {
      const { logger, lines } = capture({ secrets: ['s3cr3t-value'] });
      logger.error('failed', { err: new Error('bad key s3cr3t-value', { cause: new Error('inner s3cr3t-value') }) });
      logger.child({ dsn: 's3cr3t-value' }).info('bound');
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line).not.toContain('s3cr3t-value');
    });

    it('CFG-05 ignores an empty secret', () => {
      const { logger, parsed } = capture({ secrets: [''] });
      logger.info('hello');
      expect(parsed()[0]?.['msg']).toBe('hello');
    });

    it('SEC-09 removes the value of a key that was named, at any depth and in any case, and keeps the rest', () => {
      const { logger, parsed } = capture({ redactKeys: ['email', 'taxId'] });
      logger.info('saved', {
        email: 'a@b.vn',
        Email: 'c@d.vn',
        row: { taxId: '123', code: 'C1' },
        list: [{ EMAIL: 'x' }],
        name: 'visible',
      });
      expect(parsed()[0]).toMatchObject({
        email: '[redacted]',
        Email: '[redacted]',
        row: { taxId: '[redacted]', code: 'C1' },
        list: [{ EMAIL: '[redacted]' }],
        name: 'visible',
      });
    });

    it('SEC-09 redacts the named keys of a binding too, and leaves an empty value empty', () => {
      const { logger, parsed } = capture({ redactKeys: ['email'] });
      logger.child({ email: 'a@b.vn' }).info('bound', { password: 'p' });
      logger.info('empty', { email: null });
      expect(parsed()[0]).toMatchObject({ email: '[redacted]', password: '[redacted]' });
      expect(parsed()[1]).toMatchObject({ email: null });
    });

    it('SEC-09 with no list of keys, a field of personal data is logged as it is: the list comes from the entities', () => {
      const { logger, parsed } = capture();
      logger.info('saved', { email: 'a@b.vn' });
      expect(parsed()[0]).toMatchObject({ email: 'a@b.vn' });
    });
  });
}
