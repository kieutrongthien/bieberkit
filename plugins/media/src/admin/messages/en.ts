/**
 * BieberKit
 *
 * @file        plugins/media/src/admin/messages/en.ts
 * @description The English texts of the control of a file (UI-05).
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
  'media.file.type': 'This file is not of a type that the field takes: {types}',
  'media.file.empty': 'The file is empty',
  'media.file.noSigning': 'The storage cannot take an upload from the browser. Use an S3 disk for files.',
  'media.file.failed': 'The file could not be sent',
  'media.file.sending': 'Sending',
  'media.file.remove': 'Remove',
  'media.file.removeNamed': 'Remove the file of {name}',
} as const;

export type MessageKey = keyof typeof en;
