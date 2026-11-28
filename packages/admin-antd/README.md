<!--
  BieberKit

  @file        packages/admin-antd/README.md
  @description Overview of the @bieberkit/admin-antd package.
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

# @bieberkit/admin-antd

The admin on Ant Design, as a library. A project builds its admin from it: `apps/admin` calls `startAdmin(root, { parts })` with the admin parts of its plugins, which `bieberkit/admin-vite` lists from the config. It holds the shell, the generic list and form, the slots of the admin, and what the screens of a plugin use (hooks, slot prop types, shared components). It holds no screen of one plugin. See [writing a plugin](../../docs/guides/writing-a-plugin.md).

- Product layer. Imports contracts and foundation, never tools.
- Workspace dependencies: `@bieberkit/admin-core`, `@bieberkit/tokens`.
- The design is in [the specification](../../docs/spec/SPEC.md), section 16, and in [docs/modules/plugin-admin.md](../../docs/modules/plugin-admin.md).

## License

Apache License 2.0. Copyright 2026 Bieber Kieu.
