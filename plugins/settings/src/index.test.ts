/**
 * BieberKit
 *
 * @file        plugins/settings/src/index.test.ts
 * @description Tests of the settings plugin: declared keys only, one way to write, secrets that never leave, tenant values with fallback, the typed and cached read, audit of each change, the public settings, paging and permissions (SET-01 to SET-07, BPL-05, BPL-06, AUTHZ-01).
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

import { expect, it, vi } from 'vitest';
import { defineModule, defineSetting } from '@bieberkit/core';
import type { Parser } from '@bieberkit/core';
import { AuditLog, runInUnitOfWork } from '@bieberkit/data/orm';
import { createTestApp, describeDialects } from '@bieberkit/testing';
import type { TestApp } from '@bieberkit/testing';
import plugin, { siteName } from './index.ts';

const SETTINGS = '/api/v1/settings/settings';
const PUBLIC = '/api/v1/settings/public';
const NIL = '00000000-0000-0000-0000-000000000000';
const TENANT_A = '0190a0a0-0000-7000-8000-00000000000a';
const TENANT_B = '0190a0a0-0000-7000-8000-00000000000b';
const label = { en: 'A setting' } as const;

const colors: Parser<{ primary: string }> = {
  parse(input) {
    const primary: unknown = Reflect.get(Object(input), 'primary');
    if (typeof primary !== 'string' || !/^#[0-9a-f]{6}$/.test(primary)) throw new Error('primary must be a hex color');
    return { primary };
  },
};

/** The settings of a module of the project: not a plugin, so its keys have no prefix rule. */
const smtpPassword = defineSetting({ key: 'shop.smtp.password', type: 'string', default: '', label, secret: true });
const pageSize = defineSetting({ key: 'shop.page-size', type: 'number', default: 25, label, scope: 'tenant' });
const theme = defineSetting({
  key: 'shop.theme',
  type: 'json',
  parser: colors,
  default: { primary: '#000000' },
  label,
  public: true,
  group: 'look',
});
const shop = defineModule({ name: 'shop', settings: [smtpPassword, pageSize, theme] });

interface Row {
  key: string;
  value: unknown;
  hasValue: boolean;
}

const rowsOf = (body: Readonly<Record<string, unknown>>): Row[] => {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
};

async function auditOf(app: TestApp): Promise<{ action: string; data: unknown }[]> {
  return runInUnitOfWork(app.db, async (em) =>
    (await em.find(AuditLog, {}, { orderBy: { at: 'asc' } }))
      .filter((row) => row.action.startsWith('settings.'))
      .map((row) => ({ action: row.action, data: row.data == null ? null : JSON.parse(row.data) })),
  );
}

it('12 the plugin names its permissions and declares the settings of the site', () => {
  expect(plugin.name).toBe('@bieberkit/plugin-settings');
  expect(plugin.permissions).toEqual(['settings.read', 'settings.manage']);
  expect(plugin.module.contributions['settings']).toEqual(expect.arrayContaining([siteName]));
  expect(siteName).toMatchObject({ key: 'settings.site.name', type: 'string', public: true });
});

describeDialects('SET the settings plugin', ({ open }) => {
  async function world() {
    const app = await createTestApp({
      modules: [plugin.module, shop],
      open,
      tenant: NIL,
      roles: { reader: ['settings.read'], manager: ['settings.read', 'settings.manage'] },
    });
    const manager = await app.actingAs(app.newUser(), ['manager']);
    return { app, manager };
  }

  it('SET-01 an undeclared key is SETTINGS_UNKNOWN_KEY (404) on every route and in the service', async () => {
    const { app, manager } = await world();
    for (const reply of [
      await manager.get(`${SETTINGS}/shop.nothing`),
      await manager.put(`${SETTINGS}/shop.nothing`, { value: 1 }),
      await manager.delete(`${SETTINGS}/shop.nothing`, 0),
    ]) {
      expect([reply.status, reply.body['code']]).toEqual([404, 'SETTINGS_UNKNOWN_KEY']);
    }
    await expect(app.services.settings.set('shop.nothing', 1, { actorId: null })).rejects.toMatchObject({
      code: 'SETTINGS_UNKNOWN_KEY',
    });
    await app.close();
  });

  it('SET-01 a key declared by two modules stops the boot with SETTINGS_DUPLICATE_KEY', async () => {
    const again = defineModule({
      name: 'again',
      settings: [defineSetting({ key: 'shop.page-size', type: 'number', default: 10, label })],
    });
    await expect(createTestApp({ modules: [plugin.module, shop, again], open })).rejects.toMatchObject({
      code: 'SETTINGS_DUPLICATE_KEY',
    });
  });

  it('SET-02 the generated entity routes are gone, a value is checked, and DELETE goes back to the default', async () => {
    const { app, manager } = await world();
    expect((await manager.post(SETTINGS, { key: 'shop.page-size', value: '10' })).status).toBe(404);
    const bad = await manager.put(`${SETTINGS}/shop.page-size`, { value: 'ten' });
    expect([bad.status, bad.body['code']]).toEqual([422, 'SETTINGS_INVALID_VALUE']);
    const badJson = await manager.put(`${SETTINGS}/shop.theme`, { value: { primary: 'red' } });
    expect(JSON.stringify(badJson.body)).toMatch(/hex color/);
    const set = await manager.put(`${SETTINGS}/shop.page-size`, { value: 50 });
    expect(set.body).toMatchObject({ key: 'shop.page-size', value: 50, hasValue: true, default: 25 });
    expect((await manager.delete(`${SETTINGS}/shop.page-size`, 0)).status).toBe(204);
    expect((await manager.get(`${SETTINGS}/shop.page-size`)).body).toMatchObject({ value: 25, hasValue: false });
    await app.close();
  });

  it('SET-03 a secret is encrypted, never returned and never in the audit data', async () => {
    const { app, manager } = await world();
    const written = await manager.put(`${SETTINGS}/shop.smtp.password`, { value: 'hunter2-secret' });
    expect(written.body).toMatchObject({ value: '********', hasValue: true, secret: true });
    expect((await manager.get(`${SETTINGS}/shop.smtp.password`)).body['value']).toBe('********');
    const listed = rowsOf((await manager.get(`${SETTINGS}?pageSize=100`)).body);
    expect(listed.find((row) => row.key === 'shop.smtp.password')?.value).toBe('********');
    const everything = JSON.stringify([listed, await auditOf(app)]);
    expect(everything).not.toContain('hunter2-secret');
    const stored = await app.db.orm.em.getConnection().execute('select * from bk_settings');
    expect(JSON.stringify(stored)).not.toContain('hunter2-secret');
    // The service gives the clear value to code, which is what the secret is for.
    expect(await app.services.settings.get(smtpPassword)).toBe('hunter2-secret');
    await app.close();
  });

  it('SET-04 a tenant value wins, then the global value, then the default, and tenants do not see each other', async () => {
    const { app, manager } = await world();
    await manager.put(`${SETTINGS}/shop.page-size`, { value: 40 });
    const inA = await app.withTenant(TENANT_A).actingAs(app.newUser(), ['manager']);
    const inB = await app.withTenant(TENANT_B).actingAs(app.newUser(), ['manager']);
    await inA.put(`${SETTINGS}/shop.page-size`, { value: 10 });
    expect((await inA.get(`${SETTINGS}/shop.page-size`)).body['value']).toBe(10);
    expect((await inB.get(`${SETTINGS}/shop.page-size`)).body['value']).toBe(40);
    expect(await app.services.settings.get(pageSize, { tenantId: TENANT_A })).toBe(10);
    expect(await app.services.settings.get(pageSize, { tenantId: TENANT_B })).toBe(40);
    await manager.delete(`${SETTINGS}/shop.page-size`, 0);
    expect(await app.services.settings.get(pageSize, { tenantId: TENANT_B })).toBe(25);
    await app.close();
  });

  it('SET-04 a global setting is changed only outside a tenant (SETTINGS_SCOPE_REFUSED)', async () => {
    const { app } = await world();
    const inA = await app.withTenant(TENANT_A).actingAs(app.newUser(), ['manager']);
    const refused = await inA.put(`${SETTINGS}/shop.theme`, { value: { primary: '#ffffff' } });
    expect([refused.status, refused.body['code']]).toEqual([403, 'SETTINGS_SCOPE_REFUSED']);
    expect((await inA.get(`${SETTINGS}/shop.theme`)).status).toBe(200);
    await app.close();
  });

  it('SET-05 the read is typed, sees a change after commit, and falls back when the cache fails', async () => {
    const { app } = await world();
    const settings = app.services.settings;
    expect(await settings.get(theme)).toEqual({ primary: '#000000' });
    await settings.set(theme, { primary: '#111111' }, { actorId: null });
    expect(await settings.get(theme)).toEqual({ primary: '#111111' });
    await settings.set(theme, { primary: '#222222' }, { actorId: null });
    expect(await settings.get(theme)).toEqual({ primary: '#222222' });
    const down = vi.spyOn(app.services.cache, 'tags').mockImplementation(() => {
      throw new Error('the cache is down');
    });
    expect(await settings.get(theme)).toEqual({ primary: '#222222' });
    down.mockRestore();
    await app.close();
  });

  it('SET-06 each change and reset is audited with the old and new value, and a failed audit changes nothing', async () => {
    const { app, manager } = await world();
    await manager.put(`${SETTINGS}/shop.page-size`, { value: 30 });
    await manager.put(`${SETTINGS}/shop.page-size`, { value: 31 });
    await manager.delete(`${SETTINGS}/shop.page-size`, 0);
    await manager.put(`${SETTINGS}/shop.smtp.password`, { value: 'second-secret' });
    expect(await auditOf(app)).toEqual([
      { action: 'settings.setting.updated', data: { key: 'shop.page-size', old: null, new: 30 } },
      { action: 'settings.setting.updated', data: { key: 'shop.page-size', old: 30, new: 31 } },
      { action: 'settings.setting.reset', data: { key: 'shop.page-size', old: 31, new: null } },
      { action: 'settings.setting.updated', data: { key: 'shop.smtp.password' } },
    ]);
    await app.db.orm.em.getConnection().execute('drop table bk_audit_log');
    expect((await manager.put(`${SETTINGS}/shop.page-size`, { value: 99 })).status).toBe(500);
    expect(await app.services.settings.get(pageSize)).toBe(25);
    await app.close();
  });

  it('SET-07 the public settings need no session, list only public ones and are cacheable', async () => {
    const { app, manager } = await world();
    await manager.put(`${SETTINGS}/settings.site.name`, { value: 'Demo' });
    const reply = await app.anonymous().get(PUBLIC);
    expect(reply.status).toBe(200);
    const keys = rowsOf(reply.body).map((row) => row.key);
    expect(keys).toEqual(expect.arrayContaining(['settings.site.name', 'shop.theme']));
    expect(keys).not.toContain('shop.smtp.password');
    expect(keys).not.toContain('shop.page-size');
    expect(rowsOf(reply.body).find((row) => row.key === 'settings.site.name')?.value).toBe('Demo');
    expect(String(reply.headers['cache-control'])).toMatch(/public/);
    await app.close();
  });

  it('BPL-06 the list pages by key with a cursor and a page of at most 100', async () => {
    const { app, manager } = await world();
    const first = await manager.get(`${SETTINGS}?pageSize=2`);
    const meta = Object(first.body['meta']);
    expect(rowsOf(first.body)).toHaveLength(2);
    const rest = await manager.get(`${SETTINGS}?pageSize=100&cursor=${encodeURIComponent(String(meta['nextCursor']))}`);
    const keys = [...rowsOf(first.body), ...rowsOf(rest.body)].map((row) => row.key);
    expect(keys).toEqual(keys.toSorted((a, b) => a.localeCompare(b)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['settings.site.name', 'shop.page-size', 'shop.theme']));
    expect(Object((await manager.get(`${SETTINGS}?pageSize=500`)).body['meta'])['pageSize']).toBe(100);
    await app.close();
  });

  it('AUTHZ-01 reading needs settings.read and writing needs settings.manage', async () => {
    const { app } = await world();
    const reader = await app.actingAs(app.newUser(), ['reader']);
    expect((await reader.get(SETTINGS)).status).toBe(200);
    expect((await reader.put(`${SETTINGS}/shop.page-size`, { value: 1 })).status).toBe(403);
    expect((await reader.delete(`${SETTINGS}/shop.page-size`, 0)).status).toBe(403);
    expect((await (await app.actingAs(app.newUser())).get(SETTINGS)).status).toBe(403);
    expect((await app.anonymous().get(SETTINGS)).status).toBe(401);
    await app.close();
  });
});

// Settings with the keys and the guard of the security policies, declared here because a plugin does not import `@bieberkit/auth`.
const requiredForAll = defineSetting({
  key: 'security.mfa.required-for-all',
  type: 'boolean',
  default: false,
  label,
  guard: (value, actor) => value === true && !actor.mfa,
});
const requiredSince = defineSetting({ key: 'security.mfa.required-since', type: 'string', default: '', label });
const secure = defineModule({ name: 'secure', settings: [requiredForAll, requiredSince] });

describeDialects('POL-05 the settings service refuses a change that locks the person out', ({ open }) => {
  async function world() {
    const app = await createTestApp({
      modules: [plugin.module, secure],
      open,
      tenant: NIL,
      roles: { manager: ['settings.read', 'settings.manage'] },
    });
    return { app, manager: await app.actingAs(app.newUser(), ['manager']) };
  }

  it('POL-05 a guard that says lock-out gives SETTINGS_SELF_LOCKOUT (409) and changes nothing', async () => {
    const { app, manager } = await world();
    const refused = await manager.put(`${SETTINGS}/security.mfa.required-for-all`, { value: true });
    expect([refused.status, refused.body['code']]).toEqual([409, 'SETTINGS_SELF_LOCKOUT']);
    expect((await manager.get(`${SETTINGS}/security.mfa.required-for-all`)).body).toMatchObject({
      value: false,
      hasValue: false,
    });
    expect((await auditOf(app)).filter((entry) => entry.action === 'settings.setting.updated')).toHaveLength(0);
    await app.close();
  });

  it('POL-05 the same value is allowed when it does not lock the person out, and turning it off is never refused', async () => {
    const { app, manager } = await world();
    const service = app.services.settings;
    await service.set(requiredForAll, true, { actorId: null });
    expect((await manager.put(`${SETTINGS}/security.mfa.required-for-all`, { value: false })).status).toBe(200);
    await app.close();
  });

  it('POL-02 turning the rule on stamps required-since, and turning it off clears it', async () => {
    const { app } = await world();
    const service = app.services.settings;
    await service.set(requiredForAll, true, { actorId: null });
    const since = await service.get(requiredSince);
    expect(Number.isNaN(Date.parse(since))).toBe(false);
    await service.set(requiredForAll, false, { actorId: null });
    expect(await service.get(requiredSince)).toBe('');
    await app.close();
  });
});
