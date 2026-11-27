/**
 * BieberKit
 *
 * @file        packages/auth/src/policy.ts
 * @description The security policies of sessions, MFA and networks: their settings, defaults, ranges and the pure checks that enforce them.
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

import { isIPv4, isIPv6 } from 'node:net';
import { defineSetting } from '@bieberkit/core';
import type { SettingActor, SettingDef } from '@bieberkit/core';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export interface SessionPolicy {
  /** Minutes without a request after which a session ends. `0` is off. */
  readonly idleMinutes: number;
  /** Hours after sign in after which a session ends. `0` keeps the lifetime of Better Auth. */
  readonly absoluteHours: number;
  /** How many sessions a user may hold. At sign in the oldest are revoked. `0` is off. */
  readonly maxConcurrent: number;
}

export interface MfaPolicy {
  /** Every user needs a second factor, on top of `requireMfa` of a role (AUTH-05). */
  readonly requiredForAll: boolean;
  /** Days that a user without a second factor may still sign in after the policy starts. */
  readonly graceDays: number;
  /** When the policy started. `null` counts the grace from the account. */
  readonly since: Date | null;
}

export interface NetworkPolicy {
  /** CIDR ranges that a role flagged `ipRestricted` may use. Empty is no limit. */
  readonly adminAllowlist: readonly string[];
}

export interface SignInPolicy {
  /** Notify a user of a sign in from a device that was not seen before. */
  readonly notifyNewDevice: boolean;
}

/** What the authenticator enforces, read from the `security.*` settings (ADR 0031). */
export interface SecurityPolicy {
  readonly session: SessionPolicy;
  readonly mfa: MfaPolicy;
  readonly network: NetworkPolicy;
  readonly signIn: SignInPolicy;
}

/** The value a single person gets: nothing is asked of them. */
export const DEFAULT_POLICY: SecurityPolicy = {
  session: { idleMinutes: 0, absoluteHours: 0, maxConcurrent: 0 },
  mfa: { requiredForAll: false, graceDays: 7, since: null },
  network: { adminAllowlist: [] },
  signIn: { notifyNewDevice: true },
};

/** Where the authenticator gets the policy of a request. The server adapts the settings service to it (ADR 0031). */
export interface PolicyReader {
  read(context: { readonly tenantId?: string }): Promise<SecurityPolicy>;
}

/** The reader that gives the default policy: what a project gets when nothing wires the settings. */
export const defaultPolicyReader: PolicyReader = { read: () => Promise.resolve(DEFAULT_POLICY) };

// A range check that is also a Parser, so the declaration refuses a bad value with CORE_SETTING_VALUE (ADR 0030).
function whole(max: number): { parse(input: unknown): number } {
  return {
    parse(input) {
      if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > max)
        throw new Error(`it must be a whole number from 0 to ${max}`);
      return input;
    },
  };
}

const groups = (text: string): string[] => (text === '' ? [] : text.split(':'));

function blockOf(address: string): { readonly value: bigint; readonly size: number } | undefined {
  if (isIPv4(address)) {
    const value = address.split('.').reduce((total, part) => (total << 8n) | BigInt(Number(part)), 0n);
    return { value, size: 32 };
  }
  if (!isIPv6(address)) return undefined;
  const [head = '', tail] = address.split('::');
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const last = [...left, ...right].at(-1);
  if (last !== undefined && last.includes('.')) {
    const mapped = blockOf(last);
    if (mapped === undefined) return undefined;
    const words = [Number((mapped.value >> 16n) & 0xffffn), Number(mapped.value & 0xffffn)].map((n) => n.toString(16));
    if (tail === undefined) left.splice(-1, 1, ...words);
    else right.splice(-1, 1, ...words);
  }
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? left.length !== 8 : missing < 0) return undefined;
  const all = [...left, ...Array.from({ length: tail === undefined ? 0 : missing }, () => '0'), ...right];
  const value = all.reduce((total, group) => (total << 16n) | BigInt(Number.parseInt(group, 16)), 0n);
  return { value, size: 128 };
}

// An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) is read as the IPv4 address.
function addressOf(text: string): { readonly value: bigint; readonly size: number } | undefined {
  const block = blockOf(text);
  if (block === undefined) return undefined;
  if (block.size === 128 && block.value >> 32n === 0xffffn) return { value: block.value & 0xffffffffn, size: 32 };
  return block;
}

/** Whether `range` is `address/prefix` with a prefix that fits the family. */
export function isCidr(range: string): boolean {
  const [address, prefix, ...rest] = range.split('/');
  if (address === undefined || prefix === undefined || rest.length > 0 || !/^\d{1,3}$/.test(prefix)) return false;
  const block = blockOf(address);
  return block !== undefined && Number(prefix) <= block.size;
}

/**
 * Whether the client address is inside one of the ranges (POL-03). An empty list is no limit. With a list, an address that is
 * unknown or malformed is refused: the check fails closed.
 */
export function checkNetwork(allowlist: readonly string[], ip: string): boolean {
  if (allowlist.length === 0) return true;
  const client = addressOf(ip);
  if (client === undefined) return false;
  return allowlist.some((range) => {
    const [address = '', prefix = ''] = range.split('/');
    const net = addressOf(address);
    if (net === undefined || net.size !== client.size) return false;
    const shift = BigInt(net.size - Number(prefix));
    return net.value >> shift === client.value >> shift;
  });
}

export type SessionVerdict = 'ok' | 'idle' | 'absolute';

/** The session limits of POL-01. `idle` and `absolute` end the session (`AUTH_SESSION_EXPIRED`). */
export function checkSession(
  policy: SessionPolicy,
  session: { readonly createdAt: Date; readonly lastSeenAt: Date; readonly now: Date },
): SessionVerdict {
  const now = session.now.getTime();
  if (policy.absoluteHours > 0 && now - session.createdAt.getTime() >= policy.absoluteHours * 3_600_000)
    return 'absolute';
  if (policy.idleMinutes > 0 && now - session.lastSeenAt.getTime() >= policy.idleMinutes * MINUTE_MS) return 'idle';
  return 'ok';
}

export type MfaVerdict =
  | { readonly status: 'ok' }
  | { readonly status: 'grace'; readonly enrolBy: Date }
  | { readonly status: 'enrol' };

/** POL-02: a user without a second factor has `graceDays` from the later of the policy start and the account. */
export function checkMfa(
  policy: MfaPolicy,
  user: { readonly mfa: boolean; readonly createdAt: Date; readonly now: Date },
): MfaVerdict {
  if (!policy.requiredForAll || user.mfa) return { status: 'ok' };
  const start = Math.max(user.createdAt.getTime(), policy.since?.getTime() ?? 0);
  const enrolBy = new Date(start + policy.graceDays * DAY_MS);
  return user.now.getTime() < enrolBy.getTime() ? { status: 'grace', enrolBy } : { status: 'enrol' };
}

const base = { group: 'security', scope: 'tenant' } as const;

const idleMinutes: SettingDef<number> = defineSetting({
  ...base,
  key: 'security.session.idle-minutes',
  type: 'json',
  parser: whole(525_600),
  default: DEFAULT_POLICY.session.idleMinutes,
  label: { en: 'Idle timeout (minutes)', vi: 'Hết hạn khi không hoạt động (phút)' },
  description: { en: 'Sign a session out after this many minutes without a request. 0 turns it off.' },
});

const absoluteHours: SettingDef<number> = defineSetting({
  ...base,
  key: 'security.session.absolute-hours',
  type: 'json',
  parser: whole(365 * 24),
  default: DEFAULT_POLICY.session.absoluteHours,
  label: { en: 'Session lifetime (hours)', vi: 'Thời hạn phiên (giờ)' },
  description: { en: 'Sign a session out this many hours after sign in. 0 keeps the default lifetime.' },
});

const maxConcurrent: SettingDef<number> = defineSetting({
  ...base,
  key: 'security.session.max-concurrent',
  type: 'json',
  parser: whole(100),
  default: DEFAULT_POLICY.session.maxConcurrent,
  label: { en: 'Sessions per user', vi: 'Số phiên mỗi người dùng' },
  description: { en: 'At sign in the oldest sessions beyond this number are revoked. 0 turns it off.' },
});

const requiredForAll: SettingDef<boolean> = defineSetting({
  ...base,
  key: 'security.mfa.required-for-all',
  type: 'boolean',
  default: DEFAULT_POLICY.mfa.requiredForAll,
  label: { en: 'Require a second factor for everyone', vi: 'Bắt buộc xác thực hai lớp cho mọi người' },
  // A person without a second factor who turns the rule on would be sent to enrol at once (POL-05).
  guard: (value, actor) => value === true && !actor.mfa,
});

const graceDays: SettingDef<number> = defineSetting({
  ...base,
  key: 'security.mfa.grace-days',
  type: 'json',
  parser: whole(365),
  default: DEFAULT_POLICY.mfa.graceDays,
  label: { en: 'Days to enrol a second factor', vi: 'Số ngày để đăng ký xác thực hai lớp' },
});

const requiredSince: SettingDef<string> = defineSetting({
  ...base,
  key: 'security.mfa.required-since',
  type: 'string',
  default: '',
  label: { en: 'Second factor required since', vi: 'Bắt buộc xác thực hai lớp từ' },
  description: { en: 'An ISO date set when the rule is turned on. The grace period counts from it.' },
});

const adminAllowlist: SettingDef<readonly string[]> = defineSetting({
  group: 'security',
  scope: 'global',
  key: 'security.network.admin-allowlist',
  type: 'json',
  parser: {
    parse(input) {
      if (!Array.isArray(input) || !input.every((item): item is string => typeof item === 'string' && isCidr(item)))
        throw new Error('it must be a list of CIDR ranges such as 10.0.0.0/8');
      return input;
    },
  },
  default: DEFAULT_POLICY.network.adminAllowlist,
  // A list that leaves out the address of the person who saves it (POL-05).
  guard: (value, actor: SettingActor) => Array.isArray(value) && !checkNetwork(value.map(String), actor.ip),
  label: { en: 'Allowed networks for restricted roles', vi: 'Mạng được phép cho vai trò bị giới hạn' },
  description: { en: 'CIDR ranges. Empty means no limit. A role flagged ipRestricted can sign in only from these.' },
});

const notifyNewDevice: SettingDef<boolean> = defineSetting({
  ...base,
  key: 'security.sign-in.notify-new-device',
  type: 'boolean',
  default: DEFAULT_POLICY.signIn.notifyNewDevice,
  label: { en: 'Tell users about sign ins from a new device', vi: 'Báo khi đăng nhập từ thiết bị mới' },
});

/** The declarations of the `security` group, contributed by this package under `settings` (ADR 0030, ADR 0031). */
export const securitySettings: readonly SettingDef[] = [
  idleMinutes,
  absoluteHours,
  maxConcurrent,
  requiredForAll,
  graceDays,
  requiredSince,
  adminAllowlist,
  notifyNewDevice,
];

/** Builds the policy from stored values. `read` returns the stored value of a setting, or `undefined` for the default. */
export function policyOf(read: (def: SettingDef) => unknown): SecurityPolicy {
  const value = <T>(def: SettingDef<T>): T => {
    const stored = read(def);
    return stored === undefined ? def.default : def.check(stored);
  };
  const since = value(requiredSince);
  const start = since === '' ? null : new Date(since);
  return {
    session: {
      idleMinutes: value(idleMinutes),
      absoluteHours: value(absoluteHours),
      maxConcurrent: value(maxConcurrent),
    },
    mfa: {
      requiredForAll: value(requiredForAll),
      graceDays: value(graceDays),
      since: start === null || Number.isNaN(start.getTime()) ? null : start,
    },
    network: { adminAllowlist: value(adminAllowlist) },
    signIn: { notifyNewDevice: value(notifyNewDevice) },
  };
}
