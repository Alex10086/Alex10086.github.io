import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/index.js';

export const ORIGIN = 'https://admin.example';
export const TOKEN = 'fixture-oauth-token-not-for-the-browser';
export const ENV = Object.freeze({
  GITHUB_OWNER: 'Alex10086', GITHUB_REPO: 'Alex10086.github.io', GITHUB_BRANCH: 'main',
  SITE_URL: 'https://alex10086.github.io', ALLOWED_USER_ID: '39449451',
  GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret', SESSION_SECRET: '12'.repeat(32),
});
export const POST = 'source/_posts/nested/article.md';
export const BODY = '\n# 原始正文\r\n\r\n$$ x^2 $$\r\n';
export const ORIGINAL_POST = `---\ntitle: 原始标题\ndate: 2026-10-09 10:47:32\nupdated: 2026-10-10 11:12:13\ndescription: 摘要\ntags: [旧标签, 新标签, 保留]\ncategories:\n  - [旧分类, 子类]\n  - [新分类, 子类]\n  - [别的分类, 旧分类]\nmath: true\ncustom:\n  toc: false\n  options: [一, 二]\n---\n${BODY}`;
export const ORIGINAL_CONFIG = `home_banner:\n  enable: true\n  image:\n    light: /images/light.webp\n    dark: /images/dark.webp\n    retained: yes\n  subtitle:\n    text: [保持不变]\nfooter:\n  runtime: true\n  custom: 2026-10-01 00:00:00\n`;
export function gitSha(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const hash = (value) => createHash('sha1').update(value).digest('hex');
function response(data, status = 200) { return Response.json(data, { status }); }

export class GitHubFixture {
  constructor({ posts = 3 } = {}) {
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.calls = [];
    this.runs = [];
    this.loginId = Number(ENV.ALLOWED_USER_ID);
    this.treeWrites = 0;
    this.refWrites = 0;
    this.sequence = 0;
    const files = new Map();
    const add = (path, text, mode = '100644') => {
      const sha = gitSha(text); this.blobs.set(sha, Buffer.from(text));
      files.set(path, { path, mode, type: 'blob', sha, size: Buffer.byteLength(text) });
    };
    add(POST, ORIGINAL_POST);
    if (posts > 1) add('source/_posts/second.md', '---\ntitle: 第二篇\ndate: 2026-01-01 01:02:03\ntags: [旧标签, 旧标签的后缀]\ncategories: [旧分类, 旧分类的后缀]\nmath: false\n---\n\n不改正文\n');
    if (posts > 2) add('source/_posts/scalar.md', '---\ntitle: 标量分类\ndate: 2026-01-01 01:02:03\ntags: 保留\ncategories: 保留分类\n---\n标量正文\n');
    for (let index = 3; index < posts; index++) add(`source/_posts/post-${index}.md`, `---\ntitle: Post ${index}\ndate: 2026-01-01 01:02:03\ntags: [保留]\ncategories: []\n---\nContent ${index}\n`);
    add('_config.redefine.yml', ORIGINAL_CONFIG);
    add('README.md', 'Do not change this file.\n');
    add('source/_drafts/private.md', '---\ntitle: 本地以外的旧草稿\n---\nNever list or edit.\n');
    const tree = hash('initial tree');
    this.trees.set(tree, files);
    this.head = hash('initial commit');
    this.commits.set(this.head, { sha: this.head, tree: { sha: tree }, parents: [] });
    this.initialHead = this.head;
  }
  newHash(label) { return hash(`${label}:${++this.sequence}`); }
  currentFiles() { return this.trees.get(this.commits.get(this.head).tree.sha); }
  text(path) { return this.blobs.get(this.currentFiles().get(path).sha).toString('utf8'); }
  advanceBranch() {
    this.concurrentHead = this.newHash('concurrent commit');
    const parent = this.head;
    this.commits.set(this.concurrentHead, { sha: this.concurrentHead, tree: this.commits.get(parent).tree, parents: [parent] });
    this.head = this.concurrentHead;
  }
  async fetch(input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = options.method || 'GET';
    this.calls.push({ url: url.href, method, headers: options.headers, body: options.body });
    if (url.href === 'https://github.com/login/oauth/access_token') {
      assert.equal(method, 'POST');
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('client_secret'), ENV.GITHUB_CLIENT_SECRET);
      assert.equal(body.get('redirect_uri'), `${ORIGIN}/auth/callback`);
      assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), this.challenge, 'OAuth PKCE verifier must match');
      return response({ access_token: TOKEN, token_type: 'bearer' });
    }
    assert.equal(url.origin, 'https://api.github.com', 'No arbitrary external destinations');
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    if (url.pathname === '/user') return response({ id: this.loginId, login: 'fixture-admin', avatar_url: 'https://avatars.githubusercontent.com/u/39449451' });
    if (this.apiFailure) return response({ message: `Never leak upstream body: ${TOKEN}` }, this.apiFailure);
    if (url.pathname === '/graphql') {
      assert.equal(method, 'POST');
      const { query } = JSON.parse(options.body);
      assert.ok(query.includes(`repository(owner: "${ENV.GITHUB_OWNER}", name: "${ENV.GITHUB_REPO}")`));
      const aliases = [...query.matchAll(/p(\d+): object\(oid: "([a-f\d]{40})"\)/g)];
      assert.ok(aliases.length > 0 && aliases.length <= 40);
      if (this.graphqlErrors) return response({ errors: [{ message: 'Fixture GraphQL failure' }], data: { repository: null } });
      const repository = {};
      for (const [, index, oid] of aliases) {
        const bytes = this.blobs.get(oid);
        repository[`p${index}`] = this.graphqlMissingBlob && index === '0' ? null : {
          oid: this.graphqlWrongSha ? '0'.repeat(40) : oid,
          text: bytes.toString('utf8'), byteSize: bytes.length + (this.graphqlWrongSize ? 1 : 0),
          isBinary: Boolean(this.graphqlBinary), isTruncated: Boolean(this.graphqlTruncated),
        };
      }
      return response({ data: { repository }, ...(this.graphqlPartial ? { errors: [{ message: 'One field failed' }] } : {}) });
    }
    const base = `/repos/${ENV.GITHUB_OWNER}/${ENV.GITHUB_REPO}`;
    assert.ok(url.pathname.startsWith(`${base}/`), 'All GitHub access must use configured repository');
    const path = url.pathname.slice(base.length);
    const body = options.body ? JSON.parse(options.body) : null;
    if (path === '/git/ref/heads/main') return response({ object: { type: 'commit', sha: this.head } });
    if (path.startsWith('/git/commits/') && method === 'GET') return response(this.commits.get(path.split('/').at(-1)));
    if (path.startsWith('/git/trees/') && method === 'GET') {
      assert.equal(url.searchParams.get('recursive'), '1');
      return response({ tree: [...this.trees.get(path.split('/').at(-1)).values()], truncated: Boolean(this.truncated) });
    }
    if (path.startsWith('/git/blobs/') && method === 'GET') {
      const sha = path.split('/').at(-1);
      const bytes = this.blobs.get(sha);
      return response({ sha, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') });
    }
    if (path === '/git/blobs' && method === 'POST') {
      assert.equal(body.encoding, 'base64');
      const bytes = Buffer.from(body.content, 'base64');
      const sha = gitSha(bytes); this.blobs.set(sha, bytes);
      return response({ sha }, 201);
    }
    if (path === '/git/trees' && method === 'POST') {
      this.treeWrites++;
      assert.ok(body.base_tree && this.trees.has(body.base_tree), 'Tree must preserve the complete existing repository');
      const files = new Map(this.trees.get(body.base_tree));
      for (const item of body.tree) {
        assert.equal(item.type, 'blob');
        assert.ok(['100644', '100755'].includes(item.mode));
        let sha = item.sha;
        if (item.content !== undefined) { sha = gitSha(item.content); this.blobs.set(sha, Buffer.from(item.content)); }
        assert.ok(this.blobs.has(sha));
        files.set(item.path, { path: item.path, mode: item.mode, type: 'blob', sha, size: this.blobs.get(sha).length });
      }
      const sha = this.newHash('tree'); this.trees.set(sha, files);
      return response({ sha }, 201);
    }
    if (path === '/git/commits' && method === 'POST') {
      assert.equal(body.parents.length, 1, 'No root or merge replacement commits');
      const sha = this.newHash('commit');
      this.commits.set(sha, { sha, tree: { sha: body.tree }, parents: body.parents });
      if (this.advanceDuringCommit) { this.advanceDuringCommit = false; this.advanceBranch(); }
      return response({ sha }, 201);
    }
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      this.refWrites++;
      assert.equal(body.force, false, 'Never overwrite a concurrent branch');
      if (this.advanceBeforeRefUpdate) { this.advanceBeforeRefUpdate = false; this.advanceBranch(); }
      if (!this.commits.get(body.sha).parents.includes(this.head)) return response({ message: 'Update is not a fast forward' }, 422);
      this.head = body.sha;
      return response({ object: { sha: this.head, type: 'commit' } });
    }
    if (path === '/actions/workflows/deploy.yml/runs') {
      assert.equal(url.searchParams.get('branch'), 'main');
      return response({ workflow_runs: this.runs });
    }
    throw new Error(`Unexpected fixture request ${method} ${url.href}`);
  }
}

export function harness(options) {
  const fixture = new GitHubFixture(options);
  const worker = createWorker({ fetch: fixture.fetch.bind(fixture) });
  const env = { ...ENV, ASSETS: { fetch: async () => new Response('<!doctype html><h1>Admin</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) } };
  let sessionCookie;
  let csrf;
  const request = (path, { method = 'GET', data, cookie = sessionCookie, headers = {}, rawBody, environment = env } = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(data !== undefined ? { body: JSON.stringify(data) } : rawBody !== undefined ? { body: rawBody } : {}),
  }), environment);
  async function beginLogin() {
    const response = await request('/auth/login', { cookie: '' });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('Location'));
    fixture.challenge = location.searchParams.get('code_challenge');
    const stateCookie = cookies(response).find((cookie) => cookie.startsWith('__Host-blog_oauth=')).split(';')[0];
    return { response, location, state: location.searchParams.get('state'), cookie: stateCookie };
  }
  async function login() {
    const start = await beginLogin();
    const callback = await request(`/auth/callback?code=fixture-code&state=${encodeURIComponent(start.state)}`, { cookie: start.cookie });
    assert.equal(callback.status, 303);
    sessionCookie = cookies(callback).find((cookie) => cookie.startsWith('__Host-blog_admin=')).split(';')[0];
    const current = await request('/api/session');
    const data = await current.json();
    assert.equal(data.authenticated, true);
    csrf = data.csrf;
    return { callback, current, data, cookie: sessionCookie };
  }
  async function write(path, data, options = {}) {
    return request(path, { method: path === '/api/post' || path === '/api/settings' ? 'PUT' : 'POST', data, headers: { Origin: ORIGIN, 'X-CSRF-Token': csrf, ...options.headers }, ...options });
  }
  return { fixture, worker, env, request, write, login, beginLogin, get cookie() { return sessionCookie; }, get csrf() { return csrf; } };
}
export function cookies(response) {
  return response.headers.getSetCookie ? response.headers.getSetCookie() : (response.headers.get('Set-Cookie') || '').split(/,\s*(?=__Host-)/);
}
export function editedPost(sha, overrides = {}) {
  return { path: POST, sha, title: '修改后的标题', date: '2026-10-16 09:08:07', description: '新的摘要', tags: ['新标签'], categories: [['新分类', '子类'], ['另一分类']], body: '\n# 更新正文\n\n$ x^2 $\n', ...overrides };
}
