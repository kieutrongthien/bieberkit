/**
 * BieberKit
 *
 * @file        tools/lib/release-order.ts
 * @description Decides the order in which the packages of a release are published, and names their tarballs.
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

// Used by tools/release-order.ts. Erasable TypeScript only, so Node.js runs this file directly.

import { LAYER_RANK, layerOf } from './layers.ts';

export interface Pkg {
  name: string;
  version: string;
}

export interface ReleaseEntry extends Pkg {
  /** File name of the tarball that `pnpm pack` writes. */
  file: string;
}

/** `@bieberkit/core` 1.0.0 becomes `bieberkit-core-1.0.0.tgz`, like `pnpm pack`. */
export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
}

/**
 * Foundation first, then contracts, product, tools and plugins, each layer by name. A package that
 * needs a lower layer is therefore already on the registry when it is published (ADR 0014).
 */
export function publishOrder(packages: readonly Pkg[]): ReleaseEntry[] {
  const ranked = packages.map((p) => {
    const layer = layerOf(p.name);
    if (layer === undefined)
      throw new Error(`${p.name} has no layer in tools/lib/layers.ts, so its place in the release order is unknown.`);
    return { p, rank: LAYER_RANK[layer] };
  });
  return ranked
    .toSorted((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => ({ name: p.name, version: p.version, file: tarballName(p.name, p.version) }));
}
