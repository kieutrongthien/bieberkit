/**
 * BieberKit
 *
 * @file        packages/auth/src/testing/webauthn.ts
 * @description Test helper: a software authenticator that makes the registration and the sign in of a passkey, so the ceremony runs with no browser.
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

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string): Buffer => createHash('sha256').update(data).digest();

/** The CBOR of the few shapes that a passkey needs: a map, a text, a negative or small integer, and bytes. */
const bytes = (data: Uint8Array): Buffer => {
  const head = data.length < 24 ? Buffer.from([0x40 + data.length]) : Buffer.from([0x58, data.length]);
  return Buffer.concat([head, data]);
};
const text = (value: string): Buffer => Buffer.concat([Buffer.from([0x60 + value.length]), Buffer.from(value)]);

export interface PasskeyOptions {
  readonly challenge: string;
  readonly rp?: { readonly id?: string };
  readonly rpId?: string;
}

export interface CredentialResponse {
  readonly id: string;
  readonly rawId: string;
  readonly type: 'public-key';
  readonly clientExtensionResults: Record<string, never>;
  readonly response: Record<string, string | string[]>;
}

/** A passkey that lives in memory: one key pair and a counter. */
export class VirtualAuthenticator {
  readonly credentialId: Buffer = randomBytes(32);
  readonly #key: { privateKey: KeyObject; publicKey: KeyObject };
  readonly #rpId: string;
  readonly #origin: string;
  #counter = 0;

  constructor(rpId: string, origin: string) {
    this.#rpId = rpId;
    this.#origin = origin;
    this.#key = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  }

  /** The answer to `navigator.credentials.create` for the options that the server gave. */
  register(options: PasskeyOptions): CredentialResponse {
    const clientData = JSON.stringify({
      type: 'webauthn.create',
      challenge: options.challenge,
      origin: this.#origin,
      crossOrigin: false,
    });
    const jwk = this.#key.publicKey.export({ format: 'jwk' });
    const x = Buffer.from(String(jwk.x), 'base64url');
    const y = Buffer.from(String(jwk.y), 'base64url');
    // COSE key of an ES256 key: kty 2 (EC2), alg -7, crv 1 (P-256), x, y.
    const cose = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]),
      bytes(x),
      Buffer.from([0x22]),
      bytes(y),
    ]);
    const authData = Buffer.concat([
      sha256(this.#rpId),
      Buffer.from([0x45]), // user present, user verified, attested credential data
      Buffer.alloc(4),
      Buffer.alloc(16),
      Buffer.from([this.credentialId.length >> 8, this.credentialId.length & 0xff]),
      this.credentialId,
      cose,
    ]);
    const attestation = Buffer.concat([
      Buffer.from([0xa3]),
      text('fmt'),
      text('none'),
      text('attStmt'),
      Buffer.from([0xa0]),
      text('authData'),
      bytes(authData),
    ]);
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(Buffer.from(clientData)),
        attestationObject: b64u(attestation),
        transports: ['internal'],
      },
    };
  }

  /** The answer to `navigator.credentials.get`. The counter goes up by one each time. */
  authenticate(options: PasskeyOptions): CredentialResponse {
    this.#counter += 1;
    const clientData = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: this.#origin, crossOrigin: false }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.#counter);
    const authData = Buffer.concat([sha256(this.#rpId), Buffer.from([0x05]), count]);
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), this.#key.privateKey);
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientData),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
      },
    };
  }
}
