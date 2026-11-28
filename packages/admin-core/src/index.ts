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
export type { AdminClient, AdminClientOptions, FieldProblem, RequestInput, SignInResult } from './client.ts';
export { defineAdminPlugin, shortNameOf } from './part.ts';
export type {
  AdminPart,
  AdminPartInput,
  Contribution,
  GateState,
  Load,
  MenuContribution,
  PageContribution,
  Texts,
} from './part.ts';
export { allowed, composeAdmin, messageProblems } from './compose.ts';
export type { AdminProblem, AdminRegistry, Owned } from './compose.ts';
export type { AccountClient, AdminSession, CodeKind, Me, TotpEnrolment } from './account-client.ts';
export {
  authMessageKey,
  deviceOf,
  enrolmentNeeded,
  normalizeCode,
  PASSWORD_ADVISED,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordIsShort,
  passwordProblem,
  resetSearchOf,
  secretOfUri,
  stepExpired,
} from './account.ts';
export type { ResetSearch } from './account.ts';
export {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  LOCALES,
  localeOf,
  loadMessages,
  translator,
} from './i18n.ts';
export { en as ENGLISH } from './messages/en.ts';
export type { Dictionary, Locale, MessageKey } from './i18n.ts';
export {
  allows,
  bodyOf,
  columnsOf,
  formFieldsOf,
  includeOf,
  initialValues,
  labelOf,
  listFields,
  relationLabel,
  titleOf,
} from './screens.ts';
export type {
  BulkOperation,
  BulkResult,
  ListParams,
  Meta,
  MetaEntity,
  MetaExtensions,
  MetaField,
  MetaInline,
  MetaLabel,
  MetaPage,
  MetaScreen,
  MetaWidget,
  MetaMenuItem,
  MetaTransition,
  When,
  Page,
  Row,
  SessionUser,
} from './types.ts';
export { backoffMs, chunkReload, connection, isChunkError, isNetworkFailure, shouldRetry } from './resilience.ts';
export type { Connection, ConnectionEvent } from './resilience.ts';
export { clearDraft, draftKey, isDirty, loadDraft, reapply, saveDraft } from './drafts.ts';
export type { Conflict, DraftStorage } from './drafts.ts';
export { shortcutOf } from './shortcuts.ts';
export type { KeyPress, Shortcut } from './shortcuts.ts';
export { dedupe, errorReport, ratingOf, routeShape, sampled, vitalReport } from './reporting.ts';
export type { ErrorReport, Vital, VitalReport } from './reporting.ts';
export {
  bulkSummary,
  csvOf,
  deleteView,
  exportPages,
  filterParams,
  filterProblem,
  loadViews,
  operatorsOf,
  PAGE_SIZES,
  sameView,
  shouldVirtualize,
  saveView,
  viewFromSearch,
  viewsKey,
  viewToSearch,
} from './lists.ts';
export type { BulkOutcome, CsvColumn, Filter, FilterOperator, SavedView } from './lists.ts';
export {
  commonTransitions,
  inputFieldsOf,
  patchRow,
  stateKeyOf,
  transitionPatch,
  transitionsFor,
} from './transitions.ts';
export { problemOf } from './validation.ts';
export { conditionalFields, evaluateWhen, isUnset, statesOf, visibleValues } from './when.ts';
export type { FieldStates } from './when.ts';
export type { ValueProblem } from './validation.ts';
export {
  historyLine,
  historyOf,
  historyQuery,
  HISTORY_PATH,
  prefillOf,
  readOnlyOf,
  relatedDefaults,
  relatedFilter,
  relatedOf,
} from './related.ts';
export type { HistoryEntry, Related } from './related.ts';
export { editableInline, initialLines, lineProblems, linesBody, linesChanged, MAX_LINES, newLine } from './inline.ts';
export type { Line } from './inline.ts';
export { acceptAttribute, acceptsType, fileProblem, isPicture, sizeText, uploadName } from './files.ts';
export type { MediaFile } from './files.ts';
export { extensionsOf, fieldWidgetFor, labelText, moduleSrc, pageFor, screenFor, widgetsIn } from './extensions.ts';
export type { AdminHost } from './extensions.ts';
export { adminSection, BUILTIN_MENU_GROUPS, parseAdminSettings, readAdminSettings } from './settings.ts';
export type { AdminSettings, BrandSettings, MenuGroupSettings } from './settings.ts';
export { currentEntry, DEFAULT_MENU, menuOf, searchMenu } from './menu.ts';
export type { MenuEntry, MenuGroup } from './menu.ts';
