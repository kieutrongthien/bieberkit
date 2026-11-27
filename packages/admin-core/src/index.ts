/**
 * BieberKit
 *
 * @file        packages/admin-core/src/index.ts
 * @description Public entry point of @bieberkit/admin-core.
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

// Public API of @bieberkit/admin-core: headless, with no dependency (ADR 0025). The screens are in an adapter such as @bieberkit/admin-antd (UI-10).

/** npm name of this package. */
export const packageName = '@bieberkit/admin-core';

export { AdminApiError, createAdminClient } from './client.ts';
export type { AdminClient, AdminClientOptions, FieldProblem } from './client.ts';
export {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  LOCALES,
  localeOf,
  MESSAGES,
  translator,
} from './i18n.ts';
export type { Locale, MessageKey } from './i18n.ts';
export { allows, bodyOf, columnsOf, formFieldsOf, initialValues, labelOf, listFields } from './screens.ts';
export type { ListParams, Meta, MetaEntity, MetaField, MetaMenuItem, Page, Row, SessionUser } from './types.ts';
export { backoffMs, chunkReload, connection, isChunkError, isNetworkFailure, shouldRetry } from './resilience.ts';
export type { Connection, ConnectionEvent } from './resilience.ts';
export { clearDraft, draftKey, isDirty, loadDraft, reapply, saveDraft } from './drafts.ts';
export type { Conflict, DraftStorage } from './drafts.ts';
export { shortcutOf } from './shortcuts.ts';
export type { KeyPress, Shortcut } from './shortcuts.ts';
export { errorReport, routeShape, sampled, vitalReport } from './reporting.ts';
export type { ErrorReport, Vital, VitalReport } from './reporting.ts';
