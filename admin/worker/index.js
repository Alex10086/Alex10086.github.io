import {
  HttpError, SESSION_COOKIE, STATE_COOKIE, clearCookie, configuration, consumeOAuthState,
  createOAuthState, createSession, jsonBody, pkceChallenge, requireWrite, secureResponse, session,
} from './security.js';
import {
  MAX_IMAGE_BYTES, MAX_POST_BYTES, imageInput, postInput, postPath, postView, renameTaxonomy,
  settingsInput, settingsView, sha, taxonomyInput,
} from './content.js';
import { GitHub } from './github.js';

const SETTINGS_PATH = '_config.redefine.yml';
function json(data, status = 200) { return Response.json(data, { status }); }
function method(request, allowed) {
  if (!allowed.includes(request.method)) throw new HttpError(405, '不支持此请求方法。');
}
function expectedSha(input, entry) {
  sha(input, true);
  if ((entry?.sha || null) !== input) throw new HttpError(409, '文件已被更改或同名文章已存在；请刷新后重新确认，未覆盖远程文件。');
}
async function oauthFetch(externalFetch, url, options) {
  let result;
  try { result = await externalFetch(url, { ...options, redirect: 'manual' }); } catch { throw new HttpError(502, '无法连接 GitHub 登录服务，请重试。'); }
  if (!result.ok) throw new HttpError(502, 'GitHub 登录服务暂不可用，请重新登录。');
  try { return await result.json(); } catch { throw new HttpError(502, 'GitHub 登录响应无效。'); }
}

// Dependency injection is confined to the external HTTP boundary. Authentication
// always runs the real OAuth/cookie path, including in the Node fixture tests.
export function createWorker({ fetch: externalFetch = (...args) => globalThis.fetch(...args) } = {}) {
  async function route(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) {
      method(request, ['GET', 'HEAD']);
      if (!env.ASSETS?.fetch) throw new HttpError(503, '管理页面资源尚未部署，请先构建并部署管理器。');
      return env.ASSETS.fetch(request);
    }
    const config = configuration(env);
    if (path === '/auth/login') {
      method(request, ['GET']);
      const state = await createOAuthState(config, url.origin);
      const destination = new URL('https://github.com/login/oauth/authorize');
      destination.search = new URLSearchParams({
        client_id: config.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`,
        scope: config.GITHUB_SCOPE || 'public_repo', state: state.state,
        code_challenge: await pkceChallenge(state.verifier), code_challenge_method: 'S256',
      }).toString();
      return new Response(null, { status: 302, headers: { Location: destination.href, 'Set-Cookie': state.cookie } });
    }
    if (path === '/auth/callback') {
      method(request, ['GET']);
      const state = await consumeOAuthState(request, config, url.origin, url.searchParams.get('state'));
      const code = url.searchParams.get('code');
      if (url.searchParams.has('error') || !code || code.length > 512 || /[\x00-\x20\x7f]/.test(code)) throw new HttpError(400, 'GitHub 登录未获授权，请重新登录。');
      const token = await oauthFetch(externalFetch, 'https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Hexo-Private-Admin' },
        body: new URLSearchParams({ client_id: config.GITHUB_CLIENT_ID, client_secret: config.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/auth/callback`, code_verifier: state.verifier }).toString(),
      });
      if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 1600 || token.token_type?.toLowerCase() !== 'bearer') throw new HttpError(403, 'GitHub 未颁发有效访问令牌，请重新授权。');
      const user = await oauthFetch(externalFetch, 'https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Hexo-Private-Admin' } });
      if (String(user.id) !== config.ALLOWED_USER_ID || !Number.isSafeInteger(user.id) || typeof user.login !== 'string' || typeof user.avatar_url !== 'string') throw new HttpError(403, '此 GitHub 账号不在管理员数字 ID 允许名单中。');
      const headers = new Headers({ Location: '/' });
      headers.append('Set-Cookie', clearCookie(STATE_COOKIE));
      headers.append('Set-Cookie', await createSession(config, url.origin, token.access_token, user));
      return new Response(null, { status: 303, headers });
    }
    const authenticated = await session(request, config);
    if (path === '/api/session') {
      method(request, ['GET']);
      return json(authenticated ? {
        authenticated: true, user: authenticated.user, csrf: authenticated.csrf,
        repo: `${config.GITHUB_OWNER}/${config.GITHUB_REPO}`, branch: config.GITHUB_BRANCH, siteUrl: config.SITE_URL,
      } : { authenticated: false });
    }
    if (!authenticated) throw new HttpError(401, '请先使用允许的 GitHub 账号登录。');
    if (!['GET', 'HEAD'].includes(request.method)) requireWrite(request, authenticated);
    if (path === '/auth/logout') {
      method(request, ['POST']);
      await jsonBody(request, 1024);
      return new Response(JSON.stringify({ authenticated: false }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': clearCookie(SESSION_COOKIE) } });
    }
    const github = new GitHub(config, authenticated.token, externalFetch);
    if (path === '/api/posts') {
      method(request, ['GET']);
      const snapshot = await github.snapshot();
      const entries = github.posts(snapshot);
      const texts = await github.texts(entries);
      const posts = entries.map((entry) => {
        const { path: post, sha: blob, title, date, tags, categories } = postView(entry.path, entry.sha, texts.get(entry.path));
        return { path: post, sha: blob, title, date, tags, categories };
      });
      return json({ posts });
    }
    if (path === '/api/post') {
      method(request, ['GET', 'PUT']);
      if (request.method === 'GET') {
        const selected = postPath(url.searchParams.get('path'));
        const snapshot = await github.snapshot();
        const entry = github.file(snapshot, selected);
        return json(postView(selected, entry.sha, await github.text(entry)));
      }
      const input = await jsonBody(request, MAX_POST_BYTES + 64 * 1024);
      const selected = postPath(input.path);
      sha(input.sha, true);
      const snapshot = await github.snapshot();
      const entry = snapshot.files.get(selected);
      if (entry) github.regularFile(entry);
      expectedSha(input.sha, entry);
      const content = postInput(input, entry ? await github.text(entry) : null);
      const result = await github.commit(snapshot, [{ path: selected, content }], entry ? 'admin: update post' : 'admin: publish post');
      return json({ commit: result.commit, path: selected, sha: result.shas.get(selected) });
    }
    if (path === '/api/settings') {
      method(request, ['GET', 'PUT']);
      const input = request.method === 'PUT' ? await jsonBody(request, 8192) : null;
      if (input) sha(input.sha);
      const snapshot = await github.snapshot();
      const entry = github.file(snapshot, SETTINGS_PATH);
      if (input) expectedSha(input.sha, entry);
      const original = await github.text(entry);
      if (!input) return json(settingsView(entry.sha, original));
      const content = settingsInput(input, original);
      const result = await github.commit(snapshot, [{ path: SETTINGS_PATH, content }], 'admin: update home banner');
      return json({ commit: result.commit, sha: result.shas.get(SETTINGS_PATH) });
    }
    if (path === '/api/image') {
      method(request, ['POST']);
      const image = imageInput(await jsonBody(request, Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4096));
      const selected = `source/images/uploads/${image.filename}`;
      const snapshot = await github.snapshot();
      const result = await github.upload(snapshot, selected, image.data);
      return json({ url: `${config.SITE_URL}/images/uploads/${image.filename}`, commit: result.commit });
    }
    if (path === '/api/taxonomy') {
      method(request, ['POST']);
      const input = taxonomyInput(await jsonBody(request, 4096));
      const snapshot = await github.snapshot();
      const entries = github.posts(snapshot);
      const texts = await github.texts(entries);
      const changes = entries.map((entry) => {
        const content = renameTaxonomy(texts.get(entry.path), input);
        return content === null ? null : { path: entry.path, content };
      }).filter(Boolean);
      const result = await github.commit(snapshot, changes, `admin: rename ${input.kind}`);
      return json({ commit: result.commit, count: changes.length });
    }
    if (path === '/api/deploy') {
      method(request, ['GET']);
      return json(await github.deploy(sha(url.searchParams.get('commit'))));
    }
    throw new HttpError(404, '接口不存在。');
  }
  return {
    async fetch(request, env) {
      let response;
      try { response = await route(request, env); } catch (error) {
        response = json({ error: error instanceof HttpError ? error.message : '管理员服务发生内部错误，请稍后重试。' }, error instanceof HttpError ? error.status : 500);
        if (new URL(request.url).pathname === '/auth/callback') response.headers.append('Set-Cookie', clearCookie(STATE_COOKIE));
      }
      return secureResponse(response, request);
    },
  };
}

export default createWorker();
