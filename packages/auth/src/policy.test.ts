/**
 * BieberKit
 *
 * @file        packages/auth/src/policy.test.ts
 * @description Tests of the security policies: defaults, ranges, session limits, MFA grace and the network allowlist (POL-01 to POL-05).
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
import {
  DEFAULT_POLICY,
  checkMfa,
  checkNetwork,
  checkSession,
  policyOf,
  securitySettings,
  type SecurityPolicy,
} from './policy.ts';

const at = (iso: string): Date => new Date(iso);
const strict = (patch: Partial<SecurityPolicy>): SecurityPolicy => ({ ...DEFAULT_POLICY, ...patch });

describe('POL-01 session policy', () => {
  const created = at('2026-01-01T00:00:00.000Z');

  it('POL-01 the default asks for nothing: a single person is never signed out by a policy', () => {
    const now = at('2027-01-01T00:00:00.000Z');
    expect(checkSession(DEFAULT_POLICY.session, { createdAt: created, lastSeenAt: created, now })).toBe('ok');
  });

  it('POL-01 an idle session ends after idle-minutes without a request', () => {
    const session = { ...DEFAULT_POLICY.session, idleMinutes: 30 };
    const seen = at('2026-01-01T10:00:00.000Z');
    expect(checkSession(session, { createdAt: created, lastSeenAt: seen, now: at('2026-01-01T10:29:00.000Z') })).toBe(
      'ok',
    );
    expect(checkSession(session, { createdAt: created, lastSeenAt: seen, now: at('2026-01-01T10:31:00.000Z') })).toBe(
      'idle',
    );
  });

  it('POL-01 a session ends absolute-hours after sign in, however active it is', () => {
    const session = { ...DEFAULT_POLICY.session, absoluteHours: 8 };
    const now = at('2026-01-01T08:01:00.000Z');
    expect(checkSession(session, { createdAt: created, lastSeenAt: now, now })).toBe('absolute');
    expect(
      checkSession(session, { createdAt: created, lastSeenAt: created, now: at('2026-01-01T07:59:00.000Z') }),
    ).toBe('ok');
  });
});

describe('POL-02 MFA policy', () => {
  const now = at('2026-03-10T00:00:00.000Z');
  const since = at('2026-03-05T00:00:00.000Z');
  const user = { mfa: false, createdAt: at('2025-01-01T00:00:00.000Z') };

  it('POL-02 the default does not ask a user for a second factor', () => {
    expect(checkMfa(DEFAULT_POLICY.mfa, { ...user, now })).toEqual({ status: 'ok' });
  });

  it('POL-02 a user who has a second factor is always ok', () => {
    const mfa = { requiredForAll: true, graceDays: 0, since };
    expect(checkMfa(mfa, { ...user, mfa: true, now })).toEqual({ status: 'ok' });
  });

  it('POL-02 a user without one is in grace for grace-days after the policy starts, and sees the date', () => {
    const mfa = { requiredForAll: true, graceDays: 7, since };
    expect(checkMfa(mfa, { ...user, now })).toEqual({ status: 'grace', enrolBy: at('2026-03-12T00:00:00.000Z') });
  });

  it('POL-02 after the grace the user must enrol', () => {
    const mfa = { requiredForAll: true, graceDays: 7, since };
    expect(checkMfa(mfa, { ...user, now: at('2026-03-13T00:00:00.000Z') })).toEqual({ status: 'enrol' });
  });

  it('POL-02 a user made after the policy started has the grace counted from the account', () => {
    const mfa = { requiredForAll: true, graceDays: 7, since };
    const fresh = { mfa: false, createdAt: at('2026-03-09T00:00:00.000Z') };
    expect(checkMfa(mfa, { ...fresh, now: at('2026-03-15T00:00:00.000Z') })).toEqual({
      status: 'grace',
      enrolBy: at('2026-03-16T00:00:00.000Z'),
    });
  });
});

describe('POL-03 network policy', () => {
  it('POL-03 an empty allowlist means no limit, even when the address is unknown', () => {
    expect(checkNetwork([], '')).toBe(true);
    expect(checkNetwork([], '203.0.113.9')).toBe(true);
  });

  it('POL-03 an IPv4 address inside a range is allowed, outside is refused', () => {
    expect(checkNetwork(['10.0.0.0/8'], '10.20.30.40')).toBe(true);
    expect(checkNetwork(['10.0.0.0/8', '192.168.1.0/24'], '192.168.2.1')).toBe(false);
    expect(checkNetwork(['203.0.113.7/32'], '203.0.113.7')).toBe(true);
  });

  it('POL-03 an IPv6 range, and an IPv4-mapped address, are matched', () => {
    expect(checkNetwork(['2001:db8::/32'], '2001:db8:1::5')).toBe(true);
    expect(checkNetwork(['2001:db8::/32'], '2001:dead::1')).toBe(false);
    expect(checkNetwork(['10.0.0.0/8'], '::ffff:10.1.2.3')).toBe(true);
  });

  it('POL-03 fails closed: an unknown or malformed address is refused when a list is set', () => {
    expect(checkNetwork(['10.0.0.0/8'], '')).toBe(false);
    expect(checkNetwork(['10.0.0.0/8'], 'not-an-ip')).toBe(false);
  });
});

const byKey = (key: string) => {
  const def = securitySettings.find((setting) => setting.key === key);
  if (def === undefined) throw new Error(`no setting ${key}`);
  return def;
};

describe('POL-05 validated ranges and defaults', () => {
  it('POL-05 every policy is in the security group with a default that passes its own check', () => {
    for (const def of securitySettings) {
      expect(def.key.startsWith('security.')).toBe(true);
      expect(def.group).toBe('security');
      expect(() => def.check(def.default)).not.toThrow();
    }
  });

  it('POL-05 refuses a lifetime above 365 days and a negative or fractional count', () => {
    expect(() => byKey('security.session.absolute-hours').check(365 * 24 + 1)).toThrow(/not valid/);
    expect(() => byKey('security.session.idle-minutes').check(-1)).toThrow(/not valid/);
    expect(() => byKey('security.session.max-concurrent').check(1.5)).toThrow(/not valid/);
    expect(() => byKey('security.mfa.grace-days').check(366)).toThrow(/not valid/);
  });

  it('POL-05 refuses an allowlist with an entry that is not a CIDR range', () => {
    const def = byKey('security.network.admin-allowlist');
    expect(def.check(['10.0.0.0/8', '2001:db8::/32'])).toEqual(['10.0.0.0/8', '2001:db8::/32']);
    expect(() => def.check(['10.0.0.0'])).toThrow(/not valid/);
    expect(() => def.check(['10.0.0.0/33'])).toThrow(/not valid/);
    expect(() => def.check('10.0.0.0/8')).toThrow(/not valid/);
  });

  it('POL-05 no policy is public or secret', () => {
    for (const def of securitySettings) {
      expect(def.public).toBe(false);
      expect(def.secret).toBe(false);
    }
  });

  it('POL-01 policyOf turns stored values into a policy, and unset values into the default', () => {
    expect(policyOf(() => undefined)).toEqual(DEFAULT_POLICY);
    const policy = policyOf((def) =>
      def.key === 'security.session.idle-minutes' ? 15 : def.key === 'security.mfa.required-for-all' ? true : undefined,
    );
    expect(policy.session.idleMinutes).toBe(15);
    expect(policy.mfa.requiredForAll).toBe(true);
    expect(policy.session.absoluteHours).toBe(DEFAULT_POLICY.session.absoluteHours);
  });

  it('POL-05 a strict policy still leaves the other groups at their default', () => {
    const policy = strict({ network: { adminAllowlist: ['10.0.0.0/8'] } });
    expect(policy.session).toEqual(DEFAULT_POLICY.session);
  });
});
