/**
 * BieberKit
 *
 * @file        packages/core/src/events/events.test.ts
 * @description Tests for the typed event bus: payload types, module ownership of event names and isolated handler errors (MOD-03, MOD-05, CORE-14, CORE-15).
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

import { describe, expect, it, vi } from 'vitest';
import { BkError } from '../errors/errors.ts';
import { createLogger } from '../logging/logger.ts';
import { requestContext } from '../logging/request-context.ts';
import { createEventBus } from './events.ts';

declare module '../index.ts' {
  interface EventRegistry {
    'crm.deal.won': { dealId: string; amount: number };
    'crm.deal.lost': { dealId: string };
    'billing.invoice.paid': { invoiceId: string };
  }
}

function notify(): void {
  throw new Error('x');
}

async function rejection(promise: Promise<unknown>): Promise<BkError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BkError) return error;
    throw error;
  }
  throw new Error('Expected a rejection.');
}

describe('MOD-03 typed events', () => {
  it('MOD-03 a handler receives the payload of the event it subscribed to', async () => {
    const bus = createEventBus();
    const seen: number[] = [];
    bus.on('crm.deal.won', (payload) => void seen.push(payload.amount));
    const result = await bus.forModule('crm').emit('crm.deal.won', { dealId: 'd1', amount: 500 });
    expect(seen).toEqual([500]);
    expect(result).toEqual({ delivered: 1, failures: [] });
  });

  it('MOD-03 the event name and the payload are checked by the compiler', async () => {
    const emitter = createEventBus().forModule('crm');
    // @ts-expect-error the payload of crm.deal.won needs an amount
    await emitter.emit('crm.deal.won', { dealId: 'd1' });
    // @ts-expect-error this event name is not in EventRegistry
    await emitter.emit('crm.deal.unknown', {});
    expect(true).toBe(true);
  });

  it('MOD-03 an event nobody listens to is delivered to zero handlers', async () => {
    const result = await createEventBus().forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(result).toEqual({ delivered: 0, failures: [] });
  });

  it('MOD-03 the returned function unsubscribes', async () => {
    const bus = createEventBus();
    const handler = vi.fn<() => void>();
    const off = bus.on('crm.deal.lost', handler);
    off();
    off();
    await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('MOD-03 handlers run in registration order, one after another', async () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('crm.deal.lost', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('first');
    });
    bus.on('crm.deal.lost', () => void order.push('second'));
    await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(order).toEqual(['first', 'second']);
  });

  it('MOD-03 a handler added during an emit waits for the next emit', async () => {
    const bus = createEventBus();
    const late = vi.fn<() => void>();
    bus.on('crm.deal.lost', () => void bus.on('crm.deal.lost', late));
    await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(late).not.toHaveBeenCalled();
    await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('MOD-03 handlers run inside the request context of the emitter', async () => {
    const bus = createEventBus();
    let seen: string | undefined;
    bus.on('crm.deal.lost', () => void (seen = requestContext.get()?.requestId));
    await requestContext.run({ requestId: 'r7' }, () => bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' }));
    expect(seen).toBe('r7');
  });
});

describe('MOD-05 ownership of event names', () => {
  it('MOD-05 a module emits only names that start with its own name and a dot', async () => {
    const error = await rejection(
      createEventBus().forModule('billing').emit('crm.deal.won', { dealId: 'd1', amount: 1 }),
    );
    expect(error.code).toBe('CORE_EVENT_FOREIGN');
    expect(error.message).toContain('billing');
    expect(error.message).toContain('crm.deal.won');
  });

  it('MOD-05 a module whose name is only a prefix of another is still foreign', async () => {
    const error = await rejection(createEventBus().forModule('crm-extra').emit('crm.deal.lost', { dealId: 'd1' }));
    expect(error.code).toBe('CORE_EVENT_FOREIGN');
  });

  it('MOD-05 any module can subscribe to any event', async () => {
    const bus = createEventBus();
    const handler = vi.fn<() => void>();
    bus.on('billing.invoice.paid', handler);
    await bus.forModule('billing').emit('billing.invoice.paid', { invoiceId: 'i1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('MOD-05 a module name must be lower case letters, digits and dashes', () => {
    const bus = createEventBus();
    for (const bad of ['', 'Crm', 'crm.deal', 'crm deal', '1crm']) {
      expect(() => bus.forModule(bad)).toThrowError(expect.objectContaining({ code: 'CORE_EVENT_MODULE' }));
    }
  });
});

describe('CORE-14 isolated handler errors', () => {
  it('CORE-14 a handler that throws or rejects is reported and does not stop the others or the emitter', async () => {
    const bus = createEventBus();
    const ran: string[] = [];
    const boom = new Error('sync failure');
    const late = new Error('async failure');
    bus.on('crm.deal.lost', () => void ran.push('a'), { name: 'audit' });
    bus.on(
      'crm.deal.lost',
      () => {
        throw boom;
      },
      { name: 'mail' },
    );
    bus.on('crm.deal.lost', () => Promise.reject(late), { name: 'search' });
    bus.on('crm.deal.lost', () => void ran.push('d'));
    const result = await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(ran).toEqual(['a', 'd']);
    expect(result.delivered).toBe(2);
    expect(result.failures).toEqual([
      { handler: 'mail', error: boom },
      { handler: 'search', error: late },
    ]);
  });

  it('CORE-14 failures are logged with the event and the handler name', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', role: 'worker', write: (line) => void lines.push(line) });
    const bus = createEventBus({ logger });
    bus.on(
      'crm.deal.lost',
      () => {
        throw new Error('nope');
      },
      { name: 'mail' },
    );
    await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(lines.join('\n')).toContain('"event":"crm.deal.lost"');
    expect(lines.join('\n')).toContain('"handler":"mail"');
  });

  it('CORE-14 an unnamed handler is reported by its function name, or anonymous', async () => {
    const bus = createEventBus();
    bus.on('crm.deal.lost', notify);
    bus.on('crm.deal.lost', () => {
      throw new Error('y');
    });
    const result = await bus.forModule('crm').emit('crm.deal.lost', { dealId: 'd1' });
    expect(result.failures.map((failure) => failure.handler)).toEqual(['notify', '(anonymous)']);
  });
});
