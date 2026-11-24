/**
 * BieberKit
 *
 * @file        packages/server/src/boot.test.ts
 * @description Tests of the boot: the roles start, serve and stop, the database is made, the metrics are on their own port, and a process that cannot start says why (section 7, section 7.2, section 19.4, ADR 0024).
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { boot, roleOf } from './boot.ts';
import type { Running } from './boot.ts';
import { makeMigration } from './migrations.ts';
import { freePort, makeProject, testEnv } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
const running: Running[] = [];
afterEach(async () => {
  for (const one of running.splice(0)) await one.stop();
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

async function start(
  role: Parameters<typeof boot>[0]['role'],
  extra: Record<string, string> = {},
  files: Record<string, string> = {},
) {
  const fixture = makeProject(files);
  fixtures.push(fixture);
  const env = await testEnv(fixture.root, extra);
  const one = await boot({ role, cwd: fixture.root, env });
  running.push(one);
  return { one, env, root: fixture.root };
}

const get = async (port: number | undefined, path: string): Promise<{ status: number; body: string }> => {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`);
  return { status: response.status, body: await response.text() };
};

/** A real module consumes the runtime services and observes queue shutdown without replacing its driver. */
async function startPlatform(extra: Record<string, string> = {}) {
  const fixture = makeProject();
  fixtures.push(fixture);
  const marker = join(fixture.root, 'queue.closed');
  const ran = join(fixture.root, 'job.ran');
  const folder = join(fixture.root, 'apps/server/src/modules/platform');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, 'module.ts'),
    `
import { defineModule } from '@bieberkit/core';
import { defineJob } from '@bieberkit/queue';
import { writeFileSync } from 'node:fs';
import { z } from 'zod';

const job = defineJob({
  name: 'platform.probe',
  input: z.object({}),
  handler: async () => { writeFileSync(${JSON.stringify(ran)}, 'ran'); },
});
let observed = false;
const route = {
  method: 'GET',
  url: '/api/v1/platform/services',
  public: true,
  schema: { response: { 200: { type: 'object', properties: { cache: { type: 'string' }, job: { type: 'string' } }, required: ['cache', 'job'] } } },
  handler: async ({ services }) => {
    await services.mail.verify();
    await services.cache.set('platform.probe', 'ready', 60000);
    const queue = services.queue;
    if (!observed) {
      observed = true;
      const close = queue.close.bind(queue);
      queue.close = async () => {
        await close();
        writeFileSync(${JSON.stringify(marker)}, 'closed');
      };
    }
    const dispatched = await queue.dispatch(job, {});
    const status = await queue.status(dispatched.id);
    return { cache: await services.cache.get('platform.probe'), job: status?.status };
  },
};
export default defineModule({ name: 'platform', jobs: [job], routes: [route] });
`,
  );
  const env = await testEnv(fixture.root, extra);
  // Deployment runs migrations before starting a web process; the web role never creates its tables.
  const migrated = await boot({ role: 'migrate', cwd: fixture.root, env });
  expect(await migrated.stop()).toBe(0);
  const one = await boot({ role: 'web', cwd: fixture.root, env });
  running.push(one);
  return { one, marker, ran };
}

/** An adapter whose page has one file, installed in the project, and the env of a booted process with the given addresses. */

async function adminProject(urls: (port: number) => Record<string, string>) {
  const fixture = makeProject();
  fixtures.push(fixture);
  const folder = join(fixture.root, 'node_modules/@bieberkit/admin-antd');
  mkdirSync(join(folder, 'dist/app/assets'), { recursive: true });
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: '@bieberkit/admin-antd', version: '0.0.0' }));
  writeFileSync(
    join(folder, 'dist/app/index.html'),
    '<!doctype html><head><title>admin</title></head><script src="./assets/main.js"></script>',
  );
  writeFileSync(join(folder, 'dist/app/assets/main.js'), 'console.log(1)');
  const port = await freePort();
  const env = await testEnv(fixture.root, { APP_PORT: String(port), ...urls(port) });
  const one = await boot({ role: 'dev', cwd: fixture.root, env });
  running.push(one);
  return { port, one };
}

/** A request with the host that a proxy would send: the name that a browser typed, whatever it connected to. */
function request(
  port: number,
  host: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
) {
  return new Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }>(
    (resolve, reject) => {
      const call = httpRequest(
        { host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers: { host, ...init.headers } },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
              headers: response.headers,
            }),
          );
        },
      );
      call.on('error', reject);
      call.end(init.body);
    },
  );
}

describe('section 7.1 the roles', () => {
  it('7.1 reads the role from the arguments, and dev is web, worker and scheduler in one process', () => {
    expect(roleOf(['web'])).toBe('web');
    expect(roleOf(['--role=worker'])).toBe('worker');
    expect(roleOf(['dev'])).toBe('dev');
    expect(() => roleOf([])).toThrow(/role/);
  });

  it('7.1 the web role serves the routes of the modules and of the entities, the probes and the document of the API', async () => {
    const { one, env } = await start('web');
    expect(one.roles).toEqual(['web']);
    expect(one.port).toBe(Number(env['APP_PORT']));
    expect(await get(one.port, '/api/v1/crm/ping')).toEqual({ status: 200, body: '{"pong":true}' });
    expect((await get(one.port, '/health/ready')).status).toBe(200);
    // An entity route needs a permission, and nobody is signed in: the default is to deny (AUTHZ-01).
    expect((await get(one.port, '/api/v1/crm/people')).status).toBe(401);
    const document = await get(one.port, '/api/v1/openapi.json');
    expect(document.status).toBe(200);
    expect(JSON.parse(document.body).paths['/api/v1/crm/people']).toBeDefined();
  });

  it('OBS-03 the metrics are on a port of their own, and count the requests of the web role', async () => {
    const { one } = await start('web');
    await get(one.port, '/api/v1/crm/ping');
    const metrics = await get(one.metricsPort, '/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.body).toContain(
      'bk_http_request_duration_seconds_count{method="GET",route="/api/v1/crm/ping",status="200"} 1',
    );
    expect(metrics.body).toContain('bk_event_loop_lag_seconds');
    // The public port has no metrics (OBS-04).
    expect((await get(one.port, '/metrics')).status).toBe(404);
  });

  it('6 step 10 the migrate role makes the tables of the framework and of the entities, and ends', async () => {
    const { one } = await start('migrate');
    expect(one.roles).toEqual(['migrate']);
    const rows = await one.database.orm.em
      .getConnection()
      .execute("select name from sqlite_master where type = 'table'");
    const names = rows.map((row: unknown) => String(Object(row).name));
    for (const table of ['crm_people', 'bk_outbox', 'bk_audit_log', 'bk_auth_roles']) expect(names).toContain(table);
  });

  it('DATA-25 the migrate role in production runs the files of the project on MIGRATE_DATABASE_URL, and makes no table from the entities', async () => {
    const fixture = makeProject();
    fixtures.push(fixture);
    const env = await testEnv(fixture.root, {
      APP_ENV: 'production',
      APP_SINGLE_NODE: 'true',
      QUEUE_DRIVER: 'database',
      MIGRATE_DATABASE_URL: join(fixture.root, 'test.db'),
    });
    await makeMigration({ cwd: fixture.root, env });
    const one = await boot({ role: 'migrate', cwd: fixture.root, env });
    running.push(one);
    const rows = await one.database.orm.em
      .getConnection()
      .execute("select name from sqlite_master where type = 'table'");
    const names = rows.map((row: unknown) => String(Object(row).name));
    for (const table of ['crm_people', 'bk_migrations', 'bk_plugin_migrations', 'bk_jobs'])
      expect(names).toContain(table);
  });

  it('AUTH-01 the web role serves the sign up and the sign in of Better Auth, and a signed in user is a principal: 403 where it was 401', async () => {
    const { one, env } = await start('dev');
    const base = `http://127.0.0.1:${String(one.port)}`;
    const headers = {
      'content-type': 'application/json',
      origin: env['APP_URL'] ?? `http://localhost:${String(one.port)}`,
      'sec-fetch-site': 'same-origin',
    };
    const email = 'admin@example.com';
    const password = 'correct horse battery staple';
    const up = await fetch(`${base}/api/auth/sign-up/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, name: 'Admin' }),
    });
    expect(up.status).toBe(200);
    const inn = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    expect(inn.status).toBe(200);
    const cookie = inn.headers
      .getSetCookie()
      .find((line) => line.startsWith('__Host-bk_session='))
      ?.split(';')[0];
    expect(cookie).toBeDefined();
    expect((await get(one.port, '/api/v1/crm/people')).status).toBe(401);
    const signedIn = await fetch(`${base}/api/v1/crm/people`, { headers: { cookie: cookie ?? '' } });
    expect(signedIn.status).toBe(403);
    // The metadata is what the admin draws from, and it is for a signed in user only.
    expect((await get(one.port, '/api/v1/_meta')).status).toBe(401);
    expect((await fetch(`${base}/api/v1/_meta`, { headers: { cookie: cookie ?? '' } })).status).toBe(200);
  });

  it('UI-14 the web role serves the admin under /admin/ with its own policy when an adapter is installed, and the API keeps its own', async () => {
    const fixture = makeProject();
    fixtures.push(fixture);
    const folder = join(fixture.root, 'node_modules/@bieberkit/admin-antd');
    mkdirSync(join(folder, 'dist/app/assets'), { recursive: true });
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: '@bieberkit/admin-antd', version: '0.0.0' }));
    writeFileSync(join(folder, 'dist/app/index.html'), '<!doctype html><title>admin</title>');
    const env = await testEnv(fixture.root);
    const one = await boot({ role: 'web', cwd: fixture.root, env });
    running.push(one);
    const base = `http://127.0.0.1:${String(one.port)}`;
    const page = await fetch(`${base}/admin/settings/settings`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>admin</title>');
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect((await fetch(`${base}/api/v1/crm/ping`)).headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
  });

  it('UI-14 ADMIN_URL puts the admin under any path of the application, and /admin is not served then', async () => {
    const { port } = await adminProject((p) => ({
      APP_URL: `http://127.0.0.1:${String(p)}`,
      ADMIN_URL: `http://127.0.0.1:${String(p)}/back/office`,
    }));
    const page = await request(port, `127.0.0.1:${String(port)}`, '/back/office/settings/settings/new');
    expect(page.status).toBe(200);
    expect(page.body).toContain('src="/back/office/assets/main.js"');
    expect(page.body).toContain('<meta name="bk-admin-base" content="/back/office" />');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect((await request(port, `127.0.0.1:${String(port)}`, '/back/office/assets/main.js')).status).toBe(200);
    expect((await request(port, `127.0.0.1:${String(port)}`, '/admin/')).status).toBe(404);
  });

  it('UI-14 ADMIN_URL puts the admin at the root of a host of its own, for that host only, and the API stays what it is on both', async () => {
    const { port } = await adminProject((p) => ({
      APP_URL: `http://127.0.0.1:${String(p)}`,
      ADMIN_URL: `http://admin.localhost:${String(p)}`,
    }));
    const admin = `admin.localhost:${String(port)}`;
    const main = `127.0.0.1:${String(port)}`;
    const page = await request(port, admin, '/settings/settings');
    expect(page.status).toBe(200);
    expect(page.body).toContain('src="/assets/main.js"');
    expect(page.body).toContain('<meta name="bk-admin-base" content="" />');
    expect((await request(port, main, '/')).status).toBe(404);
    expect((await request(port, main, '/admin/')).status).toBe(404);
    // The API is the API on the host of the admin too, and a missing route is its problem and not the page.
    const missing = await request(port, admin, '/api/v1/nothing');
    expect([missing.status, JSON.parse(missing.body).code]).toEqual([404, 'HTTP_NOT_FOUND']);
    expect((await request(port, admin, '/health/live')).status).toBe(200);
  });

  it('UI-14 a person signs in from the host of the admin: its origin is trusted, and the session works there', async () => {
    const { port } = await adminProject((p) => ({
      APP_URL: `http://127.0.0.1:${String(p)}`,
      ADMIN_URL: `http://admin.localhost:${String(p)}`,
    }));
    const admin = `admin.localhost:${String(port)}`;
    const headers = { 'content-type': 'application/json', origin: `http://${admin}`, 'sec-fetch-site': 'same-origin' };
    const body = JSON.stringify({ email: 'ann@example.com', password: 'correct horse battery staple', name: 'Ann' });
    const up = await request(port, admin, '/api/auth/sign-up/email', { method: 'POST', headers, body });
    expect(up.status).toBe(200);
    const inn = await request(port, admin, '/api/auth/sign-in/email', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'ann@example.com', password: 'correct horse battery staple' }),
    });
    expect(inn.status).toBe(200);
    const cookie =
      [inn.headers['set-cookie']]
        .flat()
        .find((line) => line?.startsWith('__Host-bk_session='))
        ?.split(';')[0] ?? '';
    expect((await request(port, admin, '/api/v1/_meta', { headers: { cookie } })).status).toBe(200);
  });

  it('UI-14 an ADMIN_URL that is not a place stops the boot with its own code', async () => {
    const fixture = makeProject();
    fixtures.push(fixture);
    const env = await testEnv(fixture.root, { ADMIN_URL: 'http://localhost:3000/api' });
    await expect(boot({ role: 'web', cwd: fixture.root, env })).rejects.toMatchObject({ code: 'BK_ADMIN_URL_INVALID' });
  });

  it('UI-14 without an adapter, /admin/ is not served', async () => {
    const { one } = await start('web');
    expect((await get(one.port, '/admin/')).status).toBe(404);
  });

  it('7.1 the worker role starts the queue and the outbox dispatcher, and stops them', async () => {
    const { one } = await start('worker');
    expect(one.roles).toEqual(['worker']);
    expect(one.port).toBeUndefined();
    expect(await one.stop()).toBe(0);
    running.pop();
  });

  it('5.2 dev is one process with the three roles: it makes the tables, serves the API and runs the worker', async () => {
    const { one } = await start('dev');
    expect(one.roles).toEqual(['web', 'worker', 'scheduler']);
    expect((await get(one.port, '/api/v1/crm/ping')).status).toBe(200);
    const rows = await one.database.orm.em
      .getConnection()
      .execute("select name from sqlite_master where name = 'crm_people'");
    expect(rows).toHaveLength(1);
  });

  it('19.4 stop answers 0, frees the port, and a second start on the same port works', async () => {
    const { one, env } = await start('web');
    const port = one.port;
    expect(await one.stop()).toBe(0);
    running.pop();
    await expect(fetch(`http://127.0.0.1:${String(port)}/health/live`)).rejects.toThrow(/fetch failed/);
    const again = await boot({ role: 'web', cwd: fixtures[0]?.root ?? '', env });
    running.push(again);
    expect(again.port).toBe(port);
  });
});

describe('BPL-02 platform services on the web role', () => {
  it('BPL-02 the web role has the services mail, queue and cache', async () => {
    const { one } = await startPlatform();
    const response = await get(one.port, '/api/v1/platform/services');
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ cache: 'ready', job: 'done' });
  });

  it('BPL-02 the web role starts, serves and stops with the database queue and runs no worker', async () => {
    const { one, marker, ran } = await startPlatform({ QUEUE_DRIVER: 'database' });
    const response = await get(one.port, '/api/v1/platform/services');
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ cache: 'ready', job: 'waiting' });
    expect(existsSync(ran)).toBe(false);
    expect(await one.stop()).toBe(0);
    running.pop();
    expect(readFileSync(marker, 'utf8')).toBe('closed');
    expect(existsSync(ran)).toBe(false);
  });
});

it('BPL-04 boot applies the subscriptions contributed by a module', async () => {
  const { one } = await start(
    'web',
    {},
    {
      'apps/server/src/modules/events/module.ts': `
import { defineModule } from '@bieberkit/core';
import { defineJob } from '@bieberkit/queue';
import { z } from 'zod';
import { rawKysely } from '@bieberkit/data/orm';
let seen = 0;
const job = defineJob({ name: 'events.receive', input: z.object({ value: z.number() }), handler: async ({ value }) => { seen = value; } });
async function publishEvent(services) {
  const sql = await rawKysely(services.database);
  await sql.transaction().execute((trx) => services.queue.publisher.publish({
    id: '0190f6b2-7c4e-7000-8000-0000000000a1', jobId: 'ob-events-probe',
    name: 'events.probe', version: 8, payload: { value: 999 }, createdAt: new Date(),
  }, trx));
}
const route = {
  method: 'GET', url: '/api/v1/events/probe', public: true,
  schema: { response: { 200: { type: 'object', properties: { seen: { type: 'number' } }, required: ['seen'] } } },
  handler: async ({ services }) => {
    await publishEvent(services);
    return { seen };
  },
};
export default defineModule({
  name: 'events', jobs: [job], routes: [route],
  subscriptions: [{ event: 'events.probe', job, map: (event) => ({ value: event.version }) }],
});
`,
    },
  );
  const response = await get(one.port, '/api/v1/events/probe');
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ seen: 8 });
});

describe('section 7.2 a process that cannot start', () => {
  it('CFG-09 an environment that is not valid stops the boot with the code of the key, before anything starts', async () => {
    const fixture = makeProject();
    fixtures.push(fixture);
    await expect(boot({ role: 'web', cwd: fixture.root, env: { APP_PORT: 'not a port' } })).rejects.toMatchObject({
      code: 'CFG_ENV_INVALID',
    });
  });

  it('7.2 a directory with no project is BK_PROJECT_NOT_FOUND', async () => {
    await expect(boot({ role: 'web', cwd: '/', env: {} })).rejects.toMatchObject({ code: 'BK_PROJECT_NOT_FOUND' });
  });

  it('7.2 a port that is taken is BK_BOOT_FAILED, and the database is closed again', async () => {
    const first = await start('web');
    const fixture = makeProject();
    fixtures.push(fixture);
    const env = await testEnv(fixture.root, { APP_PORT: String(first.one.port) });
    await expect(boot({ role: 'web', cwd: fixture.root, env })).rejects.toMatchObject({ code: 'BK_BOOT_FAILED' });
  });
});
