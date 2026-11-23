/**
 * BieberKit
 *
 * @file        packages/auth/src/authenticator.ts
 * @description The authenticator of the HTTP server: the session cookie of Better Auth becomes the principal of a request (AUTH-01, AUTH-02).
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

import type { Authenticator } from '@bieberkit/http';
import type { AuthInstance } from './better-auth.ts';

const COOKIE = '__Host-bk_session';

/**
 * Reads the session cookie with Better Auth and gives the principal. A missing, forged, expired or revoked session is no principal.
 * A cookie that is not there costs no query, so a public page does not touch the database. Only the cookie is read: a token in
 * `Authorization` belongs to the API keys of another slice (AUTH-07).
 */
export function createAuthenticator(auth: AuthInstance): Authenticator {
  return {
    async authenticate(request) {
      const header = request.headers['cookie'];
      const cookie = Array.isArray(header) ? header.join('; ') : header;
      if (cookie === undefined || !cookie.includes(`${COOKIE}=`)) return undefined;
      const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
      if (session === null) return undefined;
      return { id: session.user.id, kind: 'user', via: 'cookie', sessionId: session.session.id };
    },
  };
}
