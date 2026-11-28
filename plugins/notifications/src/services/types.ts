/**
 * BieberKit
 *
 * @file        plugins/notifications/src/services/types.ts
 * @description What the notifier takes and gives.
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

export type Level = 'info' | 'success' | 'warning' | 'error';

export type Channel = 'in-app' | 'mail';

export interface SendInput {
  /** A user id, up to 100 user ids, or the holders of a role in a tenant (the request's, or the nil tenant). */
  readonly to: string | readonly string[] | { readonly role: string; readonly tenantId?: string };
  readonly title: string;
  readonly body?: string;
  readonly level?: Level;
  /** Lower case, for preferences and filters. Defaults to `general`. */
  readonly category?: string;
  readonly link?: string;
  readonly data?: unknown;
  /** Defaults to `in-app`. */
  readonly channels?: readonly Channel[];
  /** A second send with the same key to the same user does nothing (NTF-02). */
  readonly dedupeKey?: string;
  readonly expiresAt?: Date;
}

export interface SendResult {
  readonly created: number;
  /** True when a role was too large to send now: a job sends after commit (NTF-01). */
  readonly queued: boolean;
}

export interface Notifier {
  send(input: SendInput): Promise<SendResult>;
}
