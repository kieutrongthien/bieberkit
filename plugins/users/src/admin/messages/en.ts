/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/messages/en.ts
 * @description The English texts of the account screens (UI-05, UI-26).
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

export const en = {
  'users.auth.signIn.title': 'Sign in',
  'users.auth.email': 'Email',
  'users.auth.password': 'Password',
  'users.auth.signIn': 'Sign in',
  'users.auth.noAnswer': 'The server did not answer. Try again.',
  'users.auth.signIn.subtitle': 'Use the account of your organization.',
  'users.auth.forgot': 'Forgot password?',
  'users.auth.code.title': 'Enter the code',
  'users.auth.code.text': 'Open your authenticator app and type the six digits that it shows for this account.',
  'users.auth.code.label': 'Code',
  'users.auth.code.verify': 'Verify',
  'users.auth.code.useBackup': 'Use a backup code',
  'users.auth.code.useApp': 'Use the code of the app',
  'users.auth.code.backupText': 'Type one of the backup codes that you saved. Each works once.',
  'users.auth.code.backupLabel': 'Backup code',
  'users.auth.code.back': 'Back to sign in',
  'users.auth.error.credentials': 'The email or the password is not right.',
  'users.auth.error.code': 'That code is not right. Try the one that your app shows now.',
  'users.auth.error.backupCode': 'That backup code is not right, or it was used already.',
  'users.auth.error.currentPassword': 'The current password is not right.',
  'users.auth.error.link': 'This link no longer works.',
  'users.auth.error.disabled': 'This account is disabled. Ask an administrator.',
  'users.auth.error.network': 'This account may sign in only from the allowed networks.',
  'users.auth.error.locked': 'Too many wrong codes. The account is locked for a while. Try again later.',
  'users.auth.error.stepExpired': 'The code step expired. Sign in again.',
  'users.auth.error.tooMany': 'Too many tries. Try again in {seconds} seconds.',
  'users.reset.forgot.title': 'Reset your password',
  'users.reset.forgot.text': 'Type the email of your account. We send a link to choose a new password.',
  'users.reset.forgot.send': 'Send the link',
  'users.reset.forgot.sent': 'If an account has that address, a link is on its way.',
  'users.reset.choose.title': 'Choose a new password',
  'users.reset.invite.title': 'Welcome. Choose your password',
  'users.reset.choose.endsSessions': 'Every session of the account is signed out.',
  'users.reset.set': 'Set password',
  'users.reset.done': 'Your password is set. Sign in with it.',
  'users.reset.spent.title': 'This link no longer works',
  'users.reset.spent.text': 'It was used already, or it is too old.',
  'users.reset.spent.again': 'Send a new link',
  'users.password.current': 'Current password',
  'users.password.new': 'New password',
  'users.password.repeat': 'Repeat the password',
  'users.password.mismatch': 'The two passwords differ.',
  'users.password.tooShort': 'Use at least 8 characters.',
  'users.password.tooLong': 'Use at most 128 characters.',
  'users.password.advice': 'A password of 15 characters or more is much harder to guess.',
  'users.password.rule': '8 to 128 characters. No kind of character is required.',
  'users.account.tab.profile': 'Profile',
  'users.account.tab.password': 'Password',
  'users.account.tab.factor': 'Two-factor sign in',
  'users.account.tab.sessions': 'Sessions',
  'users.account.name': 'Name',
  'users.account.save': 'Save',
  'users.account.saved': 'Saved',
  'users.account.nameReadOnly': 'The name cannot be changed here.',
  'users.account.loadError': 'Your account could not be loaded',
  'users.account.password.signOutOthers': 'Sign out other sessions',
  'users.account.password.change': 'Change password',
  'users.account.password.changed': 'Password changed',
  'users.account.provider': 'Your identity provider manages the password and the second factor of this account.',
  'users.factor.on': 'On',
  'users.factor.off': 'Off',
  'users.factor.explain': 'At each sign in you type a code from your authenticator app after your password.',
  'users.factor.setUp': 'Set up',
  'users.factor.newCodes': 'New backup codes',
  'users.factor.turnOff': 'Turn off',
  'users.factor.required': 'Your role or your organization requires it, so it cannot be turned off.',
  'users.factor.askPassword': 'Type your password to go on.',
  'users.setup.start': 'Type your password to start.',
  'users.setup.continue': 'Continue',
  'users.setup.scan.title': 'Scan the QR code',
  'users.setup.scan.text': 'Use an authenticator app, such as Google Authenticator or 1Password.',
  'users.setup.scan.key': 'Or type this key',
  'users.setup.scan.qr': 'QR code for your authenticator app',
  'users.setup.codes.title': 'Save the backup codes',
  'users.setup.codes.text': 'Each code works once when you do not have your phone. They are shown only now.',
  'users.setup.codes.label': 'Backup codes',
  'users.setup.codes.copy': 'Copy',
  'users.setup.codes.copied': 'Copied',
  'users.setup.codes.download': 'Download',
  'users.setup.codes.saved': 'I have saved these codes',
  'users.setup.done': 'Done',
  'users.enrol.title': 'Set up two-factor sign in',
  'users.enrol.text': 'Your role or your organization requires it. When it is done, the admin opens.',
  'users.grace.text': 'Set up two-factor sign in by {date}.',
  'users.grace.link': 'Set it up',
  'users.sessions.thisDevice': 'This device',
  'users.sessions.unknownDevice': 'Unknown device',
  'users.sessions.unknownAddress': 'unknown address',
  'users.sessions.detail': '{ip} · signed in {created} · last used {used}',
  'users.sessions.end': 'End',
  'users.sessions.endOthers': 'Sign out all other sessions',
  'users.cancel': 'Cancel',
  'users.close': 'Close',
} as const;

export type MessageKey = keyof typeof en;
