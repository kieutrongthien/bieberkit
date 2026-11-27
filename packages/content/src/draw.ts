/**
 * BieberKit
 *
 * @file        packages/content/src/draw.ts
 * @description The element tree of one checked block, from which both outputs are made (CNT-02).
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

import { anchor, element, inline } from './elements.ts';
import { sanitize } from './sanitize.ts';
import type {
  BlockDef,
  BuiltInBlock,
  ContentElement,
  ContentNode,
  ImageRef,
  ListBody,
  RenderOptions,
  ResolvedImage,
  TableBlock,
} from './types.ts';
import { isSafeImage, parseSrcset } from './urls.ts';
import { embedUrl, pageUrl, parseVideo } from './video.ts';

type Report = (path: string, message: string) => void;

interface Drawing {
  readonly options: RenderOptions;
  /** Where the block is, for a problem. */
  readonly path: string;
  readonly report: Report;
}

const size = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value > 0;

/** The `img` of a reference. `undefined` when its media record does not resolve to an allowed address. */
function picture(image: ImageRef, path: string, { options, report }: Drawing): ContentElement | undefined {
  const found: ResolvedImage | undefined = 'media' in image ? options.media?.(image.media) : { src: image.src };
  if (found === undefined || !isSafeImage(found.src)) {
    report(path, 'The media record does not resolve to an image.');
    return undefined;
  }
  const { src, width, height, srcset, sizes } = found;
  const variants = srcset === undefined || parseSrcset(srcset) === undefined ? undefined : srcset;
  return element('img', undefined, {
    src,
    alt: image.alt,
    ...(size(width) ? { width: String(width) } : {}),
    ...(size(height) ? { height: String(height) } : {}),
    ...(variants === undefined ? {} : { srcset: variants }),
    ...(variants === undefined || sizes === undefined ? {} : { sizes }),
    loading: 'lazy',
  });
}

const figcaption = (text: string | undefined): ContentElement[] =>
  text === undefined || text === '' ? [] : [element('figcaption', [text])];

function listOf(body: ListBody, options: RenderOptions): ContentElement {
  return element(
    body.ordered ? 'ol' : 'ul',
    body.items.map((item) =>
      element('li', [
        ...inline(item.content, options),
        ...(item.list === undefined ? [] : [listOf(item.list, options)]),
      ]),
    ),
  );
}

export function drawBuiltIn(block: BuiltInBlock, drawing: Drawing): ContentNode | undefined {
  const { options, path } = drawing;
  switch (block.type) {
    case 'paragraph':
      return element('p', inline(block.content, options));
    case 'heading':
      return element(`h${block.level}`, inline(block.content, options));
    case 'list':
      return listOf(block, options);
    case 'quote':
      return element(
        'figure',
        [element('blockquote', [element('p', inline(block.content, options))]), ...figcaption(block.cite)],
        { class: 'bk-quote' },
      );
    case 'image': {
      const img = picture(block.image, `${path}.image`, drawing);
      return img === undefined
        ? undefined
        : element('figure', [img, ...figcaption(block.caption)], { class: 'bk-image' });
    }
    case 'gallery': {
      const figures = block.images.flatMap((image, index) => {
        const img = picture(image, `${path}.images[${index}]`, drawing);
        return img === undefined ? [] : [element('figure', [img])];
      });
      return figures.length === 0 ? undefined : element('div', figures, { class: 'bk-gallery' });
    }
    case 'video': {
      const video = parseVideo(block.url);
      if (video === undefined) return undefined;
      if (options.video === 'link')
        return element('p', [anchor(pageUrl(video), [block.title], options)], { class: 'bk-video' });
      const frame = element('iframe', [], {
        src: embedUrl(video),
        title: block.title,
        loading: 'lazy',
        sandbox: 'allow-scripts allow-same-origin allow-presentation',
        referrerpolicy: 'strict-origin-when-cross-origin',
        allowfullscreen: '',
      });
      return element('figure', [frame], { class: 'bk-video' });
    }
    case 'table': {
      const row = (cells: TableBlock['rows'][number], tag: 'th' | 'td'): ContentElement =>
        element(
          'tr',
          cells.map((cell) => element(tag, inline(cell, options), tag === 'th' ? { scope: 'col' } : undefined)),
        );
      const head = block.header ? block.rows.slice(0, 1) : [];
      const body = block.rows.slice(head.length);
      return element('table', [
        ...(head.length === 0
          ? []
          : [
              element(
                'thead',
                head.map((cells) => row(cells, 'th')),
              ),
            ]),
        ...(body.length === 0
          ? []
          : [
              element(
                'tbody',
                body.map((cells) => row(cells, 'td')),
              ),
            ]),
      ]);
    }
    case 'cta':
      return element(
        'div',
        [
          ...(block.text === undefined || block.text === '' ? [] : [element('p', [block.text])]),
          anchor(block.href, [block.label], options),
        ],
        { class: 'bk-cta' },
      );
    default: {
      const unknown: never = block;
      return unknown;
    }
  }
}

export function drawCustom(definition: BlockDef, data: unknown, drawing: Drawing): ContentNode | undefined {
  const tree = definition.render(data, { inline: (runs) => inline(runs, drawing.options) });
  return sanitize(tree, drawing.options, (message) => drawing.report(drawing.path, message));
}
