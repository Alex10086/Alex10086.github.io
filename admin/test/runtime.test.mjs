import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { cookies, ENV, ORIGIN, TOKEN } from './github-fixture.mjs';

// Exercise native workerd fetch, not Node's more permissive Request implementation.
// Only the upstream host is replaced: all OAuth, cookie and API code is production code.
test('workerd completes OAuth and repository requests without forwarding credentials on redirects', { timeout: 60_000 }, async (t) => {
  let redirectAt = '';
  let trapRequests = 0;
  const received = [];
  const upstream = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://fixture.invalid').pathname;
    received.push(path);
    const stage = path === '/login/oauth/access_token' ? 'token' : path === '/user' ? 'user' : 'api';
    if (path === '/credential-trap') {
      trapRequests += 1;
      response.writeHead(500).end('Credentials must never arrive here');
      return;
    }
    if (redirectAt === stage) {
      response.writeHead(302, { Location: '/credential-trap' }).end();
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    let data;
    let status = 200;
    if (stage === 'token') {
      const form = new URLSearchParams(body);
      if (form.get('client_secret') !== ENV.GITHUB_CLIENT_SECRET || !form.get('code_verifier')) {
        status = 400;
        data = { error: 'Invalid fixture exchange' };
      } else data = { access_token: TOKEN, token_type: 'bearer', expires_in: 28800 };
    } else if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      status = 401;
      data = { error: 'Invalid fixture credentials' };
    } else if (stage === 'user') {
      data = { id: Number(ENV.ALLOWED_USER_ID), login: 'Alex10086', avatar_url: 'https://avatars.githubusercontent.com/u/39449451' };
    } else if (path.endsWith('/actions/workflows/deploy.yml/runs')) {
      data = { workflow_runs: [] };
    } else {
      status = 404;
      data = { error: 'Unexpected fixture endpoint' };
    }
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  let runtime;
  t.after(async () => {
    try { await runtime?.dispose(); } finally {
      upstream.closeAllConnections();
      await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    }
  });
  const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
  const bundled = await build({
    stdin: {
      contents: `import { createWorker } from '../worker/index.js';
        const worker = createWorker({ fetch(url, options) {
          const target = new URL(url);
          return fetch(${JSON.stringify(upstreamOrigin)} + target.pathname + target.search, options);
        }});
        export default { fetch(request) { return worker.fetch(request, ${JSON.stringify(ENV)}); } };`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      sourcefile: 'runtime-fixture.js',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  runtime = new Miniflare({ workers: [{ config: {
    name: 'admin-runtime-regression', compatibilityDate: '2026-10-16',
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: bundled.outputFiles[0].text } } },
  } }] });
  const request = (path, cookie) => runtime.dispatchFetch(`${ORIGIN}${path}`, {
    redirect: 'manual', headers: cookie ? { Cookie: cookie } : {},
  });
  async function login() {
    const start = await request('/auth/login');
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('Location')).searchParams.get('state');
    const cookie = cookies(start).find((value) => value.startsWith('__Host-blog_oauth=')).split(';')[0];
    return request(`/auth/callback?code=fixture-code&state=${encodeURIComponent(state)}`, cookie);
  }
  let sessionCookie;
  await t.test('successful login grants a usable session and repository API access', async () => {
    const callback = await login();
    assert.equal(callback.status, 303, await callback.clone().text());
    sessionCookie = cookies(callback).find((value) => value.startsWith('__Host-blog_admin=')).split(';')[0];
    const current = await (await request('/api/session', sessionCookie)).json();
    assert.equal(current.authenticated, true);
    assert.equal(current.user.login, 'Alex10086');
    assert.ok(!JSON.stringify(current).includes(TOKEN));
    const deployment = await request(`/api/deploy?commit=${'a'.repeat(40)}`, sessionCookie);
    assert.equal(deployment.status, 200);
    assert.deepEqual(await deployment.json(), { status: 'pending', url: null });
    assert.ok(received.some((path) => path.endsWith('/actions/workflows/deploy.yml/runs')));
  });
  for (const stage of ['token', 'user']) {
    await t.test(`${stage} endpoint redirect is rejected without creating a session`, async () => {
      redirectAt = stage;
      const callback = await login();
      assert.equal(callback.status, 502);
      assert.ok(!cookies(callback).some((value) => value.startsWith('__Host-blog_admin=')));
      assert.equal(trapRequests, 0);
      const error = await callback.json();
      assert.ok(!JSON.stringify(error).includes(ENV.GITHUB_CLIENT_SECRET));
      assert.ok(!JSON.stringify(error).includes(TOKEN));
    });
  }
  await t.test('repository redirect is rejected without sending the bearer token to its destination', async () => {
    redirectAt = 'api';
    const result = await request(`/api/deploy?commit=${'a'.repeat(40)}`, sessionCookie);
    assert.equal(result.status, 502);
    assert.equal(trapRequests, 0);
    assert.ok(!(await result.text()).includes(TOKEN));
  });
});
