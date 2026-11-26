/**
 * BieberKit
 *
 * @file        packages/create/src/kit/scripted.ts
 * @description Prompts that answer from a script, for the tests of the commands that ask (ADR 0029).
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

import { cancelled } from './cancelled.ts';
import type { PromptOption, Prompts, TextOptions } from './command.ts';

/** The answer that cancels the prompt it is given to, as Ctrl+C would. */
export const CANCEL: unique symbol = Symbol('cancel');

export type ScriptedAnswer = string | boolean | readonly string[] | typeof CANCEL;

export interface ScriptedPrompts extends Prompts {
  /** The message of each prompt, in the order they were asked. */
  readonly asked: string[];
  /** The intros, the titles of the notes and tasks, and the outros, in order. */
  readonly shown: string[];
  /** The text of each note, by its title. */
  readonly notes: Record<string, string>;
}

/** Prompts that take their answers from `answers`, in order. Running out of answers, or a wrong kind of answer, fails the test. */
export function scriptedPrompts(answers: readonly ScriptedAnswer[]): ScriptedPrompts {
  const queue = [...answers];
  const asked: string[] = [];
  const shown: string[] = [];
  const notes: Record<string, string> = {};
  const next = (message: string): Exclude<ScriptedAnswer, typeof CANCEL> => {
    asked.push(message);
    if (queue.length === 0) throw new Error(`The script has no answer for "${message}".`);
    const answer = queue.shift();
    if (answer === CANCEL || answer === undefined) throw cancelled();
    return answer;
  };
  const textOf = (message: string): string => {
    const answer = next(message);
    if (typeof answer !== 'string')
      throw new Error(`"${message}" needs a string, and the script gave ${JSON.stringify(answer)}.`);
    return answer;
  };
  const choice = <T extends string>(message: string, options: readonly PromptOption<T>[]): T => {
    const answer = textOf(message);
    const found = options.find((option) => option.value === answer);
    if (found === undefined) throw new Error(`"${answer}" is not an option of "${message}".`);
    return found.value;
  };
  return {
    asked,
    shown,
    notes,
    intro: (title) => void shown.push(title),
    note: (text, title) => {
      shown.push(title);
      notes[title] = text;
    },
    outro: (text) => void shown.push(text),
    select: async (message, options) => choice(message, options),
    multiselect: async <T extends string>(message: string, options: readonly PromptOption<T>[]): Promise<T[]> => {
      const answer = next(message);
      if (!Array.isArray(answer))
        throw new Error(`"${message}" needs a list, and the script gave ${JSON.stringify(answer)}.`);
      return answer.map((value: unknown) => {
        const found = options.find((option) => option.value === value);
        if (found === undefined) throw new Error(`"${String(value)}" is not an option of "${message}".`);
        return found.value;
      });
    },
    confirm: async (message) => {
      const answer = next(message);
      if (typeof answer !== 'boolean')
        throw new Error(`"${message}" needs true or false, and the script gave ${JSON.stringify(answer)}.`);
      return answer;
    },
    text: async (message, options: TextOptions = {}) => {
      const answer = textOf(message);
      const problem = options.validate?.(answer);
      if (problem !== undefined) throw new Error(`The prompt "${message}" refuses "${answer}": ${problem}`);
      return answer;
    },
    password: async (message) => textOf(message),
    task: async (title, _done, work) => {
      shown.push(title);
      return work();
    },
  };
}
