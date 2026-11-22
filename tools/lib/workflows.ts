/**
 * BieberKit
 *
 * @file        tools/lib/workflows.ts
 * @description Checks GitHub Actions workflows against the release rules SEC-15, SEC-16 and SEC-21, which actionlint and zizmor do not cover.
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

// Pure function over workflow text, used by tools/check-workflows.ts and tested without the file system.
// Erasable TypeScript only, so Node.js runs this file directly.

import { parse } from 'yaml';

export interface Violation {
  file: string;
  job: string;
  rule: 'SEC-15' | 'SEC-16' | 'SEC-21';
  detail: string;
  fix: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const asObj = (v: unknown): Obj => (isObj(v) ? v : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Installs, builds, tests and generic script runners. `npm publish` and `npm view` are what the publish job is for. */
const INSTALL_OR_BUILD =
  /\b(pnpm|npm|yarn|bun)\s+(i|install|ci|add|run|test|build|exec|dlx)\b|\b(pnpm|npm)\s+-r\b|\bnode-gyp\b|\bmake\b|\btsc\b|\bvitest\b|\bturbo\b/;
const stripPublish = (line: string): string => line.replace(/\bnpm (publish|view)\b/g, '');

/** The only actions a job that holds id-token: write may use (SEC-21). */
export const ID_TOKEN_JOB_ALLOWED_ACTIONS: readonly string[] = ['actions/download-artifact', 'actions/setup-node'];

function holdsIdToken(permissions: unknown): boolean {
  if (permissions === 'write-all') return true;
  return isObj(permissions) && permissions['id-token'] === 'write';
}

function triggerNames(on: unknown): string[] {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.filter((x): x is string => typeof x === 'string');
  return Object.keys(asObj(on));
}

/** Returns every violation of SEC-15, SEC-16 and SEC-21 in one workflow file. An empty list means the file is fine. */
export function checkWorkflow(file: string, text: string): Violation[] {
  const wf = asObj(parse(text));
  const out: Violation[] = [];
  const add = (job: string, rule: Violation['rule'], detail: string, fix: string): void => {
    out.push({ file, job, rule, detail, fix });
  };

  const triggers = triggerNames(wf['on']);
  const push = asObj(asObj(wf['on'])['push']);
  const isRelease = triggers.includes('push') && push['tags'] !== undefined;

  if (triggers.includes('pull_request_target')) {
    add(
      '-',
      'SEC-16',
      'pull_request_target is forbidden',
      'Remove the trigger. Release workflows start only from a version tag, and no workflow uses pull_request_target.',
    );
  }
  if (isRelease) {
    const top = wf['permissions'];
    const empty = isObj(top) && Object.keys(top).length === 0;
    if (!empty) {
      add(
        '-',
        'SEC-16',
        'top-level permissions must be empty in the release workflow',
        'Set `permissions: {}` at the top and grant each job only what it needs.',
      );
    }
  }

  for (const [name, rawJob] of Object.entries(asObj(wf['jobs']))) {
    const job = asObj(rawJob);
    const idToken = holdsIdToken(job['permissions'] ?? wf['permissions']);
    for (const rawStep of asArr(job['steps'])) {
      const step = asObj(rawStep);
      const uses = str(step['uses']);
      const action = uses.split('@')[0] ?? '';
      const withs = asObj(step['with']);
      const run = str(step['run']);
      if (idToken) {
        const bad = run.split('\n').find((l) => INSTALL_OR_BUILD.test(stripPublish(l)));
        if (bad !== undefined) {
          add(
            name,
            'SEC-21',
            `a job with id-token: write runs "${bad.trim().slice(0, 60)}"`,
            'Move installs, builds and tests to the build job. The job with id-token: write only downloads tarballs and publishes them.',
          );
        }
        if (uses !== '' && !ID_TOKEN_JOB_ALLOWED_ACTIONS.includes(action)) {
          add(
            name,
            'SEC-21',
            `a job with id-token: write uses ${action}, which is not on the allow list`,
            `Use only ${ID_TOKEN_JOB_ALLOWED_ACTIONS.join(' and ')} in that job, or move the step to an earlier job.`,
          );
        }
        if (withs['cache'] === true || withs['package-manager-cache'] === true) {
          add(
            name,
            'SEC-16',
            'a job with id-token: write uses a cache',
            'Turn the cache off in the job that holds id-token: write.',
          );
        }
        if (withs['registry-url'] !== undefined) {
          add(
            name,
            'SEC-15',
            'registry-url makes setup-node set NODE_AUTH_TOKEN, which overrides OIDC',
            'Remove registry-url. npm publishes to the default registry and uses the OIDC token.',
          );
        }
      }
      if (isRelease && (action === 'actions/cache' || withs['cache'] === true)) {
        add(
          name,
          'SEC-16',
          'the release workflow must not use a cache',
          'Remove the cache. A release workflow never restores or saves caches.',
        );
      }
      const env = JSON.stringify(step['env'] ?? {});
      if (env.includes('NODE_AUTH_TOKEN') || env.includes('NPM_TOKEN')) {
        add(
          name,
          'SEC-15',
          'no long-lived npm token',
          'Remove the token. Publishing uses npm trusted publishing (OIDC).',
        );
      }
    }
    if (idToken && job['environment'] === undefined) {
      add(
        name,
        'SEC-16',
        'a job with id-token: write must run in a protected environment',
        'Add `environment: release`, with the maintainer as required reviewer.',
      );
    }
  }
  return out;
}
