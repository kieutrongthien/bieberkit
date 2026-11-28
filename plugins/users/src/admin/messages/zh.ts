/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/messages/zh.ts
 * @description The Chinese texts of the account screens (UI-05, UI-26).
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

import type { MessageKey } from './en.ts';

export const zh: Readonly<Record<MessageKey, string>> = {
  'users.auth.signIn.title': '登录',
  'users.auth.email': '邮箱',
  'users.auth.password': '密码',
  'users.auth.signIn': '登录',
  'users.auth.noAnswer': '服务器没有响应，请重试。',
  'users.auth.signIn.subtitle': '请使用你所在组织的账号。',
  'users.auth.forgot': '忘记密码？',
  'users.auth.code.title': '输入验证码',
  'users.auth.code.text': '打开身份验证器应用，输入此账户显示的 6 位数字。',
  'users.auth.code.label': '验证码',
  'users.auth.code.verify': '验证',
  'users.auth.code.useBackup': '使用备用码',
  'users.auth.code.useApp': '使用应用中的验证码',
  'users.auth.code.backupText': '输入您保存的一个备用码。每个只能使用一次。',
  'users.auth.code.backupLabel': '备用码',
  'users.auth.code.back': '返回登录',
  'users.auth.error.credentials': '邮箱或密码不正确。',
  'users.auth.error.code': '验证码不正确。请输入应用当前显示的验证码。',
  'users.auth.error.backupCode': '备用码不正确或已被使用。',
  'users.auth.error.currentPassword': '当前密码不正确。',
  'users.auth.error.link': '此链接已失效。',
  'users.auth.error.disabled': '此账户已停用。请联系管理员。',
  'users.auth.error.network': '此账户只能从允许的网络登录。',
  'users.auth.error.locked': '验证码错误次数过多。账户暂时锁定，请稍后再试。',
  'users.auth.error.stepExpired': '验证步骤已过期。请重新登录。',
  'users.auth.error.tooMany': '尝试次数过多。请在 {seconds} 秒后再试。',
  'users.reset.forgot.title': '重置密码',
  'users.reset.forgot.text': '输入账户邮箱，我们将发送用于设置新密码的链接。',
  'users.reset.forgot.send': '发送链接',
  'users.reset.forgot.sent': '如果该邮箱对应某个账户，链接正在发送中。',
  'users.reset.choose.title': '设置新密码',
  'users.reset.invite.title': '欢迎。请设置密码',
  'users.reset.choose.endsSessions': '此账户的所有会话都将退出登录。',
  'users.reset.set': '设置密码',
  'users.reset.done': '密码已设置。请使用它登录。',
  'users.reset.spent.title': '此链接已失效',
  'users.reset.spent.text': '链接已被使用或已过期。',
  'users.reset.spent.again': '发送新链接',
  'users.password.current': '当前密码',
  'users.password.new': '新密码',
  'users.password.repeat': '再次输入密码',
  'users.password.mismatch': '两次输入的密码不一致。',
  'users.password.tooShort': '至少使用 8 个字符。',
  'users.password.tooLong': '最多使用 128 个字符。',
  'users.password.advice': '15 个字符以上的密码更难被猜到。',
  'users.password.rule': '8 到 128 个字符。不要求特定类型的字符。',
  'users.account.tab.profile': '个人资料',
  'users.account.tab.password': '密码',
  'users.account.tab.factor': '两步验证',
  'users.account.tab.sessions': '登录会话',
  'users.account.name': '姓名',
  'users.account.save': '保存',
  'users.account.saved': '已保存',
  'users.account.nameReadOnly': '此处无法修改姓名。',
  'users.account.loadError': '无法加载您的账户',
  'users.account.password.signOutOthers': '退出其他会话',
  'users.account.password.change': '修改密码',
  'users.account.password.changed': '密码已修改',
  'users.account.provider': '此账户的密码和两步验证由您的身份提供方管理。',
  'users.factor.on': '已开启',
  'users.factor.off': '已关闭',
  'users.factor.explain': '每次登录时，输入密码后还需输入身份验证器应用中的验证码。',
  'users.factor.setUp': '设置',
  'users.factor.newCodes': '生成新的备用码',
  'users.factor.turnOff': '关闭',
  'users.factor.required': '您的角色或组织要求开启两步验证，因此无法关闭。',
  'users.factor.askPassword': '输入密码以继续。',
  'users.setup.start': '输入密码以开始。',
  'users.setup.continue': '继续',
  'users.setup.scan.title': '扫描二维码',
  'users.setup.scan.text': '使用身份验证器应用，例如 Google Authenticator 或 1Password。',
  'users.setup.scan.key': '或手动输入此密钥',
  'users.setup.scan.qr': '用于身份验证器应用的二维码',
  'users.setup.codes.title': '保存备用码',
  'users.setup.codes.text': '手机不在身边时，每个备用码可使用一次。仅在此时显示。',
  'users.setup.codes.label': '备用码',
  'users.setup.codes.copy': '复制',
  'users.setup.codes.copied': '已复制',
  'users.setup.codes.download': '下载',
  'users.setup.codes.saved': '我已保存这些备用码',
  'users.setup.done': '完成',
  'users.enrol.title': '设置两步验证',
  'users.enrol.text': '您的角色或组织要求完成此步骤。完成后即可进入管理后台。',
  'users.grace.text': '请在 {date} 之前设置两步验证。',
  'users.grace.link': '立即设置',
  'users.sessions.thisDevice': '当前设备',
  'users.sessions.unknownDevice': '未知设备',
  'users.sessions.unknownAddress': '未知地址',
  'users.sessions.detail': '{ip} · 登录于 {created} · 最近使用 {used}',
  'users.sessions.end': '结束',
  'users.sessions.endOthers': '退出所有其他会话',
  'users.cancel': '取消',
  'users.close': '关闭',
};
