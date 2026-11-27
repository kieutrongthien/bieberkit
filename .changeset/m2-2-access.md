---
'@bieberkit/tokens': minor
'@bieberkit/admin-antd': patch
---

<!--
  BieberKit

  @file        .changeset/m2-2-access.md
  @description Changeset for the default colors that read at level AA, and the fixes that axe asked for (UI-07).
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

The default brand colors are darker, so that white text on them and they on a white background read at level AA, and the dark palette has light tones of the same hues with dark text on a filled button. The compiler gives Ant Design a placeholder and a description that read, and `contrastRatio` and `mixColors` are exported. The admin has no violation of WCAG 2.2 AA in the screens that the browser tests open. A brand color that the config sets is still the brand color of both palettes.
