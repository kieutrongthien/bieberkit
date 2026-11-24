/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/routes.ts
 * @description Rule routes: every route has a permission or says that it is public (API-02, section 5.2).
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

import type { Rule } from '../rule.ts';
import { violation } from '../rule.ts';

export const routesRule: Rule = {
  name: 'routes',
  summary: 'Every route needs a permission, or public: true (API-02).',
  async run({ app }) {
    try {
      return (await app()).routes
        .filter((route) => route.permission === undefined && route.public !== true)
        .map((route) =>
          violation(
            'routes',
            'BK_ROUTE_NO_PERMISSION',
            'routes',
            1,
            `${route.method} ${route.url} has no permission and is not public.`,
            'Give the route permission: "<module>.<resource>.<action>", or public: true if anyone may call it.',
          ),
        );
    } catch (error) {
      return [
        violation(
          'routes',
          'BK_APP_UNLOADABLE',
          'bieberkit.config.ts',
          1,
          `The application cannot be loaded: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          'Run bieberkit plugins to see the problem, and fix it.',
        ),
      ];
    }
  },
};
