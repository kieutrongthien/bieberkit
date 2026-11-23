/**
 * BieberKit
 *
 * @file        packages/auth/src/better-auth.ts
 * @description Better Auth with the fixed options of ADR 0012: the Kysely of the request, UUID ids, the session cookie, the client IP, the limits in the database and no telemetry (AUTH-01, AUTH-04, AUTH-09 to AUTH-11).
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

import { kyselyAdapter } from '@better-auth/kysely-adapter';
import { betterAuth } from 'better-auth';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { magicLink, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { createHash } from 'node:crypto';
import type { Dialect } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import { requestKysely } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { authError } from './errors.ts';
import { accountKey, createRateLimiter, rulesOf } from './limits.ts';
import type { AuthLimits, RateLimiter } from './limits.ts';

export type { AuthLimits, Limit, Limit2 } from './limits.ts';
export type { BetterAuthOptions };

/** What a mail callback gets: the address, the link and the token that the link carries. */
export interface AuthMail {
  readonly to: string;
  readonly url: string;
  readonly token: string;
}

export interface AuthMethods {
  /** TOTP and backup codes, with the second factor that `requireMfa` asks for (AUTH-05). */
  readonly totp?: { readonly issuer: string };
  /** Passkeys. The relying party is the host of the base URL unless `rpId` says another. */
  readonly passkey?: { readonly rpName: string; readonly rpId?: string };
  /** A link by mail that signs the user in. The mail contract is M1.5, so the project says how to send. */
  readonly magicLink?: { send(mail: AuthMail): Promise<void>; readonly expiresIn?: number };
}

export interface CreateAuthOptions {
  readonly db: Database;
  readonly dialect: Dialect;
  /** 32 characters or more. It comes from the validated config, and this function reads no environment (P8). */
  readonly secret: string;
  /** The public URL of the application, such as `https://app.example.com`. */
  readonly baseUrl: string;
  /** Origins that may call the API besides the base URL. */
  readonly trustedOrigins?: readonly string[];
  /** The secrets that were current before, newest first (`APP_KEY_PREVIOUS`). They only decrypt, so a rotation loses nothing. */
  readonly previousSecrets?: readonly string[];
  readonly limits?: AuthLimits;
  /** The sign in methods besides email and password. A method that is not here is not loaded, and needs no table. */
  readonly methods?: AuthMethods;
  /** The mail contract is M1.5, so the project says how to send. Without it the flows that need a mail answer with an error. */
  readonly mail?: {
    sendVerification?(mail: AuthMail): Promise<void>;
    sendResetPassword?(mail: AuthMail): Promise<void>;
  };
}

export type AuthInstance = Auth;

const limiters = new WeakMap<object, RateLimiter>();

const COOKIE_ATTRIBUTES = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

/** The number that names a secret in the envelope of Better Auth: it comes from the secret, so it does not move when the list does. */
const versionOf = (secret: string): number =>
  Number.parseInt(createHash('sha256').update(secret).digest('hex').slice(0, 8), 16);

/** The counters of the limits of an auth instance. `registerAuthRoutes` uses it to count a request that was rolled back. */
export function limiterOf(auth: AuthInstance): RateLimiter | undefined {
  return limiters.get(auth);
}

const bodyEmail = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || !('email' in body)) return undefined;
  return typeof body.email === 'string' && body.email !== '' ? body.email : undefined;
};

function checked(options: CreateAuthOptions): URL {
  if (options.secret.length < 32) {
    throw authError(
      'AUTH_CONFIG_INVALID',
      500,
      'The secret of Better Auth has fewer than 32 characters.',
      'Give a secret of 32 characters or more, from the validated config.',
    );
  }
  try {
    return new URL(options.baseUrl);
  } catch {
    throw authError(
      'AUTH_CONFIG_INVALID',
      500,
      `The base URL "${options.baseUrl}" is not a URL.`,
      'Give the public URL of the application, such as https://app.example.com.',
    );
  }
}

/**
 * Better Auth on the Kysely of the request (ADR 0012). Everything that the ADR fixes is set here and is not an option: the cookie
 * `__Host-bk_session` (and no `useSecureCookies`), the client IP from `x-bk-client-ip` only, UUIDv7 ids, the counters of the limits
 * in the database, and no telemetry (AUTH-01, AUTH-10, AUTH-11).
 */
export function createAuth(options: CreateAuthOptions): AuthInstance {
  const base = checked(options);
  const limiter = createRateLimiter(options.db);
  const rules = rulesOf(options.limits);
  const { mail } = options;
  // The options are typed as `BetterAuthOptions`, so `AuthInstance` is one type for every project (the plugins of slice C add to it).
  const config: BetterAuthOptions = {
    database: kyselyAdapter(requestKysely(options.db), { type: options.dialect, transaction: false }),
    secret: options.secret,
    // Always the envelope with a key id, so that a later rotation can still open what was written now (APP_KEY_PREVIOUS).
    secrets: [options.secret, ...(options.previousSecrets ?? [])].map((value) => ({
      version: versionOf(value),
      value,
    })),
    baseURL: base.origin,
    trustedOrigins: [base.origin, ...(options.trustedOrigins ?? [])],
    telemetry: { enabled: false },
    user: { modelName: 'authUser' },
    session: { modelName: 'authSession' },
    account: { modelName: 'authAccount', fields: { accountId: 'externalId' } },
    verification: { modelName: 'authVerification' },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      ...(mail?.sendResetPassword === undefined
        ? {}
        : {
            sendResetPassword: async ({ user, url, token }: { user: { email: string }; url: string; token: string }) =>
              mail.sendResetPassword?.({ to: user.email, url, token }),
          }),
    },
    ...(mail?.sendVerification === undefined
      ? {}
      : {
          emailVerification: {
            sendVerificationEmail: async ({
              user,
              url,
              token,
            }: {
              user: { email: string };
              url: string;
              token: string;
            }) => mail.sendVerification?.({ to: user.email, url, token }),
          },
        }),
    plugins: [
      ...(options.methods?.totp === undefined
        ? []
        : [twoFactor({ issuer: options.methods.totp.issuer, twoFactorTable: 'authTwoFactor' })]),
      ...(options.methods?.magicLink === undefined
        ? []
        : [
            magicLink({
              // A link does not make an account: an address that has none gets the same answer and no mail.
              disableSignUp: true,
              sendMagicLink: async ({ email, url, token }) => {
                // No mail goes to an address that has no account: the answer is the same, and the form tells nothing.
                const known = await requestKysely(options.db)
                  .selectFrom('authUser')
                  .select('id')
                  .where('email', '=', email.toLowerCase())
                  .executeTakeFirst();
                if (known === undefined) return;
                await options.methods?.magicLink?.send({ to: email, url, token });
              },
              ...(options.methods.magicLink.expiresIn === undefined
                ? {}
                : { expiresIn: options.methods.magicLink.expiresIn }),
            }),
          ]),
      ...(options.methods?.passkey === undefined
        ? []
        : [
            passkey({
              rpID: options.methods.passkey.rpId ?? base.hostname,
              rpName: options.methods.passkey.rpName,
              origin: base.origin,
              schema: { passkey: { modelName: 'authPasskey' } },
            }),
          ]),
    ],
    rateLimit: {
      enabled: true,
      modelName: 'authRateLimit',
      customStorage: limiter.storage,
      customRules: rules.perIp,
    },
    hooks: {
      // The limit of an account. The address of the request is hashed, so the table never holds it in clear text.
      before: createAuthMiddleware(async (context) => {
        const rule = rules.perAccount[context.path];
        const email = bodyEmail(context.body);
        if (rule === undefined || email === undefined) return;
        const result = await limiter.storage.consume(accountKey(context.path, email), rule);
        if (!result.allowed) {
          throw new APIError(
            'TOO_MANY_REQUESTS',
            { message: 'Too many requests. Please try again later.' },
            { 'X-Retry-After': String(result.retryAfter ?? rule.window) },
          );
        }
      }),
    },
    advanced: {
      // Better Auth turns this on by itself for an https base URL, and then the name is `__Secure-__Host-bk_session`, which is not a
      // `__Host-` cookie. The attributes below already make the cookie secure (ADR 0012, decision 6; found with the https base URL).
      useSecureCookies: false,
      database: { generateId: () => uuid7() },
      ipAddress: { ipAddressHeaders: ['x-bk-client-ip'] },
      // Every cookie of Better Auth is a `__Host-` cookie: secure, for this host only, for the whole path (AUTH-01). The names of the
      // second factor are here too, or Better Auth would set `better-auth.two_factor` with no `Secure` and no `__Host-`.
      cookies: Object.fromEntries(
        [
          ['session_token', 'session'],
          ['session_data', 'session_data'],
          ['dont_remember', 'dont_remember'],
          ['two_factor', 'two_factor'],
          ['trust_device', 'trust_device'],
          ['better-auth-passkey', 'passkey_challenge'],
        ].map(([key, name]) => [key, { name: `__Host-bk_${name}`, attributes: COOKIE_ATTRIBUTES }]),
      ),
      // A cookie that Better Auth adds later and that is not named above is still secure and for this host only.
      defaultCookieAttributes: COOKIE_ATTRIBUTES,
    },
  };
  const auth: AuthInstance = betterAuth(config);
  limiters.set(auth, limiter);
  return auth;
}
