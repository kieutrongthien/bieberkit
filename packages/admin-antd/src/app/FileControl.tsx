/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/FileControl.tsx
 * @description The control of a file or an image field: it shows the file that is held, picks another from the disk of the person, sends it to the media library with the signed URL, and holds the id of the record (UI-11, ADR 0036).
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

import { acceptAttribute, AdminApiError, fileProblem, isPicture, sizeText } from '@bieberkit/admin-core';
import type { MediaFile, MetaField } from '@bieberkit/admin-core';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Spin } from 'antd';
import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { useClient } from './context.ts';
import { useT } from './language.tsx';

/**
 * The value is the id of a media record, or nothing. A file that is picked is sent at once, and the field holds its id when the storage
 * has it and the upload is confirmed, so that a save never names a file that is not there. The record is read to name what is held.
 */
export function FileControl(props: {
  readonly field: MetaField;
  readonly id?: string | undefined;
  readonly value?: unknown;
  readonly onChange?: ((value: unknown) => void) | undefined;
  readonly label?: string;
}): JSX.Element {
  const { field, id, onChange } = props;
  const client = useClient();
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const held = typeof props.value === 'string' && props.value !== '' ? props.value : undefined;
  const name = props.label ?? field.key;

  const file = useQuery<MediaFile>({
    queryKey: ['media-file', held],
    queryFn: () => client.mediaFile(held ?? ''),
    enabled: held !== undefined,
    retry: false,
  });
  const picture = file.data !== undefined && isPicture(file.data);
  const preview = useQuery({
    queryKey: ['media-url', held],
    queryFn: () => client.mediaUrl(held ?? ''),
    enabled: picture && held !== undefined,
    retry: false,
  });

  const pick = async (chosen: File | undefined): Promise<void> => {
    if (chosen === undefined) return;
    const wrong = fileProblem(field, chosen);
    if (wrong !== undefined) {
      setProblem(t(wrong === 'empty' ? 'file.empty' : 'file.type', { types: (field.accept ?? []).join(', ') }));
      return;
    }
    setProblem(undefined);
    setBusy(true);
    try {
      const sent = await client.uploadFile(chosen);
      onChange?.(sent.id);
    } catch (error) {
      setProblem(
        error instanceof AdminApiError && error.code === 'STORAGE_SIGNING_UNSUPPORTED'
          ? t('file.noSigning')
          : error instanceof Error
            ? error.message
            : t('file.failed'),
      );
    } finally {
      setBusy(false);
      // The same file may be picked again after a failure.
      if (input.current !== null) input.current.value = '';
    }
  };

  const accept = acceptAttribute(field);
  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <input
        ref={input}
        {...(id === undefined ? {} : { id })}
        type="file"
        aria-label={name}
        {...(accept === undefined ? {} : { accept })}
        disabled={busy}
        onChange={(event) => void pick(event.target.files?.[0])}
        style={{ maxWidth: '100%' }}
      />
      {busy ? <Spin size="small" tip={t('file.sending')} /> : null}
      {held === undefined ? null : (
        <Space wrap>
          {picture && preview.data !== undefined ? (
            <img
              src={preview.data}
              alt={file.data?.filename ?? ''}
              style={{ maxHeight: 64, maxWidth: 160, borderRadius: 4 }}
            />
          ) : null}
          <span>{file.data === undefined ? held : `${file.data.filename} (${sizeText(file.data.size)})`}</span>
          <Button size="small" onClick={() => onChange?.(null)} aria-label={t('file.removeNamed', { name })}>
            {t('file.remove')}
          </Button>
        </Space>
      )}
      {problem === undefined ? null : <Alert type="error" showIcon role="alert" message={problem} />}
    </Space>
  );
}
