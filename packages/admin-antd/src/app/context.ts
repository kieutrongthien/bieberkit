/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/context.ts
 * @description The shared pieces of the screens: the client of the API from the context, the metadata of the user, and the entity that a route names (UI-02).
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

import type { AdminClient, Meta, MetaEntity } from '@bieberkit/admin-core';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { createContext, useContext } from 'react';
import type { Context } from 'react';

export const ClientContext: Context<AdminClient | undefined> = createContext<AdminClient | undefined>(undefined);

export function useClient(): AdminClient {
  const client = useContext(ClientContext);
  if (client === undefined) throw new Error('The screens need a client of the API.');
  return client;
}

/** The metadata of the signed in user: the entities and what the user may do with each (UI-02). */
export function useMeta(): UseQueryResult<Meta> {
  const client = useClient();
  return useQuery({ queryKey: ['meta'], queryFn: () => client.meta(), staleTime: 60_000 });
}

/** The entity that the address names (`/admin/settings/settings` is `/api/v1/settings/settings`), once the metadata is there. */
export function useEntity(): { entity: MetaEntity | undefined; loading: boolean } {
  const params = useParams({ strict: false });
  const meta = useMeta();
  const path = `/api/v1/${String(params.module)}/${String(params.resource)}`;
  return { entity: meta.data?.entities.find((candidate) => candidate.path === path), loading: meta.isPending };
}
