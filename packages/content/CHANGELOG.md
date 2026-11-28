<!--
  BieberKit

  @file        packages/content/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/content.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm changeset version (license header normalized)
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

## 0.4.0

### Minor Changes

- e9e15e8: `@bieberkit/content` has its first API (CNT-01 to CNT-03, CNT-05, ADR 0038): rich content as `{ version: 1, blocks }`, checked by `parse`, drawn as HTML by `html` and as React elements by `renderContent` of `@bieberkit/content/react`, with an allowlist for links, images, videos and the blocks that `defineBlock` adds. `@bieberkit/core` has the subpath `@bieberkit/core/errors`, which a browser bundle can import.

### Patch Changes

- Updated dependencies [e9e15e8]
  - @bieberkit/core@0.4.0

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.
