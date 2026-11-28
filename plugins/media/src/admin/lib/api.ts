/**
 * BieberKit
 *
 * @file        plugins/media/src/admin/lib/api.ts
 * @description The calls of the media library: the record, the signed upload straight to the storage, the confirm, and the address that shows a file (UI-11, ADR 0036).
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

import { AdminApiError } from '@bieberkit/admin-core';
import type { AdminClient } from '@bieberkit/admin-core';
import { uploadName } from './rules.ts';
import type { MediaFile } from './rules.ts';

export interface MediaApi {
  /**
   * Sends a file to the library and answers its record, ready to be named by a field: the record is made, the file goes straight to
   * the storage with the signed URL, and the upload is confirmed (ADR 0036). A disk that cannot sign is an `AdminApiError` with the
   * code `STORAGE_SIGNING_UNSUPPORTED`.
   */
  uploadFile(file: File): Promise<MediaFile>;
  /** The record of a file. */
  mediaFile(id: string): Promise<MediaFile>;
  /** An address that shows the file for a while. */
  mediaUrl(id: string): Promise<string>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

const MEDIA_PATH = '/api/v1/media';

function fileOf(body: unknown): MediaFile {
  const data = isRecord(body) && isRecord(body['data']) ? body['data'] : {};
  return {
    id: text(data['id'], ''),
    filename: text(data['filename'], ''),
    contentType: text(data['contentType'], ''),
    kind: text(data['kind'], ''),
    size: typeof data['size'] === 'number' ? data['size'] : 0,
    status: text(data['status'], ''),
  };
}

/** The calls over the client of the admin. `send` takes the bytes of a file to the storage, which is not the API. */
export function mediaApi(
  client: Pick<AdminClient, 'request'>,
  send: typeof fetch = (input, init) => fetch(input, init),
): MediaApi {
  const record = async (id: string): Promise<MediaFile> =>
    fileOf(await client.request('GET', `${MEDIA_PATH}/${encodeURIComponent(id)}`));
  return {
    async uploadFile(file) {
      const made = fileOf(
        await client.request('POST', MEDIA_PATH, {
          body: {
            filename: uploadName(file.name),
            contentType: file.type === '' ? 'application/octet-stream' : file.type,
            size: file.size,
          },
        }),
      );
      const signed = await client.request('POST', `${MEDIA_PATH}/${encodeURIComponent(made.id)}/upload-url`, {
        body: {},
      });
      const target = isRecord(signed) ? signed : {};
      const headers = isRecord(target['headers'])
        ? Object.fromEntries(Object.entries(target['headers']).map(([key, value]) => [key, text(value, '')]))
        : {};
      // The bytes go to the storage and not to this server, with the headers that were signed and no cookie.
      const sent = await send(text(target['url'], ''), {
        method: text(target['method'], 'PUT'),
        headers,
        body: file,
        credentials: 'omit',
      });
      if (!sent.ok)
        throw new AdminApiError(
          sent.status,
          'ADMIN_UPLOAD_REFUSED',
          'The storage did not take the file.',
          'Try again.',
        );
      await client.request('POST', `${MEDIA_PATH}/${encodeURIComponent(made.id)}/confirm`, { body: {} });
      return record(made.id);
    },
    mediaFile: record,
    async mediaUrl(id) {
      const answer = await client.request('GET', `${MEDIA_PATH}/${encodeURIComponent(id)}/url`);
      return text(isRecord(answer) ? answer['url'] : undefined, '');
    },
  };
}
