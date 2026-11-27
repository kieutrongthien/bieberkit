/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/admin/reports.js
 * @description A page that the crm fixture plugin adds to the admin: it lists the accounts with the client of the admin, to prove that a plugin page can read the API (UI-04).
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

// A module is a function of the host that answers a component. It carries no React: it uses the one of the admin.
export default function reports(host) {
  const { React, antd } = host.ui;
  return function Reports() {
    const [rows, setRows] = React.useState(undefined);
    React.useEffect(() => {
      host.client
        .meta()
        .then((meta) => meta.entities.find((entity) => entity.name === 'crm.Account'))
        .then((entity) => host.client.list(entity, { pageSize: 5, sort: 'code' }))
        .then((page) => setRows(page.rows.map((row) => String(row.code))));
    }, []);
    if (rows === undefined) return React.createElement(antd.Skeleton, { active: true });
    return React.createElement(
      'div',
      null,
      React.createElement('p', null, host.text({ en: 'Accounts by code', vi: 'Tài khoản theo mã' })),
      React.createElement(
        'ul',
        { 'aria-label': 'codes' },
        rows.map((code) => React.createElement('li', { key: code }, code)),
      ),
    );
  };
}
