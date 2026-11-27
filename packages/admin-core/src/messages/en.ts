/**
 * BieberKit
 *
 * @file        packages/admin-core/src/messages/en.ts
 * @description The English dictionary of the admin: the one that is always in the bundle, and the one that the others are checked against (UI-05).
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

export const en = {
  'app.name': 'Admin',
  'language.label': 'Language',
  'auth.signIn.title': 'Sign in',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signOut': 'Sign out',
  'auth.noAnswer': 'The server did not answer. Try again.',
  'welcome.title': 'Welcome',
  'welcome.empty': 'Nothing here is open to you yet. Ask an administrator for a role.',
  'gate.menuError': 'The menu could not be loaded',
  'gate.noAnswer': 'The server did not answer',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'list.new': 'New',
  'list.deleted': 'Deleted',
  'list.notDeleted': 'The row was not deleted',
  'list.confirmDelete': 'Delete this row?',
  'list.loadError': 'The list could not be loaded',
  'list.missing': 'This screen does not exist, or it is not open to you.',
  'list.filter': 'Filter',
  'list.filterField': 'Field',
  'list.filterOp': 'Condition',
  'list.filterValue': 'Value',
  'list.filterAdd': 'Add filter',
  'list.filterClear': 'Clear filters',
  'list.filterNull': 'Empty or not',
  'list.views': 'Saved views',
  'list.viewName': 'Name of the view',
  'list.viewSave': 'Save view',
  'list.viewDelete': 'Delete view',
  'list.viewSaved': 'View saved',
  'list.selected': '{count} selected',
  'list.deleteSelected': 'Delete selected',
  'list.confirmDeleteMany': 'Delete {count} rows?',
  'list.bulkDone': '{count} rows done',
  'list.bulkFailed': '{count} rows were not changed: {why}',
  'list.bulkQueued': 'This is a large change. It runs in the background.',
  'list.export': 'Export CSV',
  'list.exportTruncated': 'The file holds the first {limit} rows only. Narrow the filters to get the rest.',
  'list.exportError': 'The export failed',
  'list.moves': 'Move to',
  'list.moved': '{name} done',
  'list.notMoved': 'The move was not made',
  'list.setField': 'Change a field',
  'list.apply': 'Apply',
  'list.notChanged': 'The rows were not changed',
  'list.selectRow': 'Select {name}',
  'list.sort': 'Sort by',
  'detail.details': 'Details',
  'detail.history': 'History',
  'detail.newRelated': 'New {name}',
  'detail.noRelated': 'Nothing yet',
  'detail.noHistory': 'Nothing was recorded for this row',
  'detail.historyDenied': 'The history is not open to you',
  'detail.computed': 'Filled in by the server',
  'relation.search': 'Type to search',
  'relation.pick': 'Pick one',
  'relation.none': 'Nothing found',
  'lines.invalid': 'Some lines are not valid',
  'lines.none': 'No lines yet',
  'lines.add': 'Add {name}',
  'lines.remove': 'Remove',
  'lines.removeLine': 'Remove {name}',
  'list.op.eq': 'is',
  'list.op.ne': 'is not',
  'list.op.in': 'is one of',
  'list.op.lt': 'is less than',
  'list.op.lte': 'is at most',
  'list.op.gt': 'is more than',
  'list.op.gte': 'is at least',
  'list.op.null': 'is empty',
  'form.saved': 'Saved',
  'form.notSaved': 'The row was not saved',
  'form.edit': 'Edit {name}',
  'form.new': 'New {name}',
  'form.save': 'Save',
  'problem.required': 'This field is required',
  'problem.tooShort': 'At least {min} characters',
  'problem.tooLong': 'At most {max} characters',
  'problem.tooSmall': 'At least {min}',
  'problem.tooBig': 'At most {max}',
  'problem.pattern': 'The value is not in the form that is expected',
  'form.conflictTitle': 'Someone else changed this row',
  'form.conflictBody': 'Reload the page to see the new version, then make your change again.',
  'form.rowLoadError': 'The row could not be loaded',
  'form.missing': 'This screen does not exist.',
  'shell.offline': 'You are offline. Changes are not saved until the connection is back.',
  'error.title': 'Something went wrong',
  'error.retry': 'Try again',
  'error.updated': 'The application was updated. Reload the page to continue.',
  'error.reload': 'Reload',
  'form.leave': 'You have unsaved changes. Leave this page?',
  'form.draftFound': 'A draft of this form was found on this browser.',
  'form.draftRestore': 'Restore the draft',
  'form.draftDiscard': 'Discard it',
  'conflict.changedBy': 'Changed by {who} on {when}',
  'conflict.unknownUser': 'another user',
  'conflict.field': 'Field',
  'conflict.mine': 'Your value',
  'conflict.theirs': 'Their value',
  'conflict.keepMine': 'Keep my changes on top of theirs',
  'conflict.takeTheirs': 'Discard mine and take theirs',
} as const;

export type MessageKey = keyof typeof en;
export type Dictionary = Readonly<Record<MessageKey, string>>;
