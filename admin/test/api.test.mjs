import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { readPost } from '../worker/content.js';
import { harness, POST, BODY, ORIGINAL_POST, ORIGINAL_CONFIG, editedPost, gitSha } from './github-fixture.mjs';

const parseYaml = (text) => yaml.load(text, { schema: yaml.JSON_SCHEMA });
async function failure(response, status) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  return body.error;
}
async function article(h) {
  const response = await h.request(`/api/post?path=${encodeURIComponent(POST)}`);
  assert.equal(response.status, 200);
  return response.json();
}
function unchangedPrivateFiles(h, originalReadme, originalDraft) {
  assert.equal(h.fixture.text('README.md'), originalReadme);
  assert.equal(h.fixture.text('source/_drafts/private.md'), originalDraft);
}

test('post listing includes only published Markdown and preserves date and category paths', async () => {
  const h = harness();
  await h.login();
  const response = await h.request('/api/posts');
  assert.equal(response.status, 200);
  const { posts } = await response.json();
  assert.equal(posts.length, 3);
  assert.ok(posts.every((post) => post.path.startsWith('source/_posts/') && post.path.endsWith('.md')));
  const post = posts.find((item) => item.path === POST);
  assert.equal(post.date, '2026-10-09 10:47:32');
  assert.deepEqual(post.categories, [['旧分类', '子类'], ['新分类', '子类'], ['别的分类', '旧分类']]);
  assert.deepEqual(post.tags, ['旧标签', '新标签', '保留']);
  assert.deepEqual(Object.keys(post).sort(), ['path', 'sha', 'title', 'date', 'tags', 'categories'].sort());
  const selected = await article(h);
  assert.equal(selected.body, BODY);
  assert.equal(selected.description, '摘要');
});

test('editing a post preserves unexposed metadata, date strings and unrelated repository files', async () => {
  const h = harness();
  await h.login();
  const old = await article(h);
  const readme = h.fixture.text('README.md');
  const draft = h.fixture.text('source/_drafts/private.md');
  const input = editedPost(old.sha);
  const response = await h.write('/api/post', input);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.path, POST);
  assert.equal(result.commit, h.fixture.head);
  assert.equal(result.sha, gitSha(h.fixture.text(POST)));
  assert.deepEqual(h.fixture.commits.get(result.commit).parents, [h.fixture.initialHead]);
  const written = readPost(h.fixture.text(POST));
  const original = readPost(ORIGINAL_POST).metadata;
  assert.equal(written.metadata.title, input.title);
  assert.equal(written.metadata.date, input.date);
  assert.equal(written.metadata.updated, original.updated);
  assert.equal(written.metadata.math, true);
  assert.deepEqual(written.metadata.custom, original.custom);
  assert.deepEqual(written.metadata.categories, input.categories);
  assert.equal(written.body, input.body);
  unchangedPrivateFiles(h, readme, draft);
  const update = h.fixture.calls.find((call) => call.method === 'PATCH');
  assert.deepEqual(JSON.parse(update.body), { sha: result.commit, force: false });
  assert.equal(h.fixture.treeWrites, 1);
  assert.equal(h.fixture.refWrites, 1);
});

test('new post publishes only an explicitly selected post path and cannot overwrite an existing file', async () => {
  const h = harness();
  await h.login();
  const freshPath = 'source/_posts/中文/new-entry.md';
  const input = editedPost(null, { path: freshPath });
  const created = await h.write('/api/post', input);
  assert.equal(created.status, 200);
  const result = await created.json();
  assert.equal(result.path, freshPath);
  assert.equal(result.sha, gitSha(h.fixture.text(freshPath)));
  assert.equal((await h.request('/api/posts')).status, 200);
  const savedHead = h.fixture.head;
  await failure(await h.write('/api/post', input), 409);
  await failure(await h.write('/api/post', editedPost(null)), 409);
  await failure(await h.write('/api/post', editedPost('a'.repeat(40), { path: 'source/_posts/missing.md' })), 409);
  assert.equal(h.fixture.head, savedHead);
  assert.equal(h.fixture.treeWrites, 1);
});

test('stale SHA fails without writing and explicit local dates and category shape are validated', async () => {
  const h = harness();
  await h.login();
  const post = await article(h);
  await failure(await h.write('/api/post', editedPost('a'.repeat(40))), 409);
  for (const overrides of [
    { title: '   ' }, { date: '2026-10-16T09:08:07Z' }, { date: '2026-02-29 09:08:07' },
    { date: '2026-13-01 09:08:07' }, { date: '2026-10-01 24:00:00' }, { tags: '标签' },
    { categories: ['单层', ['混合路径']] }, { categories: [[]] }, { body: null },
  ]) await failure(await h.write('/api/post', editedPost(post.sha, overrides)), 400);
  assert.equal(h.fixture.head, h.fixture.initialHead);
  assert.equal(h.fixture.treeWrites, 0);
  const leap = await h.write('/api/post', editedPost(post.sha, { date: '2028-02-29 23:59:59' }));
  assert.equal(leap.status, 200);
  assert.equal(readPost(h.fixture.text(POST)).metadata.date, '2028-02-29 23:59:59');
});

test('branch changes during tree construction or final ref update yield 409, never a forced overwrite', async (t) => {
  for (const race of ['advanceDuringCommit', 'advanceBeforeRefUpdate']) {
    await t.test(race, async () => {
      const h = harness();
      await h.login();
      const post = await article(h);
      h.fixture[race] = true;
      await failure(await h.write('/api/post', editedPost(post.sha)), 409);
      assert.equal(h.fixture.head, h.fixture.concurrentHead);
      assert.equal(h.fixture.text(POST), ORIGINAL_POST);
      assert.ok(h.fixture.calls.filter((call) => call.method === 'PATCH').every((call) => JSON.parse(call.body).force === false));
    });
  }
});

test('settings touch only the two background fields and require the current SHA', async () => {
  const h = harness();
  await h.login();
  const get = await h.request('/api/settings');
  assert.equal(get.status, 200);
  const old = await get.json();
  assert.deepEqual({ light: old.light, dark: old.dark }, { light: '/images/light.webp', dark: '/images/dark.webp' });
  await failure(await h.write('/api/settings', { ...old, sha: 'a'.repeat(40) }), 409);
  for (const url of ['//attacker.example/x.png', 'javascript:alert(1)', 'data:image/png;base64,eA==', 'http://insecure.example/x.png', '/\\attacker.example/x.png', '/%2fattacker.example/x.png', 'https://user:password@example.com/x.png']) {
    await failure(await h.write('/api/settings', { ...old, light: url }), 400);
  }
  assert.equal(h.fixture.treeWrites, 0);
  const updated = await h.write('/api/settings', { sha: old.sha, light: 'https://images.example/light.webp?v=2', dark: '/images/new-dark.webp' });
  assert.equal(updated.status, 200);
  const result = await updated.json();
  const expected = parseYaml(ORIGINAL_CONFIG);
  expected.home_banner.image.light = 'https://images.example/light.webp?v=2';
  expected.home_banner.image.dark = '/images/new-dark.webp';
  assert.deepEqual(parseYaml(h.fixture.text('_config.redefine.yml')), expected);
  assert.equal(result.commit, h.fixture.head);
  assert.equal(result.sha, gitSha(h.fixture.text('_config.redefine.yml')));
  assert.equal(h.fixture.text(POST), ORIGINAL_POST);
});

test('category batch rename is atomic, exact, recursive and deduplicates without flattening paths', async () => {
  const h = harness();
  await h.login();
  const before = readPost(ORIGINAL_POST);
  const response = await h.write('/api/taxonomy', { kind: 'categories', from: '旧分类', to: '新分类' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.count, 2);
  assert.equal(result.commit, h.fixture.head);
  assert.equal(h.fixture.treeWrites, 1);
  assert.equal(h.fixture.refWrites, 1);
  const after = readPost(h.fixture.text(POST));
  assert.deepEqual(after.metadata.categories, [['新分类', '子类'], ['别的分类', '新分类']]);
  assert.equal(after.body, before.body);
  const expected = { ...before.metadata, categories: after.metadata.categories };
  assert.deepEqual(after.metadata, expected);
  assert.deepEqual(readPost(h.fixture.text('source/_posts/second.md')).metadata.categories, ['新分类', '旧分类的后缀']);
  assert.equal(readPost(h.fixture.text('source/_posts/scalar.md')).metadata.categories, '保留分类');
  assert.equal(h.fixture.text('_config.redefine.yml'), ORIGINAL_CONFIG);
  const treeCall = h.fixture.calls.find((call) => call.method === 'POST' && new URL(call.url).pathname.endsWith('/git/trees'));
  assert.equal(JSON.parse(treeCall.body).tree.length, 2);
  assert.ok(JSON.parse(treeCall.body).tree.every((entry) => typeof entry.content === 'string'));
});

test('tag renaming deduplicates exact values; no-op and invalid operations never create commits', async () => {
  const h = harness();
  await h.login();
  const response = await h.write('/api/taxonomy', { kind: 'tags', from: '旧标签', to: '新标签' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).count, 2);
  assert.deepEqual(readPost(h.fixture.text(POST)).metadata.tags, ['新标签', '保留']);
  assert.deepEqual(readPost(h.fixture.text('source/_posts/second.md')).metadata.tags, ['新标签', '旧标签的后缀']);
  const unchangedHead = h.fixture.head;
  const noMatch = await h.write('/api/taxonomy', { kind: 'tags', from: '不存在', to: '另一个' });
  assert.deepEqual(await noMatch.json(), { commit: unchangedHead, count: 0 });
  for (const input of [{ kind: 'title', from: 'x', to: 'y' }, { kind: 'tags', from: '', to: 'y' }, { kind: 'tags', from: 'x', to: ' ' }, { kind: 'tags', from: 'x', to: 'x' }]) {
    await failure(await h.write('/api/taxonomy', input), 400);
  }
  assert.equal(h.fixture.head, unchangedHead);
  assert.equal(h.fixture.treeWrites, 1);
});

test('taxonomy conflict never partially publishes a batch', async () => {
  const h = harness();
  await h.login();
  h.fixture.advanceBeforeRefUpdate = true;
  await failure(await h.write('/api/taxonomy', { kind: 'tags', from: '旧标签', to: '新标签' }), 409);
  assert.equal(h.fixture.head, h.fixture.concurrentHead);
  assert.equal(h.fixture.text(POST), ORIGINAL_POST);
  assert.ok(h.fixture.text('source/_posts/second.md').includes('tags: [旧标签, 旧标签的后缀]'));
});

test('batched GraphQL supports growing blogs without partial results and keeps writes within free-tier requests', async () => {
  const growing = harness({ posts: 85 });
  await growing.login();
  growing.fixture.calls.length = 0;
  const listing = await growing.request('/api/posts');
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).posts.length, 85);
  assert.equal(growing.fixture.calls.filter((call) => new URL(call.url).pathname === '/graphql').length, 3);
  growing.fixture.calls.length = 0;
  const renamed = await growing.write('/api/taxonomy', { kind: 'tags', from: '保留', to: '新的' });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).count, 84);
  assert.equal(growing.fixture.calls.length, 10);
  assert.equal(growing.fixture.treeWrites, 1);
  assert.equal(growing.fixture.refWrites, 1);
  const currentSize = harness({ posts: 15 });
  await currentSize.login();
  currentSize.fixture.calls.length = 0;
  const response = await currentSize.write('/api/taxonomy', { kind: 'tags', from: '保留', to: '新的' });
  assert.equal(response.status, 200);
  assert.equal(currentSize.fixture.calls.length, 8);
});

test('truncated trees and missing, partial, binary or truncated GraphQL results fail before all writes', async (t) => {
  for (const flag of ['truncated', 'graphqlErrors', 'graphqlPartial', 'graphqlMissingBlob', 'graphqlTruncated', 'graphqlBinary', 'graphqlWrongSha', 'graphqlWrongSize']) {
    await t.test(flag, async () => {
      const h = harness();
      await h.login();
      h.fixture[flag] = true;
      const status = ['graphqlErrors', 'graphqlPartial'].includes(flag) ? 502 : 422;
      await failure(await h.request('/api/posts'), status);
      await failure(await h.write('/api/taxonomy', { kind: 'tags', from: '旧标签', to: '新的' }), status);
      assert.equal(h.fixture.treeWrites, 0);
      assert.equal(h.fixture.head, h.fixture.initialHead);
    });
  }
});

test('image upload checks decoded size and file magic and immediately commits only a unique public upload', async () => {
  const h = harness();
  await h.login();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6j0AAAAASUVORK5CYII=';
  for (const input of [
    { name: 'x.svg', mime: 'image/svg+xml', data: png },
    { name: 'x.png', mime: 'constructor', data: png },
    { name: 'x.png', mime: '__proto__', data: png },
    { name: '../x.png', mime: 'image/png', data: png },
    { name: 'x.png', mime: 'image/png', data: Buffer.from('<script>alert(1)</script>').toString('base64') },
    { name: 'x.jpg', mime: 'image/jpeg', data: png },
    { name: 'x.png', mime: 'image/png', data: 'data:image/png;base64,' + png },
  ]) await failure(await h.write('/api/image', input), 400);
  assert.equal(h.fixture.treeWrites, 0);
  const tooLarge = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
  await failure(await h.write('/api/image', { name: 'large.png', mime: 'image/png', data: tooLarge }), 413);
  const urls = new Set();
  for (let index = 0; index < 2; index++) {
    const response = await h.write('/api/image', { name: 'same-name.png', mime: 'image/png', data: png });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.url, /^https:\/\/alex10086\.github\.io\/images\/uploads\/same-name-[a-f\d-]+\.png$/);
    urls.add(result.url);
    const path = `source${new URL(result.url).pathname}`;
    const file = h.fixture.currentFiles().get(path);
    assert.ok(file, 'The upload is in the public Git branch, not private draft storage');
    assert.equal(h.fixture.blobs.get(file.sha).toString('base64'), png);
    assert.equal(result.commit, h.fixture.head);
  }
  assert.equal(urls.size, 2);
  assert.equal(h.fixture.text(POST), ORIGINAL_POST);
  assert.equal(h.fixture.text('_config.redefine.yml'), ORIGINAL_CONFIG);
});

test('deployment status requires a matching deploy.yml run and completed success, not merely a commit', async () => {
  const h = harness();
  await h.login();
  const commit = h.fixture.initialHead;
  const endpoint = `/api/deploy?commit=${commit}`;
  assert.deepEqual(await (await h.request(endpoint)).json(), { status: 'pending', url: null });
  const url = 'https://github.com/Alex10086/Alex10086.github.io/actions/runs/123';
  for (const [status, conclusion, expected] of [['queued', null, 'pending'], ['in_progress', null, 'in_progress'], ['in_progress', 'success', 'in_progress'], ['completed', 'success', 'success'], ['completed', 'failure', 'failure'], ['completed', 'cancelled', 'failure'], ['completed', null, 'failure']]) {
    h.fixture.runs = [{ head_sha: commit, head_branch: 'main', status, conclusion, html_url: url }];
    assert.deepEqual(await (await h.request(endpoint)).json(), { status: expected, url });
  }
  h.fixture.runs = [{ head_sha: 'a'.repeat(40), head_branch: 'main', status: 'completed', conclusion: 'success', html_url: url }];
  assert.deepEqual(await (await h.request(endpoint)).json(), { status: 'pending', url: null });
  h.fixture.runs = [{ head_sha: commit, head_branch: 'other', status: 'completed', conclusion: 'success', html_url: url }];
  assert.deepEqual(await (await h.request(endpoint)).json(), { status: 'pending', url: null });
  await failure(await h.request('/api/deploy?commit=not-a-sha'), 400);
});

test('malformed or cyclic frontmatter aborts the whole taxonomy transaction', async () => {
  const h = harness();
  await h.login();
  const broken = '---\ntitle: Broken\ndate: 2026-10-09 10:47:32\ntags: [旧标签]\ncustom: &loop\n  self: *loop\n---\nKeep body\n';
  const entry = h.fixture.currentFiles().get(POST);
  const value = Buffer.from(broken);
  const sha = gitSha(value);
  h.fixture.blobs.set(sha, value);
  h.fixture.currentFiles().set(POST, { ...entry, sha, size: value.length });
  await failure(await h.write('/api/taxonomy', { kind: 'tags', from: '旧标签', to: '新的' }), 422);
  assert.equal(h.fixture.treeWrites, 0);
  assert.equal(h.fixture.head, h.fixture.initialHead);
});
