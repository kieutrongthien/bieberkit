/**
 * BieberKit
 *
 * @file        packages/server/src/env-owners.test.ts
 * @description Tests of envOwnersOf: the env prefix of a plugin in a project is the one that definePlugin checks, a dash becoming an underscore (CFG-01, ADR 0011).
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

import { expect, it } from 'vitest';
import { definePlugin, env, mergeEnv } from '@bieberkit/core';
import { envOwnersOf } from './project.ts';

it('CFG-01 a plugin whose short name has a dash keeps the prefix that definePlugin checks', () => {
  const def = definePlugin({
    name: '@acme/plugin-audit-trail',
    version: '1.0.0',
    core: '*',
    dialects: ['sqlite'],
    env: { AUDIT_TRAIL_MAX: env.int().default(1) },
  });
  const owners = envOwnersOf({ plugins: [{ def, options: undefined }] });
  expect(owners.map((owner) => owner.prefix)).toEqual(['AUDIT_TRAIL_']);
  expect(() => mergeEnv(owners)).not.toThrow();
});
