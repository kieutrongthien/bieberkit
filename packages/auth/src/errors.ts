/**
 * BieberKit
 *
 * @file        packages/auth/src/errors.ts
 * @description The errors of the auth package. Their codes start with AUTHZ_ and are listed in docs/modules/auth.md (MOD-17).
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

import { BkError } from '@bieberkit/core';

/** An error of authorization. Its code starts with `AUTHZ_`. */
export class AuthzError extends BkError {}

/** Builds an `AuthzError` with the status and the fix text that the module spec lists for its code. */
export function authzError(code: string, status: number, message: string, fix: string): AuthzError {
  return new AuthzError(message, { code, status, fix });
}

/** An error of authentication. Its code starts with `AUTH_`. */
export class AuthError extends BkError {}

/** Builds an `AuthError` with the status and the fix text that the module spec lists for its code. */
export function authError(code: string, status: number, message: string, fix: string): AuthError {
  return new AuthError(message, { code, status, fix });
}
