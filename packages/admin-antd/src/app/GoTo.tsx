/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/GoTo.tsx
 * @description The box that goes to a page of the menu: a button in the frame, Ctrl or Cmd and K, a search without accents and a list that the keys move in (UI-24).
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

import { labelText, searchMenu, shortcutOf } from '@bieberkit/admin-core';
import type { MenuEntry, MenuGroup } from '@bieberkit/admin-core';
import { useNavigate } from '@tanstack/react-router';
import { Button, Input, Modal, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { Icon } from './icons.tsx';
import { useLanguage, useT } from './language.tsx';

const LIST = 'bk-goto-list';
const optionId = (index: number): string => `bk-goto-option-${index}`;
const KEYS = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K';

export function GoTo(props: { readonly groups: readonly MenuGroup[] }): JSX.Element {
  const t = useT();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const label = (entry: MenuEntry): string => labelText(entry.label, locale, entry.name);
  const found = searchMenu(props.groups, text, label);

  useEffect(() => {
    const press = (event: globalThis.KeyboardEvent): void => {
      const shortcut = shortcutOf({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
        typing: false,
      });
      if (shortcut !== 'goto') return;
      // The browser has its own search on these keys.
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, []);

  const close = (): void => {
    setOpen(false);
    setText('');
    setActive(0);
  };
  const go = (entry: MenuEntry): void => {
    close();
    void navigate({ to: entry.path });
  };
  const move = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (found.length > 0) setActive((now) => (now + step + found.length) % found.length);
    }
    const chosen = found[active];
    // Enter that ends a composition of Chinese or Vietnamese is a part of the text.
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && chosen !== undefined) go(chosen);
  };

  return (
    <>
      <Button className="bk-goto" onClick={() => setOpen(true)}>
        <span className="bk-goto-text">
          <Icon names={['search']} size={16} />
          {t('goto.button')}
        </span>
        <kbd aria-hidden="true">{KEYS}</kbd>
      </Button>
      <Modal title={t('goto.title')} open={open} onCancel={close} footer={null} destroyOnHidden>
        <Input
          autoFocus
          role="combobox"
          aria-label={t('goto.placeholder')}
          aria-expanded={found.length > 0}
          aria-controls={LIST}
          aria-activedescendant={found.length > 0 ? optionId(active) : undefined}
          placeholder={t('goto.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={move}
        />
        <ul id={LIST} className="bk-goto-list" role="listbox" aria-label={t('goto.title')}>
          {found.map((entry, index) => (
            // The keys are those of the input, which has the focus: this is the list of a combobox (WAI-ARIA).
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={entry.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(entry)}
            >
              <Icon names={entry.icons} />
              {label(entry)}
            </li>
          ))}
        </ul>
        {found.length === 0 ? <Typography.Text role="status">{t('goto.none')}</Typography.Text> : null}
      </Modal>
    </>
  );
}
