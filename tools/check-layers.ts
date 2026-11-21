/**
 * BieberKit
 *
 * @file        tools/check-layers.ts
 * @description Enforces package layering and driver import rules (PKG-01 to PKG-04).
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

// Enforces package layering (spec section 4.3, PKG-01 to PKG-04) for packages/ and plugins/.
//
// Usage: node tools/check-layers.ts [--json]

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { DRIVER_LIBRARIES, LAYER_RANK, layerOf } from './lib/layers.ts';

interface Violation {
  file: string;
  code: string;
  message: string;
  fix: string;
}

interface Manifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const ROOT = resolve(import.meta.dirname, '..');
const JSON_OUT = process.argv.includes('--json');
const DOCS = 'docs/spec/SPEC.md#43-package-layers';
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/;
const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function rel(p: string): string {
  return relative(ROOT, p).split(sep).join('/');
}

function packageDirs(): string[] {
  const dirs: string[] = [];
  for (const group of ['packages', 'plugins']) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(base, entry.name, 'package.json'))) {
        dirs.push(join(base, entry.name));
      }
    }
  }
  return dirs;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') sourceFiles(full, acc);
    } else if (SOURCE_EXT.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

function main(): void {
  const violations: Violation[] = [];
  const dirs = packageDirs();
  const manifests = new Map<string, { dir: string; manifest: Manifest }>();
  for (const dir of dirs) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
    if (manifest.name) manifests.set(manifest.name, { dir, manifest });
  }

  for (const [name, { dir, manifest }] of manifests) {
    const manifestFile = rel(join(dir, 'package.json'));
    const layer = layerOf(name);
    if (!layer) {
      violations.push({
        file: manifestFile,
        code: 'LAY001',
        message: `${name} has no layer.`,
        fix: 'Add it to PACKAGE_LAYERS in tools/lib/layers.ts.',
      });
      continue;
    }

    const runtimeDeps = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies };
    if (name === '@bieberkit/core' && Object.keys(runtimeDeps).length > 0) {
      violations.push({
        file: manifestFile,
        code: 'LAY003',
        message: '@bieberkit/core must not have runtime dependencies (PKG-04).',
        fix: 'Move the code that needs the dependency into a contract package or an adapter.',
      });
    }

    const declared = new Set([...Object.keys(runtimeDeps), ...Object.keys(manifest.devDependencies ?? {})]);
    for (const dep of declared) {
      const depLayer = layerOf(dep);
      if (depLayer && LAYER_RANK[depLayer] > LAYER_RANK[layer]) {
        violations.push({
          file: manifestFile,
          code: 'LAY002',
          message: `${name} (${layer}) depends on ${dep} (${depLayer}). Imports only point downward (PKG-01).`,
          fix: `Remove the dependency, or move the shared code down into ${name}'s layer or below.`,
        });
      }
    }

    for (const file of sourceFiles(join(dir, 'src'))) {
      const text = readFileSync(file, 'utf8');
      const fileRel = rel(file);
      const inAdapter = fileRel.includes('/src/adapters/');
      for (const match of text.matchAll(IMPORT_RE)) {
        const spec = match[1] ?? match[2];
        if (!spec || spec.startsWith('node:')) continue;
        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec);
          if (!target.startsWith(dir + sep)) {
            violations.push({
              file: fileRel,
              code: 'LAY006',
              message: `Relative import "${spec}" leaves the package.`,
              fix: 'Import the other package by name through its public exports.',
            });
          }
          continue;
        }
        const target = packageNameOf(spec);
        if (target === name) continue;
        if (layerOf(target) && !declared.has(target)) {
          violations.push({
            file: fileRel,
            code: 'LAY004',
            message: `Imports ${target}, which is not declared in ${manifestFile}.`,
            fix: `Add "${target}": "workspace:*" to dependencies, if the layer rules allow it.`,
          });
        }
        if (/\/(?:src|dist)\//.test(spec) && layerOf(target)) {
          violations.push({
            file: fileRel,
            code: 'LAY006',
            message: `Imports internals of ${target} ("${spec}").`,
            fix: 'Use the package entry or a documented subpath export.',
          });
        }
        if (DRIVER_LIBRARIES.includes(target) && !inAdapter) {
          violations.push({
            file: fileRel,
            code: 'LAY005',
            message: `Driver library ${target} imported outside a driver adapter (PKG-03).`,
            fix: 'Move this code to src/adapters/<driver>/ and export it as a subpath.',
          });
        }
      }
    }
  }

  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify({ ok: violations.length === 0, violations, docs: DOCS }, null, 2)}\n`);
  } else if (violations.length === 0) {
    process.stdout.write(`check:layers ok (${manifests.size} packages)\n`);
  } else {
    for (const v of violations) process.stderr.write(`${v.file}  ${v.code}  ${v.message}\n    Fix: ${v.fix}\n`);
    process.stderr.write(`\n${violations.length} layer problem(s). Rules: ${DOCS}\n`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

main();
