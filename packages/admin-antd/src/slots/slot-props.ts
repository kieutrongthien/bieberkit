/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/slots/slot-props.ts
 * @description What the shell gives to the component of each slot that takes something (UI-35, UI-38).
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

import type { MetaEntity, MetaField, Row } from '@bieberkit/admin-core';

/** Slot 5: a tab of the detail of a record. */
export interface RecordTabProps {
  readonly entity: MetaEntity;
  readonly id: string;
  /** The record as it was read. */
  readonly row: Row | undefined;
}

/** Slot 6: the control of a field in a form. */
export interface FieldProps {
  readonly field: MetaField;
  readonly id?: string | undefined;
  readonly value?: unknown;
  readonly checked?: boolean | undefined;
  readonly onChange?: ((value: unknown) => void) | undefined;
  /** The name that a screen reader gives the control when no label points at it, as in a table. */
  readonly label?: string | undefined;
}

/** The replacement of a generic list or form (UI-04). A list has no row. */
export interface ScreenProps {
  readonly entity: MetaEntity;
  readonly row?: Row | undefined;
}

/** Slot 4: a notice over the frame. */
export interface NoticeProps {
  /** Closes the notice for as long as the page is open. */
  readonly close: () => void;
}

/** Slot 9: the sign in. */
export interface SignInProps {
  /** Call it when there is a session: the shell reads everything again and opens the admin. It ends when that is read. */
  readonly onSignedIn: () => Promise<void>;
}

/** Slot 10: a screen that stands in place of the admin. */
export interface GateProps {
  /** Call it when what the screen asked for is done: the shell reads everything again. */
  readonly onDone: () => void;
  readonly onSignOut: () => void;
}
