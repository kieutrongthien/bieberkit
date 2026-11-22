/**
 * BieberKit
 *
 * @file        packages/core/src/container/augmentation.test.ts
 * @description Checks that a package extends ServiceRegistry through the entry of @bieberkit/core, which is how every other package will do it.
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
import { createContainer } from '../index.ts';

declare module '../index.ts' {
  interface ServiceRegistry {
    widget: { size: number };
  }
}

it('CORE-03 a package adds its services to ServiceRegistry through the package entry', async () => {
  const container = createContainer();
  container.register('widget', { scope: 'singleton', create: () => ({ size: 3 }) });
  await container.boot();
  const size: number = container.services.widget.size;
  expect(size).toBe(3);
});
