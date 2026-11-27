/**
 * BieberKit
 *
 * @file        packages/content/src/video.ts
 * @description The allowlist of video providers: the id is read from an address, and every address that is drawn is built from the id alone (CNT-03).
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

import type { EmbedProvider } from './types.ts';

export interface Video {
  readonly provider: EmbedProvider;
  readonly id: string;
}

export const PROVIDER_NAMES: Readonly<Record<EmbedProvider, string>> = { youtube: 'YouTube', vimeo: 'Vimeo' };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,20}$/;

interface Host {
  readonly provider: EmbedProvider;
  /** The id as this host writes it in an address, if the address has one. */
  id(url: URL): string | undefined;
}

const fromPath =
  (pattern: RegExp) =>
  (url: URL): string | undefined =>
    pattern.exec(url.pathname)?.[1];

const youtube: Host = {
  provider: 'youtube',
  id: (url) =>
    url.pathname === '/watch'
      ? (url.searchParams.get('v') ?? undefined)
      : fromPath(/^\/(?:shorts|embed)\/([^/]+)$/)(url),
};
const youtubeShort: Host = { provider: 'youtube', id: fromPath(/^\/([^/]+)$/) };
const youtubeNoCookie: Host = { provider: 'youtube', id: fromPath(/^\/embed\/([^/]+)$/) };
const vimeo: Host = { provider: 'vimeo', id: fromPath(/^\/([^/]+)$/) };
const vimeoPlayer: Host = { provider: 'vimeo', id: fromPath(/^\/video\/([^/]+)$/) };

// A map, so that a host name such as `constructor` finds nothing.
const HOSTS: ReadonlyMap<string, Host> = new Map([
  ['youtube.com', youtube],
  ['www.youtube.com', youtube],
  ['m.youtube.com', youtube],
  ['youtu.be', youtubeShort],
  ['youtube-nocookie.com', youtubeNoCookie],
  ['www.youtube-nocookie.com', youtubeNoCookie],
  ['vimeo.com', vimeo],
  ['www.vimeo.com', vimeo],
  ['player.vimeo.com', vimeoPlayer],
]);

/** The video that an `https:` address of an allowed host names. */
export function parseVideo(address: string): Video | undefined {
  if (!/^https:\/\//i.test(address) || /[\s\\]/.test(address)) return undefined;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  if (url.username !== '' || url.password !== '' || url.port !== '') return undefined;
  const host = HOSTS.get(url.hostname);
  const id = host?.id(url);
  if (host === undefined || id === undefined) return undefined;
  return (host.provider === 'youtube' ? YOUTUBE_ID : VIMEO_ID).test(id) ? { provider: host.provider, id } : undefined;
}

export const embedUrl = (video: Video): string =>
  video.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${video.id}`
    : `https://player.vimeo.com/video/${video.id}?dnt=1`;

export const pageUrl = (video: Video): string =>
  video.provider === 'youtube' ? `https://www.youtube.com/watch?v=${video.id}` : `https://vimeo.com/${video.id}`;
