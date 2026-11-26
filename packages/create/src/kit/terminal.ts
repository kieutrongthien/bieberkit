/**
 * BieberKit
 *
 * @file        packages/create/src/kit/terminal.ts
 * @description The prompts of a person at the terminal, drawn by @clack/prompts on stderr (ADR 0029).
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

import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  password,
  select,
  spinner,
  text,
} from '@clack/prompts';
import type { Option } from '@clack/prompts';
import { cancelled } from './cancelled.ts';
import type { PromptOption, Prompts } from './command.ts';

// The only file that imports clack: tsdown inlines it into dist, and no type of it leaves this file (ADR 0029).
const output = process.stderr;

function answered<T>(value: T | symbol): T {
  if (typeof value === 'symbol' || isCancel(value)) {
    cancel('Cancelled.', { output });
    throw cancelled();
  }
  return value;
}

// Clack sees plain strings, and each answer is found again among the options, so that it keeps the type of their values.
const optionsOf = (options: readonly PromptOption<string>[]): Option<string>[] =>
  options.map(({ value, label, hint }) => ({ value, label, ...(hint === undefined ? {} : { hint }) }));

function valueOf<T extends string>(options: readonly PromptOption<T>[], answer: string): T {
  const found = options.find((option) => option.value === answer);
  if (found === undefined) throw new Error(`"${answer}" is not an option.`);
  return found.value;
}

/** Prompts with arrow keys, notes and spinners, as create-vite shows them. */
export function terminalPrompts(): Prompts {
  return {
    intro: (title) => intro(title, { output }),
    note: (body, title) => note(body, title, { output }),
    outro: (body) => outro(body, { output }),
    select: async <T extends string>(message: string, options: readonly PromptOption<T>[], initial: T): Promise<T> =>
      valueOf(
        options,
        answered<string>(await select({ message, options: optionsOf(options), initialValue: initial, output })),
      ),
    multiselect: async <T extends string>(
      message: string,
      options: readonly PromptOption<T>[],
      initial: readonly T[],
    ): Promise<T[]> =>
      answered<string[]>(
        await multiselect({
          message,
          options: optionsOf(options),
          initialValues: [...initial],
          required: false,
          output,
        }),
      ).map((answer) => valueOf(options, answer)),
    confirm: async (message, initial) => answered<boolean>(await confirm({ message, initialValue: initial, output })),
    text: async (message, options = {}) =>
      answered<string>(
        await text({
          message,
          output,
          ...(options.initial === undefined ? {} : { initialValue: options.initial }),
          ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
          ...(options.validate === undefined
            ? {}
            : { validate: (value: string | undefined) => options.validate?.(value ?? '') }),
        }),
      ),
    password: async (message) => answered<string>(await password({ message, output })),
    task: async (title, done, work) => {
      const spin = spinner({ output });
      spin.start(title);
      try {
        const result = await work();
        spin.stop(done);
        return result;
      } catch (error) {
        spin.error(error instanceof Error ? (error.message.split('\n')[0] ?? title) : title);
        throw error;
      }
    },
  };
}
