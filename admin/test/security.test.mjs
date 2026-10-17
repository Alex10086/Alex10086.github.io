import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, cookies, ENV, ORIGIN, POST, TOKEN, editedPost } from './github-fixture.mjs';

async function error(response, status) {
  assert.equal(response.status, status);
  const data = await response.json();
  assert.deepEqual(Object.keys(data), ['error']);
  assert.equal(typeof data.error, 'string');
  assert.ok(data.error.length);
  assert.ok(!data.error.includes(TOKEN));
  return data.error;
}

test('unconfigured API fails closed while static assets get restrictive security headers', async () => {
  const h = harness();
  const response = await h.request('/api/session', { environment: { ...h.env, GITHUB_CLIENT_ID: '' } });
  assert.match(await error(response, 503), /GITHUB_CLIENT_ID/);
  assert.equal(h.fixture.calls.length, 0);
  for (const key of ['ALLOWED_USER_ID', 'SESSION_SECRET', 'GITHUB_CLIENT_SECRET', 'GITHUB_OWNER']) {
    await error(await h.request('/api/posts', { environment: { ...h.env, [key]: '' } }), 503);
  }
  await error(await h.request('/api/session', { environment: { ...h.env, ALLOWED_USER_ID: 'fixture-admin' } }), 503);
  await error(await h.request('/api/session', { environment: { ...h.env, SESSION_SECRET: 'not-a-key' } }), 503);
  const page = await h.request('/', { environment: { ASSETS: h.env.ASSETS } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  const policy = page.headers.get('Content-Security-Policy');
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.ok(!policy.includes('unsafe-eval'));
  assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(page.headers.get('Strict-Transport-Security'), /max-age=/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('unauthenticated API reads and writes never reach GitHub', async () => {
  const h = harness();
  assert.deepEqual(await (await h.request('/api/session')).json(), { authenticated: false });
  for (const path of ['/api/posts', `/api/post?path=${encodeURIComponent(POST)}`, '/api/settings', `/api/deploy?commit=${'a'.repeat(40)}`]) {
    await error(await h.request(path), 401);
  }
  for (const [path, method] of [['/api/post', 'PUT'], ['/api/settings', 'PUT'], ['/api/taxonomy', 'POST'], ['/api/image', 'POST'], ['/auth/logout', 'POST']]) {
    await error(await h.request(path, { method, data: {} }), 401);
  }
  await error(await h.request('/api/posts', { environment: { ...h.env, TEST_AUTH: 'true', ADMIN_TOKEN: TOKEN } }), 401);
  assert.equal(h.fixture.calls.length, 0);
});

test('OAuth uses encrypted state, S256 PKCE, fixed callback and allowlisted numeric GitHub identity', async () => {
  const h = harness();
  const start = await h.beginLogin();
  assert.equal(start.location.origin, 'https://github.com');
  assert.equal(start.location.searchParams.get('redirect_uri'), `${ORIGIN}/auth/callback`);
  assert.equal(start.location.searchParams.get('scope'), 'public_repo');
  assert.equal(start.location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(start.location.searchParams.get('code_challenge').length, 43);
  assert.ok(!start.cookie.includes(start.state));
  const stateAttributes = cookies(start.response)[0];
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) assert.ok(stateAttributes.includes(flag));
  assert.ok(!stateAttributes.includes('Domain='));
  await error(await h.request(`/auth/callback?code=x&state=${start.state}`, { cookie: '' }), 403);
  const wrongState = await h.request('/auth/callback?code=x&state=wrong', { cookie: start.cookie });
  await error(wrongState, 403);
  assert.ok(cookies(wrongState).some((value) => value.startsWith('__Host-blog_oauth=;') && value.includes('Max-Age=0')));
  assert.equal(h.fixture.calls.filter((call) => call.url.includes('access_token')).length, 0);
  h.fixture.loginId = 1;
  const refused = await h.request(`/auth/callback?code=x&state=${start.state}`, { cookie: start.cookie });
  await error(refused, 403);
  assert.ok(!cookies(refused).some((value) => value.startsWith('__Host-blog_admin=')));
  assert.deepEqual(await (await h.request('/api/session')).json(), { authenticated: false });
});

test('sessions stay encrypted in host-only secure cookies and never expose access tokens', async () => {
  const h = harness();
  const result = await h.login();
  const cookie = cookies(result.callback).find((value) => value.startsWith('__Host-blog_admin='));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=28800']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('Domain='));
  assert.ok(!cookie.includes(TOKEN));
  assert.equal(result.callback.headers.get('Location'), '/');
  assert.equal(result.current.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Object.keys(result.data).sort(), ['authenticated', 'branch', 'csrf', 'repo', 'siteUrl', 'user'].sort());
  assert.equal(result.data.repo, 'Alex10086/Alex10086.github.io');
  assert.equal(result.data.branch, 'main');
  assert.equal(result.data.siteUrl, ENV.SITE_URL);
  assert.ok(!JSON.stringify(result.data).includes(TOKEN));
  assert.ok(!h.cookie.includes(result.data.csrf));
  const parts = h.cookie.split('.');
  parts[2] = `${parts[2].startsWith('A') ? 'B' : 'A'}${parts[2].slice(1)}`;
  assert.deepEqual(await (await h.request('/api/session', { cookie: parts.join('.') })).json(), { authenticated: false });
  assert.deepEqual(await (await h.request('/api/session', { environment: { ...h.env, ALLOWED_USER_ID: '1' } })).json(), { authenticated: false });
  const crossOrigin = await h.worker.fetch(new Request('https://other.example/api/session', { headers: { Cookie: h.cookie } }), h.env);
  assert.deepEqual(await crossOrigin.json(), { authenticated: false });
  const logout = await h.write('/auth/logout', {});
  assert.equal(logout.status, 200);
  assert.ok(cookies(logout).some((value) => value.startsWith('__Host-blog_admin=;') && value.includes('Max-Age=0')));
});

test('OAuth state and sessions expire instead of silently extending', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 16) });
  const h = harness();
  const start = await h.beginLogin();
  t.mock.timers.tick(601_000);
  await error(await h.request(`/auth/callback?code=x&state=${start.state}`, { cookie: start.cookie }), 403);
  await h.login();
  t.mock.timers.tick(8 * 60 * 60 * 1000 + 1);
  assert.deepEqual(await (await h.request('/api/session')).json(), { authenticated: false });
  await error(await h.request('/api/posts'), 401);
});

test('every write requires both exact same Origin and session CSRF, before network access', async () => {
  const h = harness();
  await h.login();
  h.fixture.calls.length = 0;
  const writes = [['/api/post', 'PUT'], ['/api/settings', 'PUT'], ['/api/taxonomy', 'POST'], ['/api/image', 'POST'], ['/auth/logout', 'POST']];
  for (const [path, method] of writes) {
    for (const headers of [{}, { Origin: ORIGIN }, { Origin: ORIGIN, 'X-CSRF-Token': 'wrong' }, { Origin: 'https://attacker.example', 'X-CSRF-Token': h.csrf }, { Origin: `${ORIGIN}:444`, 'X-CSRF-Token': h.csrf }]) {
      await error(await h.request(path, { method, data: {}, headers }), 403);
    }
  }
  assert.equal(h.fixture.calls.length, 0);
  await error(await h.request('/api/post', { method: 'PUT', rawBody: '{}', headers: { Origin: ORIGIN, 'X-CSRF-Token': h.csrf, 'Content-Type': 'text/plain' } }), 415);
  await error(await h.request('/api/post', { method: 'PUT', rawBody: '{', headers: { Origin: ORIGIN, 'X-CSRF-Token': h.csrf, 'Content-Type': 'application/json' } }), 400);
  assert.equal(h.fixture.calls.length, 0);
});

test('path traversal and arbitrary repository writes are rejected at the API boundary', async () => {
  const h = harness();
  await h.login();
  h.fixture.calls.length = 0;
  for (const path of ['README.md', '_config.yml', 'source/_drafts/private.md', 'source/_posts/../escape.md', 'source/_posts/a/../../escape.md', 'source/_posts//x.md', 'source/_posts/./x.md', 'source/_posts/hidden/.x.md', 'source/_posts/a\\x.md', 'source/_posts/%2e%2e/x.md', 'source/_posts/%252e%252e/x.md', 'source/_posts/x.md\0', 'source/_posts/x.md\n', 'source/_posts/x.txt']) {
    await error(await h.write('/api/post', editedPost(null, { path })), 400);
    await error(await h.request(`/api/post?path=${encodeURIComponent(path)}`), 400);
  }
  assert.equal(h.fixture.calls.length, 0);
  assert.equal(h.fixture.head, h.fixture.initialHead);
});

test('GitHub error payloads and tokens are not reflected to consumers', async () => {
  const h = harness();
  await h.login();
  h.fixture.apiFailure = 403;
  const limited = await h.request('/api/posts');
  await error(limited, 503);
  assert.equal(limited.headers.get('Cache-Control'), 'no-store');
  h.fixture.apiFailure = 401;
  await error(await h.request('/api/posts'), 401);
});
