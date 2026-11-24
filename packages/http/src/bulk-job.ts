/**
 * BieberKit
 *
 * @file        packages/http/src/bulk-job.ts
 * @description The job that runs a bulk call of more than 100 rows as the principal that sent it, and the route where its owner reads its state and its result (API-14, PERF-05, Q-10).
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

import * as z from 'zod/mini';
import { createContainer } from '@bieberkit/core';
import { entityOfSchema } from '@bieberkit/data/orm';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { defineJob } from '@bieberkit/queue';
import type { JobDef, JobResult, Queue } from '@bieberkit/queue';
import { authorizationFor } from './authorization.ts';
import type { BulkInput, BulkQueue } from './bulk.ts';
import { entityRoutes, pathOf } from './entity-routes.ts';
import type { Authorizer, Principal, RequestInfo } from './ports.ts';
import { HttpError } from './problem.ts';
import type { RouteContext } from './route.ts';
import type { HttpServer } from './server.ts';

export const BULK_JOB = 'http.bulk';
/** Where the owner of a job reads it. */
export const JOBS_PATH = '/api/v1/_jobs';

/** What the authorizer reads of a principal. The session and the way of signing in (`sessionId`, `via`) are not kept: a job needs neither. */
const principal = z.object({
  id: z.string(),
  kind: z.enum(['user', 'apiKey', 'service']),
  mfa: z.optional(z.boolean()),
  grants: z.optional(z.array(z.string())),
  tenantId: z.optional(z.string()),
});
const input = z.object({
  entity: z.string(),
  body: z.record(z.string(), z.unknown()),
  principal: z.optional(principal),
});

export interface BulkJobOptions {
  readonly db: Database;
  /** The compiled schemas of the project, the same as the entity routes have. */
  readonly schemas: readonly OrmSchema[];
  readonly authorizer?: Authorizer;
}

export interface BulkJob {
  /** The job. Register it in `createQueue({ jobs })`. */
  readonly job: JobDef<BulkInput>;
  /** The port for `registerEntityRoutes({ bulk })`: it queues a call on `queue`. */
  over(queue: Queue): BulkQueue;
}

/**
 * The job of the bulk calls above 100 rows (API-14, PERF-05). It runs the route of the entity again, with the body that the request had
 * validated, as the principal that sent it: the tenant and the user are restored by the queue (Q-10), and the permission, the rows and the
 * fields are asked of the authorizer again, so a role that was taken away while the job waited is honoured. The answer of the route (one
 * result for each row) is the result of the job, and its owner reads it at `GET /api/v1/_jobs/:id`.
 */
export function createBulkJob(options: BulkJobOptions): BulkJob {
  const job = defineJob<BulkInput>({
    name: BULK_JOB,
    queue: 'default',
    input,
    // The call is one transaction. A second try after a worker died could repeat a transition, so a dead job is for a person to look at.
    attempts: 1,
    handler: async (data, context): Promise<JobResult> => {
      const schema = options.schemas.find((candidate) => entityOfSchema(candidate).name === data.entity);
      if (schema === undefined) throw new Error(`The entity ${data.entity} is not served by this server.`);
      const url = `${pathOf(entityOfSchema(schema))}/bulk`;
      const route = entityRoutes(schema, { db: options.db, schemas: options.schemas, background: true }).find(
        (candidate) => candidate.method === 'POST' && candidate.url === url,
      );
      if (route === undefined) throw new Error(`The entity ${data.entity} has no bulk route.`);
      const info: RequestInfo = { method: 'POST', path: url, headers: {}, ip: '127.0.0.1' };
      const ctx: RouteContext = {
        params: {},
        query: {},
        body: data.body,
        headers: {},
        principal: data.principal,
        tenantId: context.tenantId,
        requestId: context.requestId,
        traceId: '0'.repeat(32),
        log: context.log,
        services: createContainer().services,
        status: () => undefined,
        header: () => undefined,
        ...authorizationFor(options.authorizer, data.principal, info),
      };
      // What the route answers is plain data: a list of results and the counts. The queue keeps it as JSON.
      return JSON.parse(JSON.stringify(await route.handler(ctx)));
    },
  });
  return {
    job,
    over: (queue) => ({
      async enqueue(call) {
        const dispatched = await queue.dispatch(job, { ...call, principal: lean(call.principal) });
        return { id: dispatched.id, location: `${JOBS_PATH}/${encodeURIComponent(dispatched.id)}` };
      },
    }),
  };
}

/** The principal as the job keeps it: only what the authorizer reads. A session id is a credential in spirit, and a job table is read by more people than a session store. */
function lean(principalOf: Principal | undefined): Principal | undefined {
  if (principalOf === undefined) return undefined;
  const { id, kind, mfa, grants, tenantId } = principalOf;
  return {
    id,
    kind,
    ...(mfa === undefined ? {} : { mfa }),
    ...(grants === undefined ? {} : { grants }),
    ...(tenantId === undefined ? {} : { tenantId }),
  };
}

const STATE = {
  type: 'object',
  properties: {
    data: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { enum: ['waiting', 'active', 'done', 'dead'] },
        attempts: { type: 'integer' },
        result: {},
        error: { type: 'string' },
        createdAt: { type: 'string' },
        finishedAt: { type: 'string' },
      },
      required: ['id', 'status', 'attempts', 'createdAt'],
    },
  },
  required: ['data'],
} as const;

/**
 * `GET /api/v1/_jobs/:id`: the state and the result of a job. A job is the property of the user and the tenant that dispatched it: for
 * anyone else it does not exist (404), so an id tells nothing. The error of a job that failed is a fixed sentence: the reason is in the
 * logs and in the dead letters, where an administrator reads it.
 */
export function registerJobRoutes(server: HttpServer, options: { readonly queue: Queue }): void {
  server.route({
    method: 'GET',
    url: `${JOBS_PATH}/:id`,
    public: true,
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', minLength: 1, maxLength: 200 } },
        required: ['id'],
      },
      response: { 200: STATE },
    },
    handler: async (ctx) => {
      if (ctx.principal === undefined) {
        throw new HttpError('HTTP_UNAUTHENTICATED', 401, 'Sign in to do this.', 'Send a valid session or API key.');
      }
      const found = await options.queue.status(String(ctx.params['id']));
      if (found === undefined || found.userId !== ctx.principal.id || found.tenantId !== ctx.tenantId) {
        throw new HttpError(
          'HTTP_NOT_FOUND',
          404,
          'There is no such job.',
          'Check the id. A job can be read by the user who started it.',
        );
      }
      return {
        data: {
          id: found.id,
          status: found.status,
          attempts: found.attempts,
          ...(found.result === undefined ? {} : { result: found.result }),
          ...(found.status === 'dead'
            ? { error: 'The job failed. An administrator can read the reason in the dead letters.' }
            : {}),
          createdAt: new Date(found.createdAt).toISOString(),
          ...(found.finishedAt === undefined ? {} : { finishedAt: new Date(found.finishedAt).toISOString() }),
        },
      };
    },
  });
}
