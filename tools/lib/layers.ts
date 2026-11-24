/**
 * BieberKit
 *
 * @file        tools/lib/layers.ts
 * @description Assigns every workspace package to a layer and lists driver libraries.
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

// Package layer map for PKG-01 to PKG-04 (spec section 4.3). The single place that assigns
// a workspace package to a layer. A new package must be added here before check:layers passes.

export const LAYER_RANK = {
  foundation: 0,
  contracts: 1,
  product: 2,
  tools: 3,
  plugins: 4,
} as const;

export type Layer = keyof typeof LAYER_RANK;

export const PACKAGE_LAYERS: Readonly<Record<string, Layer>> = {
  '@bieberkit/core': 'foundation',

  '@bieberkit/http': 'contracts',
  '@bieberkit/data': 'contracts',
  '@bieberkit/auth': 'contracts',
  '@bieberkit/queue': 'contracts',
  '@bieberkit/cache': 'contracts',
  '@bieberkit/storage': 'contracts',
  '@bieberkit/mail': 'contracts',
  '@bieberkit/search': 'contracts',
  '@bieberkit/log': 'contracts',

  '@bieberkit/admin-core': 'product',
  '@bieberkit/admin-antd': 'product',
  '@bieberkit/tokens': 'product',
  '@bieberkit/content': 'product',
  '@bieberkit/site-kit': 'product',
  '@bieberkit/testing': 'product',
  '@bieberkit/server': 'product',

  '@bieberkit/mcp': 'tools',
  bieberkit: 'tools',
  'create-bieberkit': 'tools',
};

/** Layer for a workspace package name. First-party plugins sit above everything else. */
export function layerOf(name: string): Layer | undefined {
  if (name.startsWith('@bieberkit/plugin-')) return 'plugins';
  return PACKAGE_LAYERS[name];
}

/**
 * Swappable infrastructure libraries (PKG-03). They may be imported only from a contract
 * package's driver adapter folder, `src/adapters/<driver>/`, exported as a subpath such as
 * `@bieberkit/cache/bentocache`.
 */
export const DRIVER_LIBRARIES: readonly string[] = [
  'bullmq',
  'pino',
  'bentocache',
  'flydrive',
  'ioredis',
  'pg',
  'iovalkey',
  'nodemailer',
  'meilisearch',
  'typesense',
  '@aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner',
  '@sentry/node',
];
