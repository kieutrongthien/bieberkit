/**
 * BieberKit
 *
 * @file        packages/core/src/logging/logger.ts
 * @description The Logger port and a dependency-free default logger that writes JSON lines (OBS-01, ADR 0003).
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

import { LOG_LEVELS } from './levels.ts';
import type { LogLevel } from './levels.ts';
import { requestContext } from './request-context.ts';

export type LogFields = Readonly<Record<string, unknown>>;

/** The port every package logs through. `@bieberkit/log/pino` provides another implementation of it. */
export interface Logger {
  readonly level: LogLevel;
  fatal(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  trace(message: string, fields?: LogFields): void;
  /** A logger that adds `bindings` to every line. */
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  /** Process role: web, worker, scheduler or migrate. */
  readonly role: string;
  /** Receives one JSON line without a trailing newline. Defaults to standard output. */
  readonly write?: (line: string) => void;
  /** Values that must never appear in a line, for example the secrets of the environment (CFG-05). */
  readonly secrets?: readonly string[];
  /**
   * Names of fields whose value is never written, at any depth and in any case: the fields of personal data (SEC-09). A project
   * takes them from its entities (`piiFields`). A key that looks like a secret is redacted without being named.
   */
  readonly redactKeys?: readonly string[];
  readonly now?: () => Date;
}

const REDACTED = '[redacted]';
const SECRET_KEY = /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key/i;
const RESERVED = new Set(['time', 'level', 'msg', 'role', 'requestId', 'traceId', 'spanId', 'tenantId', 'userId']);
const MAX_DEPTH = 8;

interface Sanitizer {
  clean(value: unknown, key?: string): unknown;
  text(value: string): string;
}

function createSanitizer(secrets: readonly string[], redactKeys: readonly string[] = []): Sanitizer {
  const named = new Set(redactKeys.map((key) => key.toLowerCase()));
  const known = secrets.filter((secret) => secret !== '').toSorted((a, b) => b.length - a.length);
  const text = (value: string): string => known.reduce((out, secret) => out.split(secret).join(REDACTED), value);
  const ancestors = new Set<object>();

  const clean = (value: unknown, key?: string, depth = 0): unknown => {
    if (
      key !== undefined &&
      (SECRET_KEY.test(key) || named.has(key.toLowerCase())) &&
      value !== undefined &&
      value !== null
    )
      return REDACTED;
    switch (typeof value) {
      case 'string':
        return text(value);
      case 'bigint':
        return String(value);
      case 'function':
      case 'symbol':
      case 'undefined':
        return undefined;
      case 'object':
        break;
      default:
        return value;
    }
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`;
    if (ancestors.has(value)) return '[circular]';
    if (depth >= MAX_DEPTH) return '[truncated]';
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return value.map((item) => clean(item, undefined, depth + 1));
      const out: Record<string, unknown> = {};
      if (value instanceof Error) {
        out['name'] = value.name;
        out['message'] = text(value.message);
        for (const extra of ['code', 'status'] as const) {
          const found: unknown = Reflect.get(value, extra);
          if (found !== undefined) out[extra] = clean(found, undefined, depth + 1);
        }
        if (value.stack !== undefined) out['stack'] = text(value.stack);
        if (value.cause !== undefined) out['cause'] = clean(value.cause, undefined, depth + 1);
        return out;
      }
      for (const [name, item] of Object.entries(value)) out[name] = clean(item, name, depth + 1);
      return out;
    } finally {
      ancestors.delete(value);
    }
  };
  return { clean: (value, key) => clean(value, key), text };
}

function severity(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

/** The default logger: one JSON object per line (OBS-01), with the ids of the current request and secrets removed. */
export function createLogger(options: LoggerOptions): Logger {
  const write = options.write ?? ((line: string) => void process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date());
  const sanitizer = createSanitizer(options.secrets ?? [], options.redactKeys);
  const threshold = severity(options.level);

  const make = (bindings: LogFields): Logger => {
    const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
      if (severity(level) > threshold) return;
      const context = requestContext.get();
      const line: Record<string, unknown> = {
        time: now().toISOString(),
        level,
        msg: sanitizer.text(message),
        role: options.role,
      };
      for (const id of ['requestId', 'traceId', 'spanId', 'tenantId', 'userId'] as const) {
        const value = context?.[id];
        if (value !== undefined) line[id] = value;
      }
      for (const source of [bindings, fields ?? {}]) {
        for (const [name, value] of Object.entries(source)) {
          if (RESERVED.has(name)) continue;
          const cleaned = sanitizer.clean(value, name);
          if (cleaned !== undefined) line[name] = cleaned;
        }
      }
      write(JSON.stringify(line));
    };
    return {
      level: options.level,
      fatal: (message, fields) => emit('fatal', message, fields),
      error: (message, fields) => emit('error', message, fields),
      warn: (message, fields) => emit('warn', message, fields),
      info: (message, fields) => emit('info', message, fields),
      debug: (message, fields) => emit('debug', message, fields),
      trace: (message, fields) => emit('trace', message, fields),
      child: (more) => make({ ...bindings, ...more }),
    };
  };
  return make({});
}
