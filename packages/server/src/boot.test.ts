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

import { afterEach, describe, expect, it } from 'vitest';
import { boot, roleOf } from './boot.ts';
import type { Running } from './boot.ts';
import { makeProject, testEnv } from './testing/project.ts';
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
    for (const table of ['crm_people', 'bieberkit_outbox', 'audit_log', 'auth_roles']) expect(names).toContain(table);
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
