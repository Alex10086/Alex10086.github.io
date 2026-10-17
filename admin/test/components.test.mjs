import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { readPost } from '../worker/content.js';
import {
  harness, gitSha, ORIGIN, POST, ORIGINAL_CONFIG, ORIGINAL_SITE_CONFIG,
  ORIGINAL_LAB, ORIGINAL_ABOUT, ORIGINAL_LINKS_PAGE, ORIGINAL_LINKS, PAGE_BODY,
} from './github-fixture.mjs';

const parseYaml = (text) => yaml.load(text, { schema: yaml.JSON_SCHEMA });
const LAB = 'source/lab/index.md';
const ABOUT = 'source/about/index.md';
const LINKS = 'source/_data/links.yml';
const LINKS_PAGE = 'source/links/index.md';
const CONFIG = '_config.yml';
const THEME = '_config.redefine.yml';
async function get(h, path) {
  const response = await h.request(path);
  assert.equal(response.status, 200);
  return response.json();
}
async function failure(response, status) {
  assert.equal(response.status, status);
  const data = await response.json();
  assert.deepEqual(Object.keys(data), ['error']);
  assert.equal(typeof data.error, 'string');
}
function files(h) {
  return new Map([...h.fixture.currentFiles().keys()].map((path) => [path, h.fixture.text(path)]));
}
function untouched(h, before, allowed = []) {
  assert.deepEqual([...h.fixture.currentFiles().keys()], [...before.keys()]);
  for (const [path, text] of before) if (!allowed.includes(path)) assert.equal(h.fixture.text(path), text, path);
}
function noWrites(h) {
  assert.equal(h.fixture.treeWrites, 0);
  assert.equal(h.fixture.refWrites, 0);
  assert.equal(h.fixture.commits.size, 1);
  assert.equal(h.fixture.head, h.fixture.initialHead);
}
function replaceFile(h, path, text) {
  const entry = h.fixture.currentFiles().get(path);
  const value = Buffer.from(text);
  const sha = gitSha(value);
  h.fixture.blobs.set(sha, value);
  h.fixture.currentFiles().set(path, { ...entry, sha, size: value.length });
}
function changedSite(original, overrides = {}) {
  return {
    ...original, title: '新的站点', subtitle: '新的浏览器副标题', description: '新的描述', author: '新的作者',
    signature: ' 学习者 \n\n 实践者 ', announcement: '新的侧栏公告', welcomeTitle: '你好，欢迎。',
    welcomeLines: ['保持好奇', '认真记录'], hitokotoEnabled: true, ...overrides,
  };
}
function latestTreePaths(h) {
  const call = h.fixture.calls.filter((entry) => entry.method === 'POST' && new URL(entry.url).pathname.endsWith('/git/trees')).at(-1);
  return JSON.parse(call.body).tree.map((entry) => entry.path).sort();
}

test('fixed lab/about editors preserve all metadata and exact Markdown bodies', async (t) => {
  for (const [id, path, original] of [['lab', LAB, ORIGINAL_LAB], ['about', ABOUT, ORIGINAL_ABOUT]]) {
    await t.test(id, async () => {
      const h = harness();
      await h.login();
      const before = files(h);
      const page = await get(h, `/api/page?id=${id}`);
      assert.deepEqual(page, { id, sha: gitSha(original), title: id === 'lab' ? '实验室' : '关于', body: PAGE_BODY });
      const body = '\n# 新正文\r\n\r\n$$ x^2 $$\r\n\r\n```js\r\nconst x = 2;\r\n```\r\n';
      const response = await h.write('/api/page', { ...page, title: '新页面标题', body, path: 'README.md' });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual(result, { commit: h.fixture.head, id, sha: gitSha(h.fixture.text(path)) });
      const expected = readPost(original).metadata;
      expected.title = '新页面标题';
      assert.deepEqual(readPost(h.fixture.text(path)), { metadata: expected, body });
      assert.deepEqual(await get(h, `/api/page?id=${id}`), { id, sha: result.sha, title: '新页面标题', body });
      assert.deepEqual(latestTreePaths(h), [path]);
      untouched(h, before, [path]);
      assert.equal(h.fixture.refWrites, 1);
      assert.equal((await get(h, '/api/posts')).posts.length, 3, 'component fixture files must never become posts');
    });
  }
});

test('page whitelist, current SHA, required fields and UTF-8 total size reject without commits', async () => {
  const h = harness();
  await h.login();
  const before = files(h);
  const page = await get(h, '/api/page?id=lab');
  for (const id of ['', 'links', '../about', 'source/about/index.md', '__proto__', 'constructor', '/about', 'LAB']) {
    await failure(await h.request(`/api/page?id=${encodeURIComponent(id)}`), 400);
    await failure(await h.write('/api/page', { ...page, id }), 400);
  }
  await failure(await h.request('/api/page?path=source/about/index.md'), 400);
  for (const change of [{ sha: null }, { sha: 'bad' }, { id: 1 }, { title: '' }, { title: ' '.repeat(3) }, { title: 'x'.repeat(301) }, { body: null }, { body: 'a\0b' }]) {
    await failure(await h.write('/api/page', { ...page, ...change }), 400);
  }
  await failure(await h.write('/api/page', { ...page, sha: 'a'.repeat(40) }), 409);
  await failure(await h.write('/api/page', { ...page, body: 'x'.repeat(1024 * 1024 - 10) }), 413);
  await failure(await h.write('/api/page', { ...page, body: '汉'.repeat(400000) }), 413);
  noWrites(h);
  untouched(h, before);
});

test('links roundtrip retains extensions and friends-page metadata/body while publishing both files atomically', async () => {
  const h = harness();
  await h.login();
  const before = files(h);
  const data = await get(h, '/api/links');
  assert.deepEqual(data, { sha: gitSha(ORIGINAL_LINKS), pageSha: gitSha(ORIGINAL_LINKS_PAGE), title: '链接', groups: parseYaml(ORIGINAL_LINKS) });
  const groups = structuredClone(data.groups).reverse();
  groups[1].links_category = '新的分组';
  groups[1].list[0] = { ...groups[1].list[0], name: '新的卡片', link: 'https://example.com/?a=1&b=2', description: '新的描述', avatar: '' };
  groups[1].list.push({ name: '站内页面', link: '/about/?from=links', avatar: 'https://images.example/avatar.webp', description: '', thumbnail: '', retained: [1, true, null] });
  groups.push({ links_category: '空分组', has_thumbnail: false, list: [], retained: '保留' });
  const response = await h.write('/api/links', { ...data, title: '朋友与项目', groups, path: 'README.md' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { commit: h.fixture.head, sha: gitSha(h.fixture.text(LINKS)), pageSha: gitSha(h.fixture.text(LINKS_PAGE)) });
  assert.deepEqual(parseYaml(h.fixture.text(LINKS)), groups);
  assert.deepEqual(readPost(h.fixture.text(LINKS_PAGE)), {
    metadata: { ...readPost(ORIGINAL_LINKS_PAGE).metadata, title: '朋友与项目' }, body: PAGE_BODY,
  });
  assert.deepEqual(await get(h, '/api/links'), { sha: result.sha, pageSha: result.pageSha, title: '朋友与项目', groups });
  assert.deepEqual(latestTreePaths(h), [LINKS, LINKS_PAGE].sort());
  assert.equal(h.fixture.refWrites, 1);
  untouched(h, before, [LINKS, LINKS_PAGE]);
});

test('links support deleting all groups and retaining an empty cards array', async () => {
  const h = harness();
  await h.login();
  let data = await get(h, '/api/links');
  let response = await h.write('/api/links', { ...data, groups: [{ links_category: '空分组', has_thumbnail: true, list: [] }] });
  assert.equal(response.status, 200);
  data = await get(h, '/api/links');
  assert.deepEqual(data.groups, [{ links_category: '空分组', has_thumbnail: true, list: [] }]);
  response = await h.write('/api/links', { ...data, groups: [] });
  assert.equal(response.status, 200);
  assert.deepEqual((await get(h, '/api/links')).groups, []);
  assert.deepEqual(parseYaml(h.fixture.text(LINKS)), []);
  assert.equal(readPost(h.fixture.text(LINKS_PAGE)).metadata.type, 'friends');
  assert.equal(readPost(h.fixture.text(LINKS_PAGE)).body, PAGE_BODY);
});

test('both links file versions are checked before any tree write', async () => {
  const h = harness();
  await h.login();
  const before = files(h);
  const data = await get(h, '/api/links');
  for (const change of [{ sha: 'a'.repeat(40) }, { pageSha: 'b'.repeat(40) }]) {
    await failure(await h.write('/api/links', { ...data, ...change, title: '不得发布' }), 409);
  }
  for (const change of [{ sha: null }, { pageSha: null }, { pageSha: 'bad' }]) {
    await failure(await h.write('/api/links', { ...data, ...change }), 400);
  }
  noWrites(h);
  untouched(h, before);
});

test('link and image URL safety, shapes, plain text and size bounds fail without writes', async () => {
  const h = harness();
  await h.login();
  const before = files(h);
  const data = await get(h, '/api/links');
  const cardInput = (change, hasThumbnail = false) => ({ ...data, groups: [{ ...data.groups[0], has_thumbnail: hasThumbnail, list: [{ ...data.groups[0].list[0], ...change }] }] });
  const unsafe = ['javascript:alert(1)', 'data:text/html,x', '//evil.example/x', '/%2fevil.example/x', '/%5cevil.example/x', '/\\evil.example/x', 'https://user:pass@example.com/x', 'https://example.com/\nx', '/x%0ay', '/x%7fy', 'https://example.com/has space', 'ftp://example.com/x', '/bad%zz'];
  for (const url of unsafe) {
    await failure(await h.write('/api/links', cardInput({ link: url })), 400);
    await failure(await h.write('/api/links', cardInput({ avatar: url })), 400);
    await failure(await h.write('/api/links', cardInput({ thumbnail: url }, true)), 400);
  }
  for (const field of ['avatar', 'thumbnail']) await failure(await h.write('/api/links', cardInput({ [field]: 'http://images.example/x' }, field === 'thumbnail')), 400);
  for (const change of [{ name: '' }, { name: 'x'.repeat(201) }, { name: '<img>' }, { description: '<script>bad</script>' }, { description: 'x'.repeat(1001) }, { link: '' }, { avatar: null }]) {
    await failure(await h.write('/api/links', cardInput(change)), 400);
  }
  await failure(await h.write('/api/links', cardInput({ thumbnail: '' }, true)), 400);
  await failure(await h.write('/api/links', cardInput({}, true)), 400);
  const invalidGroups = [null, {}, [null], [{ ...data.groups[0], links_category: '' }], [{ ...data.groups[0], links_category: '<b>heading</b>' }], [{ ...data.groups[0], has_thumbnail: 'false' }], [{ ...data.groups[0], list: {} }], [{ ...data.groups[0], list: [null] }], Array.from({ length: 51 }, () => ({ links_category: '组', has_thumbnail: false, list: [] })), [{ ...data.groups[0], list: Array.from({ length: 501 }, () => data.groups[0].list[0]) }]];
  for (const groups of invalidGroups) await failure(await h.write('/api/links', { ...data, groups }), 400);
  await failure(await h.write('/api/links', { ...data, title: '' }), 400);
  noWrites(h);
  untouched(h, before);
});

test('HTTP(S), Unicode and root-relative links plus optional empty images are accepted', async () => {
  const h = harness();
  await h.login();
  const data = await get(h, '/api/links');
  const urls = ['http://example.com/path', 'https://example.com/?a=1&b=2#part', '/about/', '/中文路径/', 'https://example.com/hello%20world'];
  const groups = [{ links_category: '合法链接', has_thumbnail: false, list: urls.map((link) => ({ name: '链接', link, avatar: '', description: '纯文本 & 引号 " 安全显示', thumbnail: '' })) }];
  const response = await h.write('/api/links', { ...data, groups });
  assert.equal(response.status, 200);
  assert.deepEqual((await get(h, '/api/links')).groups, groups);
});

test('site text updates exact Hexo/Redefine fields, preserving every unrelated setting', async () => {
  const h = harness();
  await h.login();
  const before = files(h);
  const old = await get(h, '/api/site');
  assert.deepEqual(old, {
    shas: { config: gitSha(ORIGINAL_SITE_CONFIG), theme: gitSha(ORIGINAL_CONFIG) }, title: '原始站点', subtitle: '原始副标题',
    description: '原始描述', author: '原始作者', signature: '原始签名\n第二行', announcement: '原始公告',
    welcomeTitle: '原始欢迎', welcomeLines: ['保持不变'], hitokotoEnabled: false,
  });
  const input = changedSite(old);
  const response = await h.write('/api/site', input);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { commit: h.fixture.head, shas: { config: gitSha(h.fixture.text(CONFIG)), theme: gitSha(h.fixture.text(THEME)) } });
  const config = parseYaml(ORIGINAL_SITE_CONFIG);
  Object.assign(config, { title: input.title, subtitle: input.subtitle, description: input.description, author: input.author });
  const theme = parseYaml(ORIGINAL_CONFIG);
  Object.assign(theme.info, { title: input.title, subtitle: input.subtitle, author: input.author });
  theme.global.open_graph.description = input.description;
  Object.assign(theme.articles.author_label, { auto: false, enable: true, list: ['学习者', '实践者'] });
  theme.home.sidebar.announcement = input.announcement;
  theme.home_banner.title = input.welcomeTitle;
  theme.home_banner.subtitle.text = input.welcomeLines;
  theme.home_banner.subtitle.hitokoto.enable = true;
  assert.deepEqual(parseYaml(h.fixture.text(CONFIG)), config);
  assert.deepEqual(parseYaml(h.fixture.text(THEME)), theme);
  assert.deepEqual(await get(h, '/api/site'), { ...input, signature: '学习者\n实践者', shas: result.shas });
  assert.deepEqual(latestTreePaths(h), [CONFIG, THEME].sort());
  assert.equal(h.fixture.refWrites, 1);
  untouched(h, before, [CONFIG, THEME]);
});

test('empty site optional text hides announcements, manual labels and custom rotating lines', async () => {
  const h = harness();
  await h.login();
  const old = await get(h, '/api/site');
  const input = changedSite(old, { subtitle: '', description: '', signature: '\n  \n', announcement: '', welcomeLines: [], hitokotoEnabled: false });
  assert.equal((await h.write('/api/site', input)).status, 200);
  const theme = parseYaml(h.fixture.text(THEME));
  assert.equal(theme.home.sidebar.announcement, null);
  assert.deepEqual(theme.articles.author_label, { enable: false, auto: false, list: [], retained: true });
  assert.deepEqual(theme.home_banner.subtitle.text, []);
  assert.equal(theme.home_banner.subtitle.hitokoto.api, 'https://v1.hitokoto.cn');
  assert.equal(theme.home_banner.subtitle.hitokoto.show_author, true);
  const current = await get(h, '/api/site');
  assert.equal(current.signature, '');
  assert.equal(current.announcement, '');
});

test('site validation rejects markup, invalid shapes and either stale version without commits', async () => {
  const h = harness();
  await h.login();
  const before = files(h);
  const old = await get(h, '/api/site');
  for (const field of ['title', 'subtitle', 'description', 'author', 'signature', 'announcement', 'welcomeTitle']) {
    for (const value of ['<img src=x onerror=alert(1)>', 'text > text', 'bad\u0001text', null]) {
      await failure(await h.write('/api/site', changedSite(old, { [field]: value })), 400);
    }
  }
  for (const change of [{ title: '' }, { author: ' ' }, { welcomeTitle: '' }, { title: 'x'.repeat(301) }, { author: 'x'.repeat(301) }, { subtitle: 'x'.repeat(1001) }, { welcomeTitle: 'x'.repeat(1001) }, { description: 'x'.repeat(5001) }, { signature: 'x'.repeat(5001) }, { announcement: 'x'.repeat(5001) }, { welcomeLines: '<b>bad</b>' }, { welcomeLines: ['<b>bad</b>'] }, { welcomeLines: [1] }, { welcomeLines: ['x'.repeat(1001)] }, { welcomeLines: Array(101).fill('line') }, { hitokotoEnabled: 'true' }, { shas: null }, { shas: { config: null, theme: old.shas.theme } }]) {
    await failure(await h.write('/api/site', changedSite(old, change)), 400);
  }
  for (const key of ['config', 'theme']) await failure(await h.write('/api/site', changedSite(old, { shas: { ...old.shas, [key]: 'a'.repeat(40) } })), 409);
  noWrites(h);
  untouched(h, before);
});

test('background then site rejects stale theme SHA and refreshed site preserves the latest images', async () => {
  const h = harness();
  await h.login();
  const site = await get(h, '/api/site');
  const background = await get(h, '/api/settings');
  assert.equal((await h.write('/api/settings', { ...background, light: '/images/new-light.webp', dark: 'https://images.example/new-dark.webp' })).status, 200);
  const head = h.fixture.head;
  const theme = h.fixture.text(THEME);
  await failure(await h.write('/api/site', changedSite(site)), 409);
  assert.equal(h.fixture.head, head);
  assert.equal(h.fixture.treeWrites, 1);
  assert.equal(h.fixture.refWrites, 1);
  assert.equal(h.fixture.text(THEME), theme);
  assert.equal(h.fixture.text(CONFIG), ORIGINAL_SITE_CONFIG);
  const refreshed = await get(h, '/api/site');
  assert.equal((await h.write('/api/site', changedSite(refreshed))).status, 200);
  assert.deepEqual(parseYaml(h.fixture.text(THEME)).home_banner.image, { light: '/images/new-light.webp', dark: 'https://images.example/new-dark.webp', retained: 'yes' });
});

test('site then background rejects stale settings SHA and refreshed settings preserve all latest text', async () => {
  const h = harness();
  await h.login();
  const background = await get(h, '/api/settings');
  const site = changedSite(await get(h, '/api/site'));
  assert.equal((await h.write('/api/site', site)).status, 200);
  const head = h.fixture.head;
  const config = h.fixture.text(CONFIG);
  const themeBefore = h.fixture.text(THEME);
  await failure(await h.write('/api/settings', { ...background, light: '/images/new.webp' }), 409);
  assert.equal(h.fixture.head, head);
  assert.equal(h.fixture.treeWrites, 1);
  assert.equal(h.fixture.refWrites, 1);
  assert.equal(h.fixture.text(THEME), themeBefore);
  const refreshed = await get(h, '/api/settings');
  assert.equal((await h.write('/api/settings', { ...refreshed, light: '/images/new.webp', dark: '/images/dark-new.webp' })).status, 200);
  const expected = parseYaml(themeBefore);
  expected.home_banner.image.light = '/images/new.webp';
  expected.home_banner.image.dark = '/images/dark-new.webp';
  assert.deepEqual(parseYaml(h.fixture.text(THEME)), expected);
  assert.equal(h.fixture.text(CONFIG), config);
  const current = await get(h, '/api/site');
  assert.equal(current.title, site.title);
  assert.equal(current.welcomeTitle, site.welcomeTitle);
  assert.deepEqual(current.welcomeLines, site.welcomeLines);
});

test('missing optional theme maps use defaults and preserve existing unrelated data', async () => {
  const h = harness();
  await h.login();
  replaceFile(h, THEME, 'home_banner:\n  image: {light: /light.webp, dark: /dark.webp}\nplugins: {music: true}\n');
  const old = await get(h, '/api/site');
  assert.equal(old.title, '原始站点');
  assert.equal(old.welcomeTitle, '原始描述');
  assert.equal(old.signature, '');
  assert.equal(old.announcement, '');
  assert.deepEqual(old.welcomeLines, []);
  assert.equal(old.hitokotoEnabled, false);
  assert.equal((await h.write('/api/site', changedSite(old))).status, 200);
  const theme = parseYaml(h.fixture.text(THEME));
  assert.deepEqual(theme.plugins, { music: true });
  assert.deepEqual(theme.home_banner.image, { light: '/light.webp', dark: '/dark.webp' });
});

test('malformed existing configuration maps are never silently replaced', async (t) => {
  const invalid = [
    ['info'], ['global'], ['global', 'open_graph'], ['home'], ['home', 'sidebar'],
    ['home_banner'], ['home_banner', 'subtitle'], ['home_banner', 'subtitle', 'hitokoto'], ['articles'], ['articles', 'author_label'],
  ];
  for (const path of invalid) {
    await t.test(path.join('.'), async () => {
      const h = harness();
      await h.login();
      const old = await get(h, '/api/site');
      const data = parseYaml(ORIGINAL_CONFIG);
      let parent = data;
      for (const key of path.slice(0, -1)) parent = parent[key];
      parent[path.at(-1)] = null;
      const malformed = yaml.dump(data, { schema: yaml.JSON_SCHEMA });
      replaceFile(h, THEME, malformed);
      await failure(await h.request('/api/site'), 422);
      const shas = { ...old.shas, theme: gitSha(malformed) };
      await failure(await h.write('/api/site', changedSite(old, { shas })), 422);
      noWrites(h);
      assert.equal(h.fixture.text(THEME), malformed);
      assert.equal(h.fixture.text(CONFIG), ORIGINAL_SITE_CONFIG);
    });
  }
});

test('all component transactions reject branch races without partially publishing files', async (t) => {
  for (const route of ['/api/page', '/api/links', '/api/site']) {
    for (const race of ['advanceDuringCommit', 'advanceBeforeRefUpdate']) {
      await t.test(`${route} ${race}`, async () => {
        const h = harness();
        await h.login();
        const before = files(h);
        const data = await get(h, route === '/api/page' ? '/api/page?id=lab' : route);
        const input = route === '/api/site' ? changedSite(data) : { ...data, title: '不应发布' };
        h.fixture[race] = true;
        await failure(await h.write(route, input), 409);
        assert.equal(h.fixture.head, h.fixture.concurrentHead);
        untouched(h, before);
        assert.ok(h.fixture.calls.filter((call) => call.method === 'PATCH').every((call) => JSON.parse(call.body).force === false));
      });
    }
  }
});

test('new routes enforce authentication, exact write Origin and CSRF before repository access', async (t) => {
  for (const route of ['/api/page', '/api/links', '/api/site']) {
    await t.test(route, async () => {
      const h = harness();
      const readPath = route === '/api/page' ? `${route}?id=lab` : route;
      await failure(await h.request(readPath, { cookie: '' }), 401);
      await failure(await h.request(route, { method: 'PUT', cookie: '', data: {} }), 401);
      assert.equal(h.fixture.calls.length, 0);
      await h.login();
      const callCount = h.fixture.calls.length;
      await failure(await h.request(route, { method: 'PUT', data: {}, headers: { Origin: ORIGIN } }), 403);
      await failure(await h.request(route, { method: 'PUT', data: {}, headers: { 'X-CSRF-Token': h.csrf } }), 403);
      await failure(await h.request(route, { method: 'PUT', data: {}, headers: { Origin: 'https://attacker.example', 'X-CSRF-Token': h.csrf } }), 403);
      await failure(await h.write(route, {}, { method: 'POST' }), 405);
      assert.equal(h.fixture.calls.length, callCount);
      noWrites(h);
    });
  }
});
