/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/plugin-steps.ts
 * @description The check rule over the migration steps that plugins ship: a drop or a rename outside a contract step, and on MySQL a step with unguarded DDL (DATA-08, DATA-27).
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

import { findStepRisks } from '@bieberkit/data';
import type { PluginMigrationStep } from '@bieberkit/data';
import { contributed } from '@bieberkit/server';
import type { Rule, Violation } from '../rule.ts';
import { violation } from '../rule.ts';

export const pluginStepsRule: Rule = {
  name: 'plugin-steps',
  summary:
    'Plugin migration steps drop or rename only in a contract step, and guard their DDL on MySQL (DATA-08, DATA-27).',
  run: async ({ app, config }) => {
    const modules = (await app()).modules;
    const steps = contributed<PluginMigrationStep>(modules, 'migrations');
    const found: Violation[] = [];
    for (const risk of findStepRisks(steps)) {
      const plugin = risk.step.slice(0, risk.step.lastIndexOf('/'));
      if (risk.kind === 'destructive-before-contract') {
        found.push(
          violation(
            'plugin-steps',
            'BK_STEP_DESTRUCTIVE',
            plugin,
            1,
            risk.message,
            'Make the step a contract step in a later release, after the release that stops using what it drops (DATA-08).',
          ),
        );
      } else if (risk.kind === 'contract-without-after') {
        found.push(
          violation(
            'plugin-steps',
            'BK_STEP_CONTRACT_NO_AFTER',
            plugin,
            1,
            risk.message,
            'Add after: "<id of the expand step>" to the contract step, so that the migrate role refuses it in the same deploy (DATA-08).',
            'warning',
          ),
        );
      } else if (config.database.dialect === 'mysql') {
        found.push(
          violation(
            'plugin-steps',
            'BK_STEP_MYSQL_UNGUARDED',
            plugin,
            1,
            risk.message,
            'Write each statement with ifNotExists() or ifExists(), so that a step that failed half way can run again (DATA-27).',
            'warning',
          ),
        );
      }
    }
    return found;
  },
};
