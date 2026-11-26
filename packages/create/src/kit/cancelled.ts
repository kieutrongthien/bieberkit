/**
 * BieberKit
 *
 * @file        packages/create/src/kit/cancelled.ts
 * @description The error of a prompt that the person cancelled, shared by the terminal prompts and their scripted double (ADR 0029).
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

import { CliError } from './errors.ts';

/** The person pressed Ctrl+C or Esc. Nothing has been written, because a command asks before it writes. */
export const cancelled = (): CliError =>
  new CliError('Cancelled.', { code: 'BK_CANCELLED', fix: 'Run the command again.' });
