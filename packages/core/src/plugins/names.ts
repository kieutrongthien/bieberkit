/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/names.ts
 * @description How a plugin's npm name gives its short name, env prefix and permission prefix (spec 11.2, ADR 0011).
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

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** Whether `name` is a valid npm package name for a plugin. */
export function isPluginName(name: string): boolean {
  return NPM_NAME.test(name);
}

/** `@bieberkit/plugin-seo`, `bieberkit-plugin-seo` and `@acme/plugin-seo` all give `seo`. */
export function shortNameOf(name: string): string {
  const unscoped = name.replace(/^@[^/]+\//, '');
  return unscoped.replace(/^bieberkit-plugin-/, '').replace(/^plugin-/, '');
}

/** `audit-log` gives `AUDIT_LOG_`. Every env key of the plugin starts with it. */
export function envPrefixOf(name: string): string {
  return `${shortNameOf(name).toUpperCase().replaceAll('-', '_')}_`;
}

/** `audit-log` gives `audit-log.`. Every permission of the plugin starts with it. */
export function permissionPrefixOf(name: string): string {
  return `${shortNameOf(name)}.`;
}
