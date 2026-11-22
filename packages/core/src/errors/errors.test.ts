/**
 * BieberKit
 *
 * @file        packages/core/src/errors/errors.test.ts
 * @description Tests for the BkError family (MOD-17).
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
import { BkError, ConfigError, ContainerError, EnvValidationError, toBkError } from './errors.ts';

describe('MOD-17 BkError', () => {
  it('MOD-17 carries a stable code, a status, a safe message and a fix', () => {
    const error = new BkError('Deal 42 is locked by user 7', {
      code: 'CRM_DEAL_LOCKED',
      status: 409,
      safeMessage: 'The deal is locked.',
      fix: 'Ask the owner to release it.',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('BkError');
    expect(error.code).toBe('CRM_DEAL_LOCKED');
    expect(error.status).toBe(409);
    expect(error.safeMessage).toBe('The deal is locked.');
    expect(error.fix).toBe('Ask the owner to release it.');
    expect(error.message).toBe('Deal 42 is locked by user 7');
  });

  it('MOD-17 defaults to status 500, the message as safe message and an empty fix', () => {
    const error = new BkError('boom', { code: 'X_BOOM' });
    expect(error.status).toBe(500);
    expect(error.safeMessage).toBe('boom');
    expect(error.fix).toBe('');
  });

  it('MOD-17 toJSON never includes the cause, the stack or the private message', () => {
    const error = new BkError('password for db is hunter2', {
      code: 'X_DB',
      status: 503,
      safeMessage: 'The service is unavailable.',
      fix: 'Try again later.',
      cause: new Error('connect ECONNREFUSED'),
    });
    const json = error.toJSON();
    expect(json).toEqual({
      code: 'X_DB',
      status: 503,
      message: 'The service is unavailable.',
      fix: 'Try again later.',
    });
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect(JSON.stringify(error)).not.toContain('ECONNREFUSED');
  });

  it('MOD-17 keeps the cause for logs', () => {
    const cause = new Error('inner');
    expect(new BkError('outer', { code: 'X_OUTER', cause }).cause).toBe(cause);
  });

  it('MOD-17 subclasses keep their name and extend BkError', () => {
    expect(new ConfigError('bad', { code: 'CFG_ENV_INVALID' }).name).toBe('ConfigError');
    expect(new ContainerError('bad', { code: 'CORE_SERVICE_MISSING' })).toBeInstanceOf(BkError);
  });

  it('MOD-17 EnvValidationError takes the code of the first problem and lists all of them', () => {
    const error = new EnvValidationError([
      { key: 'APP_KEY', code: 'CFG_ENV_MISSING', message: 'APP_KEY is required.', fix: 'Set APP_KEY.' },
      { key: 'PORT', code: 'CFG_ENV_INVALID', message: 'PORT must be an integer.', fix: 'Use a whole number.' },
    ]);
    expect(error.code).toBe('CFG_ENV_MISSING');
    expect(error.problems).toHaveLength(2);
    expect(error.message).toContain('APP_KEY is required.');
    expect(error.message).toContain('PORT must be an integer.');
    expect(error.fix).toContain('Set APP_KEY.');
  });
});

describe('MOD-17 toBkError', () => {
  it('MOD-17 returns a BkError unchanged', () => {
    const error = new BkError('x', { code: 'X_X' });
    expect(toBkError(error)).toBe(error);
  });

  it('MOD-17 wraps an Error as BK_UNKNOWN with status 500 and keeps the cause', () => {
    const cause = new TypeError('nope');
    const wrapped = toBkError(cause);
    expect(wrapped.code).toBe('BK_UNKNOWN');
    expect(wrapped.status).toBe(500);
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.safeMessage).not.toContain('nope');
  });

  it('MOD-17 wraps a thrown string without losing it', () => {
    const wrapped = toBkError('plain string');
    expect(wrapped.code).toBe('BK_UNKNOWN');
    expect(wrapped.cause).toBe('plain string');
  });
});
