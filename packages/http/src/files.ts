/**
 * BieberKit
 *
 * @file        packages/http/src/files.ts
 * @description The files of a record: a field made with `f.file` or `f.image` holds the id of a media record, and a write checks that the file exists, is uploaded and is of a type that the field takes (UI-11, ADR 0036).
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

import { apiFields } from '@bieberkit/data/schema';
import type { EntityDef } from '@bieberkit/data/schema';
import { HttpError, ValidationFailed } from './problem.ts';
import type { RouteContext } from './route.ts';

type Row = Record<string, unknown>;

/** What a record needs of the media service that the media plugin registers as `media`. */
interface MediaReader {
  get(id: string): Promise<{ readonly status: string; readonly contentType: string }>;
}

const isMediaReader = (value: unknown): value is MediaReader =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'get') === 'function';

/** The media service, or `undefined` when the container has none or is not ready to answer: a record with no file never asks. */
function mediaOf(ctx: RouteContext): MediaReader | undefined {
  try {
    const found: unknown = Reflect.get(ctx.services, 'media');
    return isMediaReader(found) ? found : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a media type is one of the patterns of a field: `image/*` takes any image, and an exact type takes itself. */
export function acceptsType(accept: readonly string[], contentType: string): boolean {
  if (accept.length === 0) return true;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return accept.some((pattern) => (pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern));
}

/** The fields of `def` that hold a file, by the key of the API, with the types that each takes. */
export function fileFieldsOf(def: EntityDef<string>): readonly { key: string; accept: readonly string[] }[] {
  return apiFields(def).flatMap((field) => {
    const widget = field.def.admin?.widget;
    return widget === 'file' || widget === 'image' ? [{ key: field.key, accept: field.def.admin?.accept ?? [] }] : [];
  });
}

/**
 * Checks the files that a write names, before the write opens its transaction (the media service has its own). A value that is not
 * `null` must be the id of a file of this tenant that has been uploaded and confirmed, of a type that the field takes. It is the media
 * plugin that knows the files, so a record that names one when the plugin is not installed is refused as a server problem.
 */
export async function checkFiles(def: EntityDef<string>, ctx: RouteContext, body: Readonly<Row>): Promise<void> {
  const given = fileFieldsOf(def).flatMap((field) => {
    const id = body[field.key];
    return typeof id === 'string' ? [{ ...field, id }] : [];
  });
  if (given.length === 0) return;
  const media = mediaOf(ctx);
  if (media === undefined) {
    throw new HttpError(
      'HTTP_MEDIA_MISSING',
      500,
      'This record has a file, and no media service is installed.',
      'Install and enable @bieberkit/plugin-media, or take the file field out of the entity.',
    );
  }
  const issues: { path: string; keyword: string; message: string }[] = [];
  for (const file of given) {
    try {
      const found = await media.get(file.id);
      if (found.status !== 'ready')
        issues.push({ path: `body.${file.key}`, keyword: 'file', message: 'is a file that was not uploaded' });
      else if (!acceptsType(file.accept, found.contentType))
        issues.push({
          path: `body.${file.key}`,
          keyword: 'accept',
          message: `is ${found.contentType}, and this field takes ${file.accept.join(', ')}`,
        });
    } catch (error) {
      // A file that is not there, or that is not of this tenant, is the same to the caller: it is not a file that they may use.
      if (error instanceof HttpError && error.status !== 404 && error.status !== 403) throw error;
      issues.push({ path: `body.${file.key}`, keyword: 'file', message: 'is not a file that you may use' });
    }
  }
  if (issues.length > 0) throw new ValidationFailed(issues);
}
