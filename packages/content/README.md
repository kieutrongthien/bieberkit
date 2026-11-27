<!--
  BieberKit

  @file        packages/content/README.md
  @description Overview of the @bieberkit/content package.
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

# @bieberkit/content

Rich content as versioned block JSON, with its checks, an HTML serializer and React renderers. The rules are in the [module spec](../../docs/modules/content.md).

```ts
import { createContent } from '@bieberkit/content';
import { renderContent } from '@bieberkit/content/react';

const content = createContent();
const saved = content.parse(body); // for a write: throws ContentError with every problem
const html = content.html(saved, { baseUrl: 'https://example.com', video: 'link' }); // mail and feeds
const nodes = renderContent(content, saved); // admin preview and site
```

- Reading never throws: a block that is not valid is left out, and `onProblem` hears why.
- A link, an image and a video pass an allowlist when written and again when drawn. There is no raw HTML block.
- `defineBlock` adds a block of a plugin or a project. What it draws passes an allowlist of tags and attributes.
- The editor is not part of this package yet.
- Product layer. Workspace dependencies: `@bieberkit/core` (`@bieberkit/core/errors`). React is an optional peer, for the `./react` entry only.

## License

Apache License 2.0. Copyright 2026 Bieber Kieu.
