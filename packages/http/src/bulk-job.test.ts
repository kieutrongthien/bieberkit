/**
 * BieberKit
 *
 * @file        packages/http/src/bulk-job.test.ts
 * @description Tests of the bulk calls above 100 rows: they are queued, the job runs as the caller with the permissions asked again, its owner reads the result, and nobody else does (API-14, PERF-05, Q-10).
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

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  applyPluginMigrations,
  AuditLog,
  compileEntities,
  createDatabase,
  DATA_PLUGIN,
  dataMigrationSteps,
} from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { createQueue, QUEUE_PLUGIN, queueMigrationSteps } from '@bieberkit/queue';
import type { Queue } from '@bieberkit/queue';
import { createBulkJob, JOBS_PATH, registerJobRoutes } from './bulk-job.ts';
import { Account, Hidden, Note, Person } from './entity-app.ts';
import { registerEntityRoutes } from './entity-routes.ts';
import type { Authorizer, Principal } from './ports.ts';
import { OTHER_TENANT, TENANT, testServer } from './testing.ts';

const directory = mkdtempSync(join(tmpdir(), 'bk-bulk-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const BASE = '/api/v1/crm/accounts';
const ALICE: Principal = { id: '0190f6b2-7c4e-7000-8000-0000000000b1', kind: 'user', via: 'token' };
const BOB: Principal = { id: '0190f6b2-7c4e-7000-8000-0000000000b2', kind: 'user', via: 'token' };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const waitFor = async (done: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await sleep(20);
  }
};

interface Body {
  data?: Record<string, unknown> & {
    result?: { data: { id: string; status: string }[]; meta: Record<string, number> };
  };
  code?: string;
}
const json = (text: string): Body => (text === '' ? {} : JSON.parse(text));

const opened: { db: Database; queue: Queue }[] = [];
afterEach(async () => {
  for (const { db, queue } of opened.splice(0)) {
    await queue.close();
    await db.close();
  }
});

const allowAll: Authorizer = { can: async () => true };

async function setup(options: { authorizer?: Authorizer; withQueue?: boolean } = {}) {
  const authorizer = options.authorizer ?? allowAll;
  const schemas = compileEntities([Person, Account, Note, Hidden]);
  const url = join(directory, `${randomUUID()}.db`);
  const db = await createDatabase(
    { DB_CONNECTION: 'sqlite', DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 5 },
    { entities: schemas, audit: 'table' },
  );
  await applyPluginMigrations(db, [...dataMigrationSteps, ...queueMigrationSteps], {
    pluginOrder: [DATA_PLUGIN, QUEUE_PLUGIN],
  });
  const ddl = await db.orm.schema.getCreateSchemaSQL();
  for (const text of ddl
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !/bieberkit_|audit_log|\bbk_jobs|\bbk_locks/.test(part))) {
    await db.orm.em.getConnection().execute(text);
  }
  const bulkJob = createBulkJob({ db, schemas, authorizer });
  const queue = await createQueue({ driver: 'database', jobs: [bulkJob.job], db });
  opened.push({ db, queue });
  const who = { principal: ALICE as Principal | undefined, tenant: TENANT as string | undefined };
  const { server } = testServer({
    authenticator: { authenticate: async () => who.principal },
    tenantResolver: { resolve: async () => who.tenant },
    authorizer,
  });
  registerEntityRoutes(server, schemas, { db, ...(options.withQueue === false ? {} : { bulk: bulkJob.over(queue) }) });
  registerJobRoutes(server, { queue });
  const accounts = async (count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let n = 0; n < count; n += 1) {
      const response = await server.inject({
        method: 'POST',
        url: BASE,
        payload: { code: `B${String(n)}`, name: `Account ${String(n)}` },
      });
      if (response.statusCode !== 201) throw new Error(`create ${String(response.statusCode)} ${response.body}`);
      ids.push(String(json(response.body).data?.['id']));
    }
    return ids;
  };
  const bulk = (payload: object, headers: Record<string, string> = {}) =>
    server.inject({ method: 'POST', url: `${BASE}/bulk`, payload, headers });
  const job = (id: string) => server.inject({ method: 'GET', url: `${JOBS_PATH}/${id}` });
  /** Waits until the job is done or dead, and answers what the owner reads. */
  const ended = async (id: string): Promise<NonNullable<Body['data']>> => {
    let last: Body['data'];
    await waitFor(async () => {
      last = json((await job(id)).body).data;
      return last?.['status'] === 'done' || last?.['status'] === 'dead';
    });
    return last ?? {};
  };
  return { db, queue, server, who, accounts, bulk, job, ended };
}

const items = (ids: string[]) => ids.map((id) => ({ id, version: 1 }));
const ghosts = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `0190f6b2-7c4e-7000-8000-${String(i).padStart(12, '0')}`,
    version: 1,
  }));

describe('API-14 a bulk call above 100 rows is a job', () => {
  it('API-14 answers 202 with the job and where to read it, and a call of 100 rows is still answered at once', async () => {
    const app = await setup();
    const ids = await app.accounts(3);
    const inline = await app.bulk({ operation: 'update', items: items(ids), data: { tier: 'gold' } });
    expect(inline.statusCode).toBe(200);
    const big = await app.bulk({ operation: 'delete', items: ghosts(101) });
    expect(big.statusCode).toBe(202);
    const jobId = String(json(big.body).data?.['jobId']);
    expect(json(big.body).data).toMatchObject({ status: 'queued' });
    expect(big.headers['location']).toBe(`${JOBS_PATH}/${jobId}`);
    expect((await app.bulk({ operation: 'delete', items: ghosts(501) })).statusCode).toBe(400);
  });

  it('API-14 the job waits, and then has the result for each row, as the caller who sent it', async () => {
    const app = await setup();
    const real = await app.accounts(5);
    const call = [...items(real), ...ghosts(120)];
    const accepted = await app.bulk({ operation: 'update', items: call, data: { tier: 'gold' } });
    expect(accepted.statusCode).toBe(202);
    const jobId = String(json(accepted.body).data?.['jobId']);
    expect(json((await app.job(jobId)).body).data).toMatchObject({ id: jobId, status: 'waiting' });

    const worker = app.queue.createWorker({ pollMs: 20 });
    worker.start();
    const finished = await app.ended(jobId);
    expect(finished).toMatchObject({ id: jobId, status: 'done', attempts: 1 });
    const result = finished?.result;
    expect(result?.meta).toEqual({ requested: 125, succeeded: 5, failed: 120 });
    expect(
      result?.data
        .filter((row) => row.status === 'ok')
        .map((row) => row.id)
        .toSorted(),
    ).toEqual(real.toSorted());
    expect(result?.data.filter((row) => row.status === 'not_found')).toHaveLength(120);
    expect(finished).toHaveProperty('finishedAt');
    for (const id of real) {
      const row = json((await app.server.inject({ method: 'GET', url: `${BASE}/${id}` })).body).data;
      expect(row).toMatchObject({ tier: 'gold', version: 2 });
    }
    const audits = await app.db.fork().find(AuditLog, { action: 'crm.Account.update' });
    expect(audits).toHaveLength(5);
    expect(JSON.stringify(audits)).toContain(ALICE.id);
    await worker.stop();
  });

  it('API-14 a call that is sent again with the same Idempotency-Key is one job', async () => {
    const app = await setup();
    const call = { operation: 'delete', items: ghosts(101) };
    const first = await app.bulk(call, { 'idempotency-key': 'bulk-once' });
    const second = await app.bulk(call, { 'idempotency-key': 'bulk-once' });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(json(second.body).data?.['jobId']).toBe(json(first.body).data?.['jobId']);
    expect((await app.queue.stats()).default.waiting).toBe(1);
  });

  it('API-14 a server with no queue still refuses a call above 100 rows, and says why', async () => {
    const app = await setup({ withQueue: false });
    const response = await app.bulk({ operation: 'delete', items: ghosts(101) });
    expect(response.statusCode).toBe(422);
    expect(json(response.body).code).toBe('HTTP_BULK_TOO_LARGE');
  });

  it('API-14 the job also runs the transition and the delete of the call', async () => {
    const app = await setup();
    const ids = await app.accounts(2);
    const worker = app.queue.createWorker({ pollMs: 20 });
    worker.start();
    const deleted = await app.bulk({ operation: 'delete', items: [...items([ids[0] ?? '']), ...ghosts(110)] });
    const moved = await app.bulk({
      operation: 'transition',
      transition: 'open',
      items: [...items([ids[1] ?? '']), ...ghosts(110)],
    });
    for (const answer of [deleted, moved]) {
      const id = String(json(answer.body).data?.['jobId']);
      expect((await app.ended(id)).result?.meta).toMatchObject({ succeeded: 1, failed: 110 });
    }
    expect((await app.server.inject({ method: 'GET', url: `${BASE}/${ids[0]}` })).statusCode).toBe(404);
    expect(json((await app.server.inject({ method: 'GET', url: `${BASE}/${ids[1]}` })).body).data).toMatchObject({
      status: 'open',
    });
    await worker.stop();
  });
});

describe('Q-10 the job asks the authorizer again, as the principal that sent it', () => {
  it('Q-10 a permission that is taken away while the job waits makes the job fail, and nothing is changed', async () => {
    let allowed = true;
    const asked: string[] = [];
    const authorizer: Authorizer = {
      // Only the update is taken away: the caller can still read the rows to look at them.
      can: async (_principal, permission) => (asked.push(permission), allowed || permission !== 'crm.account.update'),
    };
    const app = await setup({ authorizer });
    const ids = await app.accounts(2);
    const accepted = await app.bulk({
      operation: 'update',
      items: [...items(ids), ...ghosts(110)],
      data: { tier: 'vip' },
    });
    expect(accepted.statusCode).toBe(202);
    const jobId = String(json(accepted.body).data?.['jobId']);
    allowed = false;
    const worker = app.queue.createWorker({ pollMs: 20 });
    worker.start();
    const dead = await app.ended(jobId);
    expect(dead?.['status']).toBe('dead');
    expect(dead?.['error']).toBe('The job failed. An administrator can read the reason in the dead letters.');
    expect(dead).not.toHaveProperty('result');
    expect(JSON.stringify(dead)).not.toContain('permission');
    expect((await app.queue.deadLetters()).jobs[0]?.error).toContain('You may not do this');
    for (const id of ids) {
      expect(json((await app.server.inject({ method: 'GET', url: `${BASE}/${id}` })).body).data).toMatchObject({
        tier: 'basic',
      });
    }
    await worker.stop();
  });

  it('Q-10 a key with grants keeps them in the job: the job can do what the key could, and no more', async () => {
    const authorizer: Authorizer = {
      can: async (principal, permission) => principal.grants?.includes(permission) === true,
    };
    const app = await setup({ authorizer });
    app.who.principal = {
      id: ALICE.id,
      kind: 'apiKey',
      via: 'token',
      grants: ['crm.account.create', 'crm.account.read', 'crm.account.update'],
      tenantId: TENANT,
    };
    const ids = await app.accounts(2);
    const accepted = await app.bulk({
      operation: 'update',
      items: [...items(ids), ...ghosts(105)],
      data: { tier: 'gold' },
    });
    expect(accepted.statusCode).toBe(202);
    const refused = await app.bulk({ operation: 'delete', items: [...items(ids), ...ghosts(105)] });
    expect(refused.statusCode).toBe(403);
    const worker = app.queue.createWorker({ pollMs: 20 });
    worker.start();
    const jobId = String(json(accepted.body).data?.['jobId']);
    expect((await app.ended(jobId)).result?.meta).toMatchObject({ succeeded: 2 });
    await worker.stop();
  });

  it('Q-10 a caller who may not do the operation is refused at once, and no job is queued', async () => {
    const authorizer: Authorizer = { can: async (_principal, permission) => permission !== 'crm.account.delete' };
    const app = await setup({ authorizer });
    const refused = await app.bulk({ operation: 'delete', items: ghosts(150) });
    expect(refused.statusCode).toBe(403);
    expect((await app.queue.stats()).default.waiting).toBe(0);
  });
});

async function queued() {
  const app = await setup();
  const accepted = await app.bulk({ operation: 'delete', items: ghosts(101) });
  return { app, jobId: String(json(accepted.body).data?.['jobId']) };
}

describe('API-14 the job belongs to the user and the tenant that sent it', () => {
  it('API-14 the owner reads it, and another user, another tenant or nobody does not', async () => {
    const { app, jobId } = await queued();
    expect((await app.job(jobId)).statusCode).toBe(200);
    app.who.principal = BOB;
    expect((await app.job(jobId)).statusCode).toBe(404);
    app.who.principal = ALICE;
    app.who.tenant = OTHER_TENANT;
    expect((await app.job(jobId)).statusCode).toBe(404);
    app.who.tenant = TENANT;
    app.who.principal = undefined;
    expect((await app.job(jobId)).statusCode).toBe(401);
  });

  it('API-14 an id that does not exist is the same 404 as the id of a job of someone else', async () => {
    const { app, jobId } = await queued();
    app.who.principal = BOB;
    const other = await app.job(jobId);
    const missing = await app.job('does-not-exist');
    expect(other.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(json(other.body).code).toBe(json(missing.body).code);
  });
});
