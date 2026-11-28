/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/admin/messages/vi.ts
 * @description The Vietnamese texts of the history tab (UI-05).
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

import type { MessageKey } from './en.ts';

export const vi: Readonly<Record<MessageKey, string>> = {
  'audit-log.history': 'Lịch sử',
  'audit-log.none': 'Chưa ghi nhận gì cho dòng này',
  'audit-log.denied': 'Bạn không được xem lịch sử',
};
