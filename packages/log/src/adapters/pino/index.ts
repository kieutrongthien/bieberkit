/**
 * BieberKit
 *
 * @file        packages/log/src/adapters/pino/index.ts
 * @description The pino adapter: the Logger of core on pino, with the line of OBS-01 and the redaction of CFG-05 and SEC-09 (ADR 0003, ADR 0022).
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

import { createLogSanitizer, RESERVED_LOG_FIELDS, requestContext } from '@bieberkit/core';
import type { LogFields, LogLevel, Logger, LoggerOptions } from '@bieberkit/core';
import { pino } from 'pino';
import type { Logger as PinoLogger } from 'pino';

const ID_FIELDS = ['requestId', 'traceId', 'spanId', 'tenantId', 'userId'] as const;

/**
 * A logger on pino with the same line as the default logger of core: `time` (ISO), `level` (its name), `msg`, `role`, then the ids of
 * the request that runs, the bindings and the fields. Only this module imports pino (PKG-03). The redaction is the sanitizer of core, run
 * before pino sees a value, because pino's own `redact` takes paths of a fixed depth and cannot say "this key, at any depth" (ADR 0022).
 */
export function createPinoLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const sanitizer = createLogSanitizer(options.secrets ?? [], options.redactKeys);
  const write = options.write;
  const destination =
    write === undefined
      ? pino.destination({ dest: 1, sync: false })
      : { write: (chunk: string): void => write(chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk) };

  const root = pino(
    {
      level: options.level,
      base: { role: options.role },
      messageKey: 'msg',
      timestamp: () => `,"time":${JSON.stringify(now().toISOString())}`,
      formatters: { level: (label) => ({ level: label }) },
      // The values are plain data after the sanitizer, so pino must not treat `err` as an Error and rename its fields.
      serializers: { err: (value: unknown) => value },
      mixin: () => {
        const context = requestContext.get();
        const ids: Record<string, string> = {};
        for (const id of ID_FIELDS) {
          const value = context?.[id];
          if (value !== undefined) ids[id] = value;
        }
        return ids;
      },
    },
    destination,
  );

  const clean = (source: LogFields): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(source)) {
      if (RESERVED_LOG_FIELDS.has(name)) continue;
      const cleaned = sanitizer.clean(value, name);
      if (cleaned !== undefined) out[name] = cleaned;
    }
    return out;
  };

  const make = (logger: PinoLogger): Logger => {
    const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
      if (!logger.isLevelEnabled(level)) return;
      logger[level](fields === undefined ? {} : clean(fields), sanitizer.text(message));
    };
    return {
      level: options.level,
      fatal: (message, fields) => emit('fatal', message, fields),
      error: (message, fields) => emit('error', message, fields),
      warn: (message, fields) => emit('warn', message, fields),
      info: (message, fields) => emit('info', message, fields),
      debug: (message, fields) => emit('debug', message, fields),
      trace: (message, fields) => emit('trace', message, fields),
      child: (bindings) => make(logger.child(clean(bindings))),
    };
  };
  return make(root);
}
