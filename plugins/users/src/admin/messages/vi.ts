/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/messages/vi.ts
 * @description The Vietnamese texts of the account screens (UI-05, UI-26).
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

export const vi: Readonly<Record<MessageKey, string>> = {
  'users.auth.signIn.title': 'Đăng nhập',
  'users.auth.email': 'Email',
  'users.auth.password': 'Mật khẩu',
  'users.auth.signIn': 'Đăng nhập',
  'users.auth.noAnswer': 'Máy chủ không trả lời. Hãy thử lại.',
  'users.auth.signIn.subtitle': 'Dùng tài khoản của tổ chức bạn.',
  'users.auth.forgot': 'Quên mật khẩu?',
  'users.auth.code.title': 'Nhập mã xác thực',
  'users.auth.code.text': 'Mở ứng dụng xác thực và nhập mã 6 chữ số của tài khoản này.',
  'users.auth.code.label': 'Mã',
  'users.auth.code.verify': 'Xác nhận',
  'users.auth.code.useBackup': 'Dùng mã dự phòng',
  'users.auth.code.useApp': 'Dùng mã từ ứng dụng',
  'users.auth.code.backupText': 'Nhập một trong các mã dự phòng bạn đã lưu. Mỗi mã dùng được một lần.',
  'users.auth.code.backupLabel': 'Mã dự phòng',
  'users.auth.code.back': 'Quay lại đăng nhập',
  'users.auth.error.credentials': 'Email hoặc mật khẩu không đúng.',
  'users.auth.error.code': 'Mã chưa đúng. Hãy nhập mã mà ứng dụng đang hiển thị.',
  'users.auth.error.backupCode': 'Mã dự phòng không đúng hoặc đã được dùng.',
  'users.auth.error.currentPassword': 'Mật khẩu hiện tại không đúng.',
  'users.auth.error.link': 'Liên kết này không còn dùng được.',
  'users.auth.error.disabled': 'Tài khoản đã bị khóa. Hãy liên hệ quản trị viên.',
  'users.auth.error.network': 'Tài khoản này chỉ được đăng nhập từ các mạng được phép.',
  'users.auth.error.locked': 'Nhập sai mã quá nhiều lần. Tài khoản tạm khóa, hãy thử lại sau.',
  'users.auth.error.stepExpired': 'Bước nhập mã đã hết hạn. Hãy đăng nhập lại.',
  'users.auth.error.tooMany': 'Bạn thử quá nhiều lần. Hãy thử lại sau {seconds} giây.',
  'users.reset.forgot.title': 'Đặt lại mật khẩu',
  'users.reset.forgot.text': 'Nhập email của tài khoản. Chúng tôi sẽ gửi liên kết để chọn mật khẩu mới.',
  'users.reset.forgot.send': 'Gửi liên kết',
  'users.reset.forgot.sent': 'Nếu có tài khoản dùng địa chỉ này, liên kết đang được gửi tới.',
  'users.reset.choose.title': 'Chọn mật khẩu mới',
  'users.reset.invite.title': 'Chào mừng bạn. Hãy chọn mật khẩu',
  'users.reset.choose.endsSessions': 'Mọi phiên đăng nhập của tài khoản sẽ bị đăng xuất.',
  'users.reset.set': 'Đặt mật khẩu',
  'users.reset.done': 'Đã đặt mật khẩu. Hãy đăng nhập bằng mật khẩu này.',
  'users.reset.spent.title': 'Liên kết này không còn dùng được',
  'users.reset.spent.text': 'Liên kết đã được dùng hoặc đã hết hạn.',
  'users.reset.spent.again': 'Gửi liên kết mới',
  'users.password.current': 'Mật khẩu hiện tại',
  'users.password.new': 'Mật khẩu mới',
  'users.password.repeat': 'Nhập lại mật khẩu',
  'users.password.mismatch': 'Hai mật khẩu không giống nhau.',
  'users.password.tooShort': 'Dùng ít nhất 8 ký tự.',
  'users.password.tooLong': 'Dùng nhiều nhất 128 ký tự.',
  'users.password.advice': 'Mật khẩu từ 15 ký tự trở lên khó đoán hơn nhiều.',
  'users.password.rule': 'Từ 8 đến 128 ký tự. Không bắt buộc loại ký tự nào.',
  'users.account.tab.profile': 'Hồ sơ',
  'users.account.tab.password': 'Mật khẩu',
  'users.account.tab.factor': 'Xác thực hai lớp',
  'users.account.tab.sessions': 'Phiên đăng nhập',
  'users.account.name': 'Tên',
  'users.account.save': 'Lưu',
  'users.account.saved': 'Đã lưu',
  'users.account.nameReadOnly': 'Không đổi được tên ở đây.',
  'users.account.loadError': 'Không tải được tài khoản của bạn',
  'users.account.password.signOutOthers': 'Đăng xuất các phiên khác',
  'users.account.password.change': 'Đổi mật khẩu',
  'users.account.password.changed': 'Đã đổi mật khẩu',
  'users.account.provider':
    'Nhà cung cấp danh tính của bạn quản lý mật khẩu và lớp xác thực thứ hai của tài khoản này.',
  'users.factor.on': 'Đang bật',
  'users.factor.off': 'Đang tắt',
  'users.factor.explain': 'Mỗi lần đăng nhập, ngoài mật khẩu bạn nhập thêm mã từ ứng dụng xác thực.',
  'users.factor.setUp': 'Thiết lập',
  'users.factor.newCodes': 'Tạo mã dự phòng mới',
  'users.factor.turnOff': 'Tắt',
  'users.factor.required': 'Vai trò của bạn hoặc tổ chức yêu cầu bước này, nên không thể tắt.',
  'users.factor.askPassword': 'Nhập mật khẩu để tiếp tục.',
  'users.setup.start': 'Nhập mật khẩu để bắt đầu.',
  'users.setup.continue': 'Tiếp tục',
  'users.setup.scan.title': 'Quét mã QR',
  'users.setup.scan.text': 'Dùng ứng dụng xác thực, ví dụ Google Authenticator hoặc 1Password.',
  'users.setup.scan.key': 'Hoặc nhập khóa này',
  'users.setup.scan.qr': 'Mã QR cho ứng dụng xác thực',
  'users.setup.codes.title': 'Lưu mã dự phòng',
  'users.setup.codes.text': 'Mỗi mã dùng được một lần khi bạn không có điện thoại. Danh sách chỉ hiện lần này.',
  'users.setup.codes.label': 'Mã dự phòng',
  'users.setup.codes.copy': 'Sao chép',
  'users.setup.codes.copied': 'Đã sao chép',
  'users.setup.codes.download': 'Tải xuống',
  'users.setup.codes.saved': 'Tôi đã lưu các mã này',
  'users.setup.done': 'Hoàn tất',
  'users.enrol.title': 'Thiết lập xác thực hai lớp',
  'users.enrol.text': 'Vai trò của bạn hoặc tổ chức yêu cầu bước này. Làm xong là vào được trang quản trị.',
  'users.grace.text': 'Hãy thiết lập xác thực hai lớp trước ngày {date}.',
  'users.grace.link': 'Thiết lập ngay',
  'users.sessions.thisDevice': 'Thiết bị này',
  'users.sessions.unknownDevice': 'Thiết bị không rõ',
  'users.sessions.unknownAddress': 'địa chỉ không rõ',
  'users.sessions.detail': '{ip} · đăng nhập {created} · dùng gần nhất {used}',
  'users.sessions.end': 'Kết thúc',
  'users.sessions.endOthers': 'Đăng xuất mọi phiên khác',
  'users.cancel': 'Hủy',
  'users.close': 'Đóng',
};
