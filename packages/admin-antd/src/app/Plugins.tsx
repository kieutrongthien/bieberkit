/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Plugins.tsx
 * @description The code that plugins add to the admin: a module is loaded from the origin of the admin, given the host (React, Ant Design, the client), and drawn in a page, a slot, a field or in place of a screen, with an error of its own that cannot take the admin down (UI-04, ADR 0037).
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

import * as AntD from 'antd';
import { extensionsOf, labelText, moduleSrc } from '@bieberkit/admin-core';
import type { AdminHost, MetaLabel, MetaExtensions } from '@bieberkit/admin-core';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Skeleton } from 'antd';
import { Component, createElement, useMemo } from 'react';
import type { ComponentType, ErrorInfo, JSX, ReactNode } from 'react';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminBase } from './base.ts';
import { useClient, useMeta } from './context.ts';
import { useLanguage, useT } from './language.tsx';
import { reportClientError } from './reports.ts';

/** What a plugin gets as `host.ui`: the React and the Ant Design of the admin, so that it has none of its own (ADR 0037). */
export interface PluginUi {
  readonly React: typeof React;
  readonly antd: typeof AntD;
}

export type PluginHost = AdminHost<PluginUi>;

/** The extensions that the user may use. */
export function useExtensions(): MetaExtensions {
  return extensionsOf(useMeta().data);
}

/** The host that a module gets. It is the same object for as long as the language and the client are. */
export function usePluginHost(): PluginHost {
  const client = useClient();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  return useMemo(
    () => ({
      ui: { React, antd: AntD },
      client,
      locale,
      navigate: (path: string) => void navigate({ to: path }),
      text: (label: MetaLabel | string) => (typeof label === 'string' ? label : labelText(label, locale)),
    }),
    [client, locale, navigate],
  );
}

type Factory = (host: PluginHost) => ComponentType<Record<string, unknown>>;

/** A module is a file with a default export, a function that takes the host and answers a component. */
async function loadModule(module: string, host: PluginHost): Promise<ComponentType<Record<string, unknown>>> {
  // The address is under the admin and the policy lets scripts of this origin run. The bundler must not look at it.
  const loaded: unknown = await import(/* @vite-ignore */ moduleSrc(adminBase(), module));
  const factory: unknown = typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : undefined;
  if (typeof factory !== 'function') throw new Error(`${module} does not export a function as its default export.`);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (factory as Factory)(host);
}

/** The component of a module. It is made once for a module, a language and a client. */
export function usePluginComponent(module: string): {
  readonly component: ComponentType<Record<string, unknown>> | undefined;
  readonly error: Error | undefined;
} {
  const host = usePluginHost();
  const found = useQuery({
    queryKey: ['plugin-module', module, host.locale],
    queryFn: () => loadModule(module, host),
    staleTime: Infinity,
    retry: false,
  });
  return { component: found.data, error: found.error ?? undefined };
}

interface BoundaryState {
  readonly error: Error | undefined;
}

/** A plugin that fails shows its own message where it was, is reported, and leaves the rest of the screen as it is. */
class PluginBoundary extends Component<
  { readonly name: string; readonly message: string; readonly children: ReactNode },
  BoundaryState
> {
  override state: BoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportClientError(error);
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return <Alert type="error" showIcon role="alert" message={this.props.message} description={this.props.name} />;
  }
}

/** Draws a module with the props of its slot. A module that is loading is a skeleton, and one that does not load or breaks is an alert. */
export function PluginSlot(props: {
  readonly module: string;
  readonly name: string;
  readonly props?: Readonly<Record<string, unknown>>;
}): JSX.Element {
  const t = useT();
  const { component, error } = usePluginComponent(props.module);
  const message = t('plugin.failed');
  if (error !== undefined) {
    reportClientError(error);
    return <Alert type="error" showIcon role="alert" message={message} description={props.name} />;
  }
  if (component === undefined) return <Skeleton active />;
  return (
    <PluginBoundary name={props.name} message={message}>
      {createElement(component, props.props ?? {})}
    </PluginBoundary>
  );
}
