/**
 * BieberKit
 *
 * @file        packages/core/src/logging/logger.test.ts
 * @description Tests for the default JSON-lines logger and the request context (OBS-01, CORE-01, CORE-02, CFG-05).
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
import { BkError } from '../errors/errors.ts';
import { createLogger } from './logger.ts';
import { requestContext } from './request-context.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLine(line: string): Record<string, unknown> {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error('A log line must be a JSON object.');
  return value;
}

function capture(options: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    role: 'web',
    write: (line) => lines.push(line),
    now: () => new Date('2026-11-22T10:00:00.000Z'),
    ...options,
  });
  const parsed = (): Record<string, unknown>[] => lines.map(parseLine);
  return { logger, lines, parsed };
}

describe('OBS-01 log line', () => {
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
    expect(parsed()[0]).toMatchObject({ requestId: 'r1', traceId: 't1', spanId: 's1', tenantId: 'ten1', userId: 'u1' });
  });

  it('OBS-01 leaves out the ids that are not known', () => {
    const { logger, parsed } = capture();
    requestContext.run({ requestId: 'r1' }, () => logger.info('inside'));
    const line = parsed()[0] ?? {};
    expect(line['requestId']).toBe('r1');
    for (const key of ['traceId', 'spanId', 'tenantId', 'userId']) expect(line).not.toHaveProperty(key);
  });

  it('OBS-01 puts extra fields on the line and never lets them replace the base fields', () => {
    const { logger, parsed } = capture();
    logger.warn('slow', { ms: 1200, level: 'fake', msg: 'fake', role: 'fake' });
    expect(parsed()[0]).toMatchObject({ level: 'warn', msg: 'slow', role: 'web', ms: 1200 });
  });

  it('OBS-01 writes an Error with its name, message, code and stack', () => {
    const { logger, parsed } = capture();
    logger.error('failed', { err: new BkError('private detail', { code: 'X_FAIL', status: 409 }) });
    const err = parsed()[0]?.['err'];
    if (!isRecord(err)) throw new Error('err must be an object.');
    expect(err).toMatchObject({ name: 'BkError', message: 'private detail', code: 'X_FAIL', status: 409 });
    expect(typeof err['stack']).toBe('string');
  });

  it('OBS-01 survives circular references, bigint and undefined', () => {
    const { logger, parsed } = capture();
    const loop: Record<string, unknown> = { name: 'loop' };
    loop['self'] = loop;
    logger.info('odd', { loop, big: 12n, missing: undefined });
    expect(parsed()[0]).toMatchObject({ big: '12', loop: { name: 'loop', self: '[circular]' } });
  });
});

describe('CORE-01 levels and child loggers', () => {
  it('CORE-01 writes a line only at or above the configured level', () => {
    const { logger, parsed } = capture({ level: 'warn' });
    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.fatal('f');
    expect(parsed().map((line) => line['level'])).toEqual(['warn', 'error', 'fatal']);
  });

  it('CORE-01 trace level writes everything', () => {
    const { logger, lines } = capture({ level: 'trace' });
    for (const method of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) logger[method]('x');
    expect(lines).toHaveLength(6);
  });

  it('CORE-01 child adds bindings to every line and keeps the level', () => {
    const { logger, parsed } = capture({ level: 'warn' });
    const child = logger.child({ module: 'crm' });
    child.info('hidden');
    child.warn('shown', { deal: 7 });
    expect(child.level).toBe('warn');
    expect(parsed()).toHaveLength(1);
    expect(parsed()[0]).toMatchObject({ module: 'crm', deal: 7 });
  });

  it('CORE-01 a child of a child keeps both bindings', () => {
    const { logger, parsed } = capture();
    logger.child({ a: 1 }).child({ b: 2 }).info('x');
    expect(parsed()[0]).toMatchObject({ a: 1, b: 2 });
  });
});

function readAfter(id: string, ms: number): Promise<string | undefined> {
  return requestContext.run({ requestId: id }, async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return requestContext.get()?.requestId;
  });
}

describe('CORE-02 request context', () => {
  it('CORE-02 is visible to async code started inside run, and to nothing outside', async () => {
    expect(requestContext.get()).toBeUndefined();
    const seen = await requestContext.run({ requestId: 'r1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return requestContext.get()?.requestId;
    });
    expect(seen).toBe('r1');
    expect(requestContext.get()).toBeUndefined();
  });

  it('CORE-02 concurrent runs do not see each other', async () => {
    expect(await Promise.all([readAfter('a', 5), readAfter('b', 1)])).toEqual(['a', 'b']);
  });

  it('CORE-02 update changes the current context, for example once the user is known', () => {
    requestContext.run({ requestId: 'r1' }, () => {
      requestContext.update({ userId: 'u9' });
      expect(requestContext.get()).toEqual({ requestId: 'r1', userId: 'u9' });
    });
  });

  it('CORE-02 update outside a run does nothing', () => {
    requestContext.update({ userId: 'u9' });
    expect(requestContext.get()).toBeUndefined();
  });

  it('CORE-02 run does not change the object it was given', () => {
    const given = { requestId: 'r1' };
    requestContext.run(given, () => requestContext.update({ userId: 'u9' }));
    expect(given).toEqual({ requestId: 'r1' });
  });
});

describe('CFG-05 secrets in log lines', () => {
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

  it('CFG-05 redacts a secret inside an error message and a cause', () => {
    const { logger, lines } = capture({ secrets: ['s3cr3t-value'] });
    logger.error('failed', { err: new Error('bad key s3cr3t-value', { cause: new Error('inner s3cr3t-value') }) });
    expect(lines[0]).not.toContain('s3cr3t-value');
  });

  it('CFG-05 ignores an empty secret', () => {
    const { logger, parsed } = capture({ secrets: [''] });
    logger.info('hello');
    expect(parsed()[0]?.['msg']).toBe('hello');
  });
});

describe('SEC-09 fields of personal data in log lines', () => {
  it('SEC-09 removes the value of a key that was named, at any depth and in any case, and keeps the rest', () => {
    const { logger, parsed } = capture({ redactKeys: ['email', 'taxId'] });
    logger.info('saved', {
      email: 'a@b.vn',
      Email: 'c@d.vn',
      row: { taxId: '123', code: 'C1' },
      list: [{ EMAIL: 'x' }],
      name: 'visible',
    });
    const [line] = parsed();
    expect(line).toMatchObject({
      email: '[redacted]',
      Email: '[redacted]',
      row: { taxId: '[redacted]', code: 'C1' },
      list: [{ EMAIL: '[redacted]' }],
      name: 'visible',
    });
  });

  it('SEC-09 leaves an empty value empty, and keeps the keys that match a secret redacted as before', () => {
    const { logger, parsed } = capture({ redactKeys: ['email'] });
    logger.info('saved', { email: null, password: 'p' });
    expect(parsed()[0]).toMatchObject({ email: null, password: '[redacted]' });
  });

  it('SEC-09 with no list of keys, a field of personal data is logged as it is: the list comes from the entities', () => {
    const { logger, parsed } = capture();
    logger.info('saved', { email: 'a@b.vn' });
    expect(parsed()[0]).toMatchObject({ email: 'a@b.vn' });
  });
});
