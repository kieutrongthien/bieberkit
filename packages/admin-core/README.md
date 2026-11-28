<!--
  BieberKit

  @file        packages/admin-core/README.md
  @description Overview of the @bieberkit/admin-core package.
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

# @bieberkit/admin-core

The headless admin, with no dependency: the client of the API, the logic of the generic screens, the menu and the languages, and the contract of the admin part of a plugin (`defineAdminPlugin`, `composeAdmin`). It holds nothing of one plugin.

- Product layer. Imports contracts and foundation, never tools.
- Workspace dependencies: none.
- The design is in [the specification](../../docs/spec/SPEC.md), section 16, and in [docs/modules/plugin-admin.md](../../docs/modules/plugin-admin.md).

## License

Apache License 2.0. Copyright 2026 Bieber Kieu.
