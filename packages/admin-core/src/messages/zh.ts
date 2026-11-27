/**
 * BieberKit
 *
 * @file        packages/admin-core/src/messages/zh.ts
 * @description The Chinese dictionary of the admin, loaded when a person chooses the language (UI-05, UI-12).
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

import type { Dictionary } from './en.ts';

export const zh: Dictionary = {
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
  'list.filter': '筛选',
  'list.filterField': '字段',
  'list.filterOp': '条件',
  'list.filterValue': '值',
  'list.filterAdd': '添加筛选',
  'list.filterClear': '清除筛选',
  'list.filterNull': '是否为空',
  'list.views': '已保存的视图',
  'list.viewName': '视图名称',
  'list.viewSave': '保存视图',
  'list.viewDelete': '删除视图',
  'list.viewSaved': '视图已保存',
  'list.selected': '已选 {count} 项',
  'list.deleteSelected': '删除所选',
  'list.confirmDeleteMany': '删除 {count} 行？',
  'list.bulkDone': '已处理 {count} 行',
  'list.bulkFailed': '{count} 行未更改：{why}',
  'list.bulkQueued': '这是一项较大的更改，将在后台运行。',
  'list.export': '导出 CSV',
  'list.exportTruncated': '文件只含前 {limit} 行。请缩小筛选范围以获取其余部分。',
  'list.exportError': '导出失败',
  'list.moves': '流转到',
  'list.moved': '已{name}',
  'list.notMoved': '无法流转',
  'list.setField': '修改字段',
  'list.apply': '应用',
  'list.notChanged': '这些行未更改',
  'list.selectRow': '选择 {name}',
  'list.sort': '排序方式',
  'detail.details': '详情',
  'detail.history': '历史',
  'detail.newRelated': '新建{name}',
  'detail.noRelated': '暂无',
  'detail.noHistory': '此行尚无记录',
  'detail.historyDenied': '您无权查看历史',
  'detail.computed': '由服务器填写',
  'relation.search': '输入以搜索',
  'relation.pick': '请选择',
  'relation.none': '未找到',
  'list.op.eq': '等于',
  'list.op.ne': '不等于',
  'list.op.in': '属于',
  'list.op.lt': '小于',
  'list.op.lte': '至多',
  'list.op.gt': '大于',
  'list.op.gte': '至少',
  'list.op.null': '为空',
  'form.saved': '已保存',
  'form.notSaved': '无法保存该行',
  'form.edit': '编辑{name}',
  'form.new': '新建{name}',
  'form.save': '保存',
  'problem.required': '此项为必填',
  'problem.tooShort': '至少 {min} 个字符',
  'problem.tooLong': '最多 {max} 个字符',
  'problem.tooSmall': '不得小于 {min}',
  'problem.tooBig': '不得大于 {max}',
  'problem.pattern': '格式不正确',
  'form.conflictTitle': '其他人已修改了这一行',
  'form.conflictBody': '请刷新页面查看新版本，然后重新修改。',
  'form.rowLoadError': '无法加载该行',
  'form.missing': '该页面不存在。',
  'shell.offline': '您已离线。恢复连接前，所做的更改不会保存。',
  'error.title': '出错了',
  'error.retry': '重试',
  'error.updated': '应用已更新，请刷新页面后继续。',
  'error.reload': '刷新',
  'form.leave': '您有未保存的更改，确定离开此页面？',
  'form.draftFound': '在此浏览器上找到了该表单的草稿。',
  'form.draftRestore': '恢复草稿',
  'form.draftDiscard': '丢弃草稿',
  'conflict.changedBy': '{who}于{when}修改',
  'conflict.unknownUser': '其他用户',
  'conflict.field': '字段',
  'conflict.mine': '您的值',
  'conflict.theirs': '对方的值',
  'conflict.keepMine': '在对方的版本上保留我的更改',
  'conflict.takeTheirs': '放弃我的更改，采用对方的版本',
};
