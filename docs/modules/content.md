<!--
  BieberKit

  @file        docs/modules/content.md
  @description Module spec of @bieberkit/content: the block format, the checks on it, the element tree, the HTML serializer and the React renderer.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# Content

- Package: `@bieberkit/content`
- Layer: product
- Spec sections: 16.5 (CNT-01, CNT-02, CNT-03, CNT-05)
- Status: Implemented, slice 1 of milestone M2.3. Decision: ADR 0038

## Purpose

The stored form of rich content, the checks on it, and its two outputs: React elements and HTML text. It runs in the browser and on the server.

It does not hold the editor (CNT-04), a field of an entity that stores a document, a way for a plugin to contribute blocks through `definePlugin`, image variants, or any style.

## Public API

```ts
// @bieberkit/content
const CONTENT_VERSION: 1;

createContent(options?: { blocks?: readonly BlockDef[]; embeds?: readonly EmbedProvider[] }): Content;
defineBlock(input: { type: string; schema: SchemaValue; render(data: unknown, tools: BlockTools): ContentNode }): BlockDef;

interface Content {
  parse(input: unknown): ContentDocument;                        // strict, for a write
  blocks(input: unknown, options?: RenderOptions): DrawnBlock[]; // lenient: each valid block and its drawing
  tree(input: unknown, options?: RenderOptions): ContentNode[];  // lenient, for a read
  html(input: unknown, options?: RenderOptions): string;
  mediaIds(input: unknown): string[];                            // each id once, in the order of the document
}

interface RenderOptions {
  media?(id: string): ResolvedImage | undefined; // ResolvedImage: { src, width?, height?, srcset?, sizes? }
  baseUrl?: string;                              // put before addresses that start with `/`, for mail and feeds
  video?: 'embed' | 'link';                      // default `embed`; mail and feeds use `link`
  linkRel?: 'nofollow ugc';                      // added to external links, for text that visitors wrote
  onProblem?(problem: ContentProblem): void;     // ContentProblem: { path, message }
}

type ContentNode = string | { tag: string; attrs?: Record<string, string>; children?: ContentNode[] };
interface DrawnBlock { block: Block; node?: ContentNode }
type EmbedProvider = 'youtube' | 'vimeo';
class ContentError extends BkError { readonly problems: readonly ContentProblem[] }

// @bieberkit/content/react
renderContent(content: Content, input: unknown, options?: RenderOptions & { components?: BlockComponents }): ReactNode;
type BlockComponents = Record<string, (props: { block: Block; children: ReactNode }) => ReactNode>;
```

`BlockTools` gives a custom block `inline(runs)`, which draws text runs as the built-in blocks do.

## Format

A document is `{ version: 1, blocks: Block[] }`. A run of text is `{ text, marks?, href? }`, and a mark is `bold`, `italic`, `strike` or `code`.

| `type`      | Fields                                                                      | Drawn as                                                             |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `paragraph` | `content`                                                                   | `p`                                                                  |
| `heading`   | `level` 2 to 6 (level 1 is the title of the page), `content`                | `h2` to `h6`                                                         |
| `list`      | `ordered`, `items`: `{ content, list?: { ordered, items } }`                | `ul` or `ol` with `li`                                               |
| `quote`     | `content`, `cite?`                                                          | `figure.bk-quote` with `blockquote > p` and `figcaption`             |
| `image`     | `image`, `caption?`                                                         | `figure.bk-image` with `img` and `figcaption`                        |
| `gallery`   | `images`                                                                    | `div.bk-gallery` with one `img` per `figure`                         |
| `video`     | `url`, `title`                                                              | `figure.bk-video` with `iframe`, or a link in `p.bk-video`           |
| `table`     | `header`, `rows`: a list of rows, each a list of cells, each a list of runs | `table` with `thead` and `th scope="col"` when `header`, and `tbody` |
| `cta`       | `label`, `href`, `text?`                                                    | `div.bk-cta` with `p` and `a`                                        |
| `ns.name`   | `data`                                                                      | what the block returns                                               |

An image is `{ alt, src }` or `{ alt, media }`: `src` is an address, `media` is the id (a UUID) of a media record, and an image has exactly one of the two. `alt` may be empty for decoration.

Marks nest in a fixed order, from the outside: `a`, `strong`, `em`, `s`, `code`.

## Behavior

**Format (CNT-01)**

1. `parse` returns the document, or throws `CONTENT_INVALID` with every problem and its path, for example `blocks[2].level`.
2. A `version` other than 1 is `CONTENT_VERSION`.
3. A key that the format does not name is a problem, at every level. A block with a type that is neither built in nor registered is a problem.
4. Limits: 500 blocks; 1 to 500 items in a list, nested at most 3 deep; 20,000 characters in a run and 2,000 in any other text; 1 to 50 images in a gallery; 1 to 200 rows and 1 to 20 cells in a table, every row of the same width. The `title` of a video and the `label` of a call to action are not empty, because they are their accessible names.
5. A custom block has a type `<namespace>.<name>` in lower case, and its `data` passes the schema of its definition. Two definitions with one type, or a type without a dot, throw `CONTENT_BLOCK_INVALID` when the content is made. `parse` keeps `data` as it was sent, and `render` gets it so: a schema that must refuse unknown keys is a strict one. `mediaIds` does not look into the data of a custom block.

**Safety (CNT-03)**

6. A link is `https:`, `http:`, `mailto:` or `tel:`, or starts with one `/`, or with `#`. Anything else is refused, and so is an address with a space, a control character or a backslash. A path that starts with `//` is refused.
7. The address of an image is `https:` or starts with one `/`.
8. A link to an `http:` or `https:` address has `rel="noopener noreferrer"`, followed by `nofollow ugc` when `linkRel` asks. No link has `target`.
9. A video is an `https:` address of YouTube or Vimeo that holds an id of the right form. The address of the frame is built from the id alone: `https://www.youtube-nocookie.com/embed/<id>` or `https://player.vimeo.com/video/<id>?dnt=1`. The frame has `title`, `loading="lazy"`, `sandbox="allow-scripts allow-same-origin allow-presentation"`, `referrerpolicy="strict-origin-when-cross-origin"` and `allowfullscreen`.
10. `embeds` narrows the list of providers. A video of a provider that is not on it is a problem.
11. There is no raw HTML block. Text is always text, in both outputs.
12. The tree of a custom block keeps only the tags `a br blockquote cite code div em figcaption figure h2 h3 h4 h5 h6 hr img li ol p pre s section span strong table tbody td th thead tr ul`, and only these attributes: `class` on any tag; `href` on `a`; `src alt width height loading srcset sizes` on `img`; `colspan rowspan` on `th` and `td`; `scope` on `th`. Another tag is removed with its children, another attribute is removed, and each removal is a problem. Addresses follow rules 6 and 7. An attribute with a refused address is removed, a `srcset` with one refused entry is removed whole, and an `img` left with no `src` is removed. `rel` is what rule 8 gives.

**Reading (CNT-02)**

13. `blocks`, `tree`, `html` and `renderContent` never throw on stored content. A document that is not `version: 1` draws nothing. A block that is not valid, or whose own code throws, draws nothing, and the others are drawn. `onProblem` hears each one.
14. Every address is checked again when it is drawn, whether or not `parse` ran before.
15. An image with `media` is drawn from what `media(id)` returns, whose address and `srcset` follow rule 7: a `srcset` with a refused entry is left out. An image that does not resolve to an allowed address is left out; a gallery with none left draws nothing.
16. An `img` has `loading="lazy"`, and `width` and `height` when they are known.

**HTML (CNT-05)**

17. `html` writes the tree with every text and attribute value escaped. It needs no framework and no DOM.
18. `baseUrl` is put before every address that starts with `/`.
19. With `video: 'link'` a video is a link to the page of the video, with its title as the text.

**React (CNT-02, SITE-14)**

20. `renderContent` draws the same elements, text and attributes as `html`, for every built-in block and every custom block. On the server, React 19 adds a `<link rel="preload">` of its own for an image that is not `loading="lazy"`, which only a custom block can draw.
21. `components` replaces the drawing of a type. It gets the checked block and, as `children`, the default drawing. A block that is not valid reaches no component. A valid block with nothing to draw reaches its component with no `children`.
22. The entry `@bieberkit/content` does not import React.

## Errors

| Code                    | Status | When                                          | Fix                                              |
| ----------------------- | ------ | --------------------------------------------- | ------------------------------------------------ |
| `CONTENT_INVALID`       | 400    | `parse` found a problem                       | Correct the blocks at the paths that are listed. |
| `CONTENT_VERSION`       | 400    | The document is not `version: 1`              | Send a document with `version: 1`.               |
| `CONTENT_BLOCK_INVALID` | 500    | A block definition is wrong or declared twice | Name the block `<namespace>.<name>`, and once.   |

## Configuration

None. The package reads no environment variable.

## Tests

Unit tests in `packages/content/src`, named after their requirement: `parse.test.ts` (rules 1 to 5), `safety.test.ts` (6 to 12), `html.test.ts` (13 to 19) and `react.test.ts` (20 to 22). The React test compares the output of `react-dom/server` with `html`, after both are reduced to elements, attributes and text. No database and no driver. Line coverage at least 80% (TST-01).

## Open questions

None. On 2026-11-27 the maintainer agreed that there is no raw HTML block, and that level 1 headings are refused, so that a page has one `h1`, its title. Content that is imported from elsewhere moves its headings down.
