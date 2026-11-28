/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/slots/slots.tsx
 * @description The slots of the admin: the registry of what the admin parts of the project give, and the one way a contribution is drawn, as a chunk of its own with an error of its own that cannot take the admin down (UI-35, UI-36, UI-12, UI-19, UI-21).
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

import { allowed, composeAdmin } from '@bieberkit/admin-core';
import type { AdminRegistry, AdminView, Load } from '@bieberkit/admin-core';
import { Alert, Skeleton } from 'antd';
import { Component, createContext, createElement, lazy, Suspense, useContext } from 'react';
import type { ComponentType, Context, ErrorInfo, JSX, LazyExoticComponent, ReactNode } from 'react';
import { reloadForChunk } from '../lib/chunk.ts';
import { useMeta } from '../lib/context.ts';
import { useT } from '../lib/language.tsx';
import { reportClientError } from '../lib/reports.ts';

/** The component of a slot. Each slot gives it its own props, so the contract names no one shape. */
export type AdminComponent = AdminView;

export type Registry = AdminRegistry<AdminComponent>;

export const RegistryContext: Context<Registry> = createContext<Registry>(composeAdmin<AdminComponent>([]).admin);

export const useRegistry = (): Registry => useContext(RegistryContext);

/** What the signed-in person may see of a slot. The server stays the authority. */
export function useAllowed<T extends { readonly permission?: string }>(items: readonly T[]): readonly T[] {
  const meta = useMeta();
  return allowed(items, new Set(meta.data?.permissions));
}

interface BoundaryProps {
  readonly name: string;
  readonly message: string;
  readonly children: ReactNode;
}

/** A contribution that fails shows its own message where it was, is reported, and leaves the rest of the screen as it is. */
class SlotBoundary extends Component<BoundaryProps, { readonly failed: boolean }> {
  override state: { readonly failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    // A chunk that is gone is a deploy: the page is read again, once (UI-22).
    if (reloadForChunk(error) === 'ignore') reportClientError(error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <Alert type="error" showIcon role="alert" title={this.props.message} description={this.props.name} />;
  }
}

type Drawn = ComponentType<Record<string, unknown>>;

/** One lazy component for a loader, so that a screen that is drawn again is not read again. */
const read = new WeakMap<Load<AdminComponent>, LazyExoticComponent<Drawn>>();

function componentOf(load: Load<AdminComponent>): LazyExoticComponent<Drawn> {
  let found = read.get(load);
  if (found === undefined) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the props of a slot are what the shell gives, by the contract
    found = lazy(load as unknown as Load<Drawn>);
    read.set(load, found);
  }
  return found;
}

/** Draws one contribution with the props of its slot. */
export function Slot(props: {
  /** The plugin and what of it, which the message of a failure names. */
  readonly name: string;
  readonly load: Load<AdminComponent>;
  /** The props of the slot. The caller says which with `satisfies`. */
  readonly given?: object;
  /** What stands there while the code is read. A skeleton, when it is not said. */
  readonly fallback?: ReactNode;
}): JSX.Element {
  const t = useT();
  return (
    <SlotBoundary name={props.name} message={t('plugin.failed')}>
      <Suspense fallback={props.fallback === undefined ? <Skeleton active /> : props.fallback}>
        {createElement(componentOf(props.load), { ...props.given })}
      </Suspense>
    </SlotBoundary>
  );
}
