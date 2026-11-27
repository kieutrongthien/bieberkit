/**
 * BieberKit
 *
 * @file        packages/admin-core/src/i18n.ts
 * @description The languages of the admin: the dictionaries of en, vi and zh, the translator, the choice of a language and the formats of numbers, dates and money (UI-05).
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

export type Locale = 'en' | 'vi' | 'zh';

/** The languages that are bundled (UI-05). */
export const LOCALES: readonly Locale[] = ['en', 'vi', 'zh'];

const en = {
  'app.name': 'Admin',
  'language.label': 'Language',
  'auth.signIn.title': 'Sign in',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signOut': 'Sign out',
  'auth.noAnswer': 'The server did not answer. Try again.',
  'welcome.title': 'Welcome',
  'welcome.empty': 'Nothing here is open to you yet. Ask an administrator for a role.',
  'gate.menuError': 'The menu could not be loaded',
  'gate.noAnswer': 'The server did not answer',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'list.new': 'New',
  'list.deleted': 'Deleted',
  'list.notDeleted': 'The row was not deleted',
  'list.confirmDelete': 'Delete this row?',
  'list.loadError': 'The list could not be loaded',
  'list.missing': 'This screen does not exist, or it is not open to you.',
  'form.saved': 'Saved',
  'form.notSaved': 'The row was not saved',
  'form.edit': 'Edit {name}',
  'form.new': 'New {name}',
  'form.save': 'Save',
  'form.conflictTitle': 'Someone else changed this row',
  'form.conflictBody': 'Reload the page to see the new version, then make your change again.',
  'form.rowLoadError': 'The row could not be loaded',
  'form.missing': 'This screen does not exist.',
} as const;

export type MessageKey = keyof typeof en;
type Dictionary = Readonly<Record<MessageKey, string>>;

const vi: Dictionary = {
  'app.name': 'Quản trị',
  'language.label': 'Ngôn ngữ',
  'auth.signIn.title': 'Đăng nhập',
  'auth.email': 'Email',
  'auth.password': 'Mật khẩu',
  'auth.signIn': 'Đăng nhập',
  'auth.signOut': 'Đăng xuất',
  'auth.noAnswer': 'Máy chủ không trả lời. Hãy thử lại.',
  'welcome.title': 'Chào mừng',
  'welcome.empty': 'Hiện bạn chưa được mở mục nào. Hãy nhờ quản trị viên cấp vai trò.',
  'gate.menuError': 'Không tải được menu',
  'gate.noAnswer': 'Máy chủ không trả lời',
  'common.yes': 'Có',
  'common.no': 'Không',
  'common.cancel': 'Hủy',
  'common.delete': 'Xóa',
  'list.new': 'Thêm mới',
  'list.deleted': 'Đã xóa',
  'list.notDeleted': 'Không xóa được dòng này',
  'list.confirmDelete': 'Xóa dòng này?',
  'list.loadError': 'Không tải được danh sách',
  'list.missing': 'Màn hình này không tồn tại hoặc bạn không có quyền xem.',
  'form.saved': 'Đã lưu',
  'form.notSaved': 'Không lưu được dòng này',
  'form.edit': 'Sửa {name}',
  'form.new': 'Thêm {name}',
  'form.save': 'Lưu',
  'form.conflictTitle': 'Có người khác đã sửa dòng này',
  'form.conflictBody': 'Hãy tải lại trang để xem bản mới, rồi sửa lại.',
  'form.rowLoadError': 'Không tải được dòng này',
  'form.missing': 'Màn hình này không tồn tại.',
};

const zh: Dictionary = {
  'app.name': '管理后台',
  'language.label': '语言',
  'auth.signIn.title': '登录',
  'auth.email': '邮箱',
  'auth.password': '密码',
  'auth.signIn': '登录',
  'auth.signOut': '退出登录',
  'auth.noAnswer': '服务器没有响应，请重试。',
  'welcome.title': '欢迎',
  'welcome.empty': '您暂时没有可访问的内容，请联系管理员分配角色。',
  'gate.menuError': '无法加载菜单',
  'gate.noAnswer': '服务器没有响应',
  'common.yes': '是',
  'common.no': '否',
  'common.cancel': '取消',
  'common.delete': '删除',
  'list.new': '新建',
  'list.deleted': '已删除',
  'list.notDeleted': '无法删除该行',
  'list.confirmDelete': '确定删除该行？',
  'list.loadError': '无法加载列表',
  'list.missing': '该页面不存在，或您没有权限访问。',
  'form.saved': '已保存',
  'form.notSaved': '无法保存该行',
  'form.edit': '编辑{name}',
  'form.new': '新建{name}',
  'form.save': '保存',
  'form.conflictTitle': '其他人已修改了这一行',
  'form.conflictBody': '请刷新页面查看新版本，然后重新修改。',
  'form.rowLoadError': '无法加载该行',
  'form.missing': '该页面不存在。',
};

export const MESSAGES: Readonly<Record<Locale, Dictionary>> = { en, vi, zh };

/** The language tag that `Intl` takes for each language. */
const TAGS: Readonly<Record<Locale, string>> = { en: 'en-US', vi: 'vi-VN', zh: 'zh-CN' };

/** A function that gives the text of a key in one language. `{name}` in the text is replaced by `values.name`, once, so a value cannot add a placeholder. */
export function translator(
  locale: Locale,
): (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string {
  const dictionary = MESSAGES[locale];
  return (key, values) =>
    dictionary[key].replaceAll(/\{(\w+)\}/g, (found, name: string) => {
      const value = values?.[name];
      return value === undefined ? found : String(value);
    });
}

const isLocale = (value: unknown, among: readonly Locale[]): value is Locale =>
  among.some((locale) => locale === value);

/**
 * The language of a person: the one that they chose, if it is bundled and the project supports it; then the first language of the
 * browser that is; then English, or the first that the project supports.
 */
export function localeOf(
  languages: readonly string[],
  saved: string | undefined,
  supported: readonly Locale[] = LOCALES,
): Locale {
  if (isLocale(saved, supported)) return saved;
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    const found = supported.find((locale) => locale === primary);
    if (found !== undefined) return found;
  }
  return supported.includes('en') ? 'en' : (supported[0] ?? 'en');
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const isDecimal = (text: string): text is `${number}` => DECIMAL.test(text);

/** A number in the separators of the language. Text that is not a number comes back as it is. */
export function formatNumber(locale: Locale, value: number | string): string {
  if (typeof value === 'number')
    return Number.isFinite(value) ? new Intl.NumberFormat(TAGS[locale]).format(value) : String(value);
  return isDecimal(value) ? new Intl.NumberFormat(TAGS[locale], { maximumFractionDigits: 20 }).format(value) : value;
}

/** A calendar day (`YYYY-MM-DD`) in the language. It has no time, so no zone moves it. */
export function formatDate(locale: Locale, day: string): string {
  if (!DAY.test(day)) return day;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(TAGS[locale], { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** An instant (ISO 8601) in the language, in a zone: UTC unless the person's zone is given. */
export function formatDateTime(locale: Locale, instant: string, timeZone = 'UTC'): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return new Intl.DateTimeFormat(TAGS[locale], { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

/** An amount that the API sends as text, in its currency. The digits of the text are kept as they are: no number carries them. */
export function formatMoney(locale: Locale, amount: string, currency: string): string {
  if (!isDecimal(amount)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(TAGS[locale], { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
