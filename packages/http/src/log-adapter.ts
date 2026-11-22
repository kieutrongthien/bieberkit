/**
 * BieberKit
 *
 * @file        packages/http/src/log-adapter.ts
 * @description The logger of core in the shape that Fastify calls: object first, message second (ADR 0003).
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

import type { FastifyBaseLogger } from 'fastify';
import type { LogFields, Logger } from '@bieberkit/core';

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Fastify calls `log.info(object, message)` and `log.error(error)`. Core takes `(message, fields)`. */
function call(logger: Logger, level: Level): (first?: unknown, second?: unknown) => void {
  return (first, second) => {
    if (typeof first === 'string') {
      logger[level](first);
    } else if (first instanceof Error) {
      logger[level](typeof second === 'string' ? second : first.message, { error: first.message });
    } else {
      const fields: LogFields =
        typeof first === 'object' && first !== null ? Object.fromEntries(Object.entries(first)) : {};
      logger[level](typeof second === 'string' ? second : '', fields);
    }
  };
}

export function fastifyLogger(logger: Logger): FastifyBaseLogger {
  return {
    fatal: call(logger, 'fatal'),
    error: call(logger, 'error'),
    warn: call(logger, 'warn'),
    info: call(logger, 'info'),
    debug: call(logger, 'debug'),
    trace: call(logger, 'trace'),
    silent: () => undefined,
    child: (bindings) => fastifyLogger(logger.child(bindings)),
    level: logger.level,
  };
}
