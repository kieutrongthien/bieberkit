/**
 * BieberKit
 *
 * @file        tools/acceptance/plugin-author.mjs
 * @description The acceptance of the author of a plugin (UI-38): from the packed packages, a new project outside the repository makes a plugin, runs it in dev with edits of its screen and of its backend, builds, serves it from the web role under the policy of the admin, and from the folder that its Dockerfile makes.
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

// Usage: pnpm test:acceptance (after pnpm build). Needs pnpm, Chromium of Playwright, and the ports 4610 to 4613.
// ACCEPTANCE_KEEP=1 keeps the temporary folder, to look at what was made.
//
// The tarballs stand for the registry. Only in the two temporary projects made here, `blockExoticSubdeps` is false, so that a
// dependency may name a file; the release delay stays as `create` writes it, and no build script is allowed that it does not allow.

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const REPOSITORY = resolve(import.meta.dirname, '..', '..');
const WORK = mkdtempSync(join(tmpdir(), 'bk-acceptance-'));
const PLUGIN = 'bieberkit-plugin-notes';
const APP_PORT = 4610;
const METRICS_PORT = 4611;
const ADMIN_PORT = 4612;
const WEB = `http://127.0.0.1:${APP_PORT}`;

const step = (text) => process.stdout.write(`\n== ${text}\n`);
const check = (condition, text) => {
  if (!condition) throw new Error(`Failed: ${text}`);
  process.stdout.write(`ok  ${text}\n`);
};

/** Runs a program to its end. A failure shows what it printed. */
function run(file, args, cwd, env = {}) {
  try {
    return execFileSync(file, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`${file} ${args.join(' ')} failed in ${cwd}:\n${error.stdout}\n${error.stderr}`, { cause: error });
  }
}

const running = new Set();

/** Starts a program that runs until it is stopped, with what it prints kept for a failure. */
function start(file, args, cwd, env = {}) {
  const child = spawn(file, args, { cwd, env: { ...process.env, ...env }, detached: true });
  const program = { child, output: '' };
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => (program.output += String(chunk)));
  running.add(program);
  return program;
}

function stop(program) {
  running.delete(program);
  try {
    // The whole group: pnpm, Node and Vite.
    process.kill(-program.child.pid, 'SIGTERM');
  } catch {
    // It had ended.
  }
}

async function waitFor(what, probe, program, seconds = 90) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    try {
      if (await probe()) return;
    } catch {
      // Not there yet.
    }
    if (Date.now() > until) throw new Error(`${what} did not come in ${seconds} s.\n${program?.output ?? ''}`);
    await new Promise((done) => setTimeout(done, 300));
  }
}

const answers = (url) => async () => (await fetch(url)).ok;

/** Every package that the repository publishes, packed, by name. */
function packAll() {
  const found = new Map();
  for (const top of ['packages', 'plugins']) {
    for (const entry of readdirSync(join(REPOSITORY, top), { withFileTypes: true })) {
      const folder = join(REPOSITORY, top, entry.name);
      if (!entry.isDirectory() || !existsSync(join(folder, 'package.json'))) continue;
      const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
      if (manifest.private === true) continue;
      const destination = join(WORK, 'packs', entry.name);
      mkdirSync(destination, { recursive: true });
      run('pnpm', ['pack', '--pack-destination', destination], folder);
      found.set(manifest.name, `file:${join(destination, readdirSync(destination)[0])}`);
    }
  }
  return found;
}

const overridesOf = (packs) => `overrides:\n${[...packs].map(([name, file]) => `  '${name}': '${file}'\n`).join('')}`;

/** The project that `create` makes from the packed scaffolder, with the tarballs in the place of the registry. */
function makeProject(packs) {
  const creator = join(WORK, 'creator');
  mkdirSync(creator);
  writeFileSync(
    join(creator, 'package.json'),
    JSON.stringify({
      name: 'creator',
      private: true,
      dependencies: { 'create-bieberkit': packs.get('create-bieberkit') },
    }),
  );
  writeFileSync(
    join(creator, 'pnpm-workspace.yaml'),
    `packages: []\nminimumReleaseAge: 10080\nblockExoticSubdeps: false\n${overridesOf(packs)}`,
  );
  run('pnpm', ['install', '--reporter=silent'], creator);
  run(
    join(creator, 'node_modules', '.bin', 'create-bieberkit'),
    ['demo', '--yes', '--no-install', '--no-git', '--author', 'Test <test@example.com>'],
    WORK,
  );
  const root = join(WORK, 'demo');
  const workspace = join(root, 'pnpm-workspace.yaml');
  const written = readFileSync(workspace, 'utf8');
  check(written.includes("- 'plugins/*'"), 'the new workspace holds plugins/*');
  check(written.includes('blockExoticSubdeps: true'), 'the new project blocks exotic dependencies');
  writeFileSync(
    workspace,
    `${written.replace('blockExoticSubdeps: true', 'blockExoticSubdeps: false # this temporary project only: the tarballs are files')}${overridesOf(packs)}`,
  );
  const environment = join(root, '.env');
  const values = { APP_PORT, METRICS_PORT, APP_URL: WEB };
  let text = readFileSync(environment, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^#? ?${key}=.*$`, 'm');
    text = line.test(text) ? text.replace(line, `${key}=${value}`) : `${text}\n${key}=${value}\n`;
  }
  writeFileSync(environment, text);
  return root;
}

const dotenv = (root, key) =>
  new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync(join(root, '.env'), 'utf8'))?.[1] ?? '';

/** A page that keeps what the console and the policy complain of. */
async function openPage(browser) {
  const page = await browser.newPage();
  const problems = [];
  page.on('console', (message) => {
    // A call that is refused before sign in is the browser's own line, and no fault of the application.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`policy: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return { page, problems };
}

async function signInAndOpenNotes(page, address, root) {
  await page.goto(address);
  await page.getByLabel('Email').fill(dotenv(root, 'USERS_ADMIN_EMAIL'));
  await page.getByLabel('Password').fill(dotenv(root, 'USERS_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome', exact: true }).waitFor({ timeout: 60_000 });
  await page.getByRole('menuitem', { name: 'Notes', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Notes' }).waitFor({ timeout: 30_000 });
  await page.getByRole('link', { name: 'All items' }).waitFor({ timeout: 30_000 });
}

const labelOfItem = (page) =>
  page.evaluate(async () => {
    const meta = await (await fetch('/api/v1/_meta')).json();
    return meta.entities.find((entity) => entity.name === 'notes.Item')?.label.en;
  });

async function dev(root, browser) {
  step('bieberkit dev: the screen of the plugin, then an edit of it and of the backend');
  const program = start(
    'pnpm',
    ['exec', 'bieberkit', 'dev', '--no-services', '--admin-port', String(ADMIN_PORT)],
    root,
  );
  const screen = join(root, 'plugins/notes/src/admin/pages/NotesPage.tsx');
  const entity = join(root, 'plugins/notes/src/entities/item.ts');
  const screenBefore = readFileSync(screen, 'utf8');
  const entityBefore = readFileSync(entity, 'utf8');
  try {
    await waitFor('The server of dev', answers(`${WEB}/health/ready`), program);
    await waitFor('The admin of dev', answers(`http://localhost:${ADMIN_PORT}/`), program);
    const { page, problems } = await openPage(browser);
    await signInAndOpenNotes(page, `http://localhost:${ADMIN_PORT}/`, root);
    check(true, 'dev shows the page of the made plugin after sign in');
    await page.evaluate(() => (window.notReloaded = true));
    writeFileSync(screen, screenBefore.replace('<AdminLink to=', '<span>EDITED-SCREEN</span>\n        <AdminLink to='));
    await page.getByText('EDITED-SCREEN').waitFor({ timeout: 30_000 });
    check(
      await page.evaluate(() => window.notReloaded === true),
      'an edit of the screen shows with no reload and no build',
    );
    check(problems.length === 0, `dev has no console error: ${problems.join(' | ')}`);
    check((await labelOfItem(page)) === 'Item', 'the metadata holds the entity of the plugin');
    writeFileSync(entity, entityBefore.replace("label: { en: 'Item' }", "label: { en: 'Edited item' }"));
    await waitFor(
      'The restart after an edit of the backend',
      async () => (await labelOfItem(page)) === 'Edited item',
      program,
    );
    check(true, 'an edit of the backend of the plugin restarts the server');
    await page.close();
  } finally {
    writeFileSync(screen, screenBefore);
    writeFileSync(entity, entityBefore);
    stop(program);
  }
}

/** Starts the web role of `root`, signs in at /admin/ and opens the page of the plugin, under the policy. */
async function serveAndWalk(root, browser, project, what) {
  const environment = Object.fromEntries(
    readFileSync(join(project, '.env'), 'utf8')
      .split('\n')
      .flatMap((line) => {
        const found = /^([A-Z0-9_]+)=(.*)$/.exec(line);
        return found === null ? [] : [[found[1], found[2]]];
      }),
  );
  // The database of the project, wherever the server runs from.
  environment.DATABASE_URL = resolve(project, environment.DATABASE_URL ?? './data/app.db');
  const program = start(process.execPath, ['apps/server/src/main.ts', 'web'], root, environment);
  try {
    await waitFor(`The web role ${what}`, answers(`${WEB}/health/ready`), program, 60);
    const { page, problems } = await openPage(browser);
    await signInAndOpenNotes(page, `${WEB}/admin/`, project);
    check(
      problems.length === 0,
      `${what}: the page of the plugin is drawn under the policy with no error: ${problems.join(' | ')}`,
    );
    await page.close();
  } finally {
    stop(program);
    await waitFor('The port to be free', async () => {
      try {
        await fetch(`${WEB}/health/ready`);
        return false;
      } catch {
        return true;
      }
    });
  }
}

/** What the Dockerfile of the project does after `bieberkit build`, without Docker. */
function imageFolder(root) {
  const out = join(WORK, 'image');
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
  for (const line of ["pnpm --recursive --filter './plugins/*' run build", 'node deploy/image.mjs /out'])
    check(dockerfile.includes(`RUN ${line}\n`), `the Dockerfile runs: ${line}`);
  run('pnpm', ['--recursive', '--filter', './plugins/*', 'run', 'build'], root);
  run('pnpm', ['deploy', '--filter=demo-server', '--prod', join(out, 'apps/server')], root);
  cpSync(join(root, 'bieberkit.config.ts'), join(out, 'bieberkit.config.ts'));
  cpSync(join(root, 'package.json'), join(out, 'package.json'));
  cpSync(join(root, 'migrations'), join(out, 'migrations'), { recursive: true });
  run(process.execPath, ['deploy/image.mjs', out], root);
  // The server holds no package of the screens, although the plugin of the project asks for them as optional peers.
  const installed = readdirSync(join(out, 'apps/server/node_modules/.pnpm'));
  const screens = installed.filter((folder) =>
    /^(react|react-dom|antd|@tanstack\+react-query|@bieberkit\+admin-antd)@/.test(folder),
  );
  check(screens.length === 0, `the server of the image holds no package of the screens: ${screens.join(', ')}`);
  cpSync(join(root, 'apps/admin/dist'), join(out, 'public/admin'), { recursive: true });
  return out;
}

async function main() {
  let browser;
  try {
    step('pack every package');
    const packs = packAll();
    check(packs.size > 20, `${packs.size} packages packed`);
    step(`create a project outside the repository, in ${WORK}`);
    const root = makeProject(packs);
    run('pnpm', ['install', '--reporter=silent'], root);
    check(true, 'the new project installs');
    const bieberkit = (...args) => run('pnpm', ['exec', 'bieberkit', ...args], root);
    step('make:plugin');
    process.stdout.write(bieberkit('make:plugin', PLUGIN));
    check(existsSync(join(root, 'plugins/notes/src/admin/index.ts')), 'the plugin has an admin part');
    step('migrate and seed');
    bieberkit('migrate:make');
    bieberkit('migrate');
    bieberkit('db:seed');
    check(true, 'the tables of the plugin are made and the administrator is seeded');
    step('the checks of the project');
    bieberkit('generate');
    const checked = bieberkit('check');
    check(!checked.includes('BK_LAYOUT_MISPLACED'), 'every file of the made plugin is in the folder of its kind');
    check(true, 'bieberkit check passes on the new project with its plugin');
    browser = await chromium.launch();
    await dev(root, browser);
    step('bieberkit build, and the web role');
    bieberkit('build');
    check(existsSync(join(root, 'apps/admin/dist/index.html')), 'the project builds, types checked, with its admin');
    await serveAndWalk(root, browser, root, 'from the project');
    step('the folder that the Dockerfile makes');
    await serveAndWalk(imageFolder(root), browser, root, 'from the folder of the image');
    process.stdout.write('\nThe acceptance of the author of a plugin passed.\n');
  } finally {
    for (const program of running) stop(program);
    await browser?.close();
    if (process.env.ACCEPTANCE_KEEP === '1') process.stdout.write(`Kept: ${WORK}\n`);
    else rmSync(WORK, { recursive: true, force: true });
  }
}

await main();
