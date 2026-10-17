export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const SESSION_COOKIE = '__Host-blog_admin';
export const STATE_COOKIE = '__Host-blog_oauth';
export const SESSION_SECONDS = 8 * 60 * 60;
const STATE_SECONDS = 10 * 60;
const encoder = new TextEncoder();

export function configuration(env) {
  const required = ['GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_BRANCH', 'SITE_URL', 'ALLOWED_USER_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET'];
  const missing = required.filter((key) => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new HttpError(503, `管理员尚未配置：请设置 ${missing.join('、')}。`);
  if (!/^[1-9]\d*$/.test(env.ALLOWED_USER_ID)) throw new HttpError(503, 'ALLOWED_USER_ID 必须是允许登录者的 GitHub 数字 ID。');
  if (!/^[a-f\d]{64}$/i.test(env.SESSION_SECRET)) throw new HttpError(503, 'SESSION_SECRET 必须是随机生成的 64 位十六进制密钥。');
  if (!/^[a-z\d][a-z\d-]*$/i.test(env.GITHUB_OWNER) || !/^[a-z\d_.-]+$/i.test(env.GITHUB_REPO) || ['.', '..'].includes(env.GITHUB_REPO)) {
    throw new HttpError(503, 'GitHub 仓库配置无效。');
  }
  const branch = env.GITHUB_BRANCH;
  if (!/^[a-z\d][a-z\d._/-]*$/i.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.split('/').some((part) => part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock'))) {
    throw new HttpError(503, 'GITHUB_BRANCH 配置无效。');
  }
  let site;
  try { site = new URL(env.SITE_URL); } catch { throw new HttpError(503, 'SITE_URL 必须是公开博客的 HTTPS 地址。'); }
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new HttpError(503, 'SITE_URL 必须是无凭据、查询或片段的 HTTPS 地址。');
  if (env.GITHUB_SCOPE && !['public_repo', 'repo'].includes(env.GITHUB_SCOPE)) throw new HttpError(503, 'GITHUB_SCOPE 仅支持 public_repo 或 repo。');
  return { ...env, SITE_URL: site.href.replace(/\/$/, '') };
}

export function base64(bytes) {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(result);
}

export function unbase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64url(bytes) { return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unbase64url(value) {
  if (!/^[a-z\d_-]+$/i.test(value)) throw new Error('Invalid encoding');
  return unbase64(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
}
export function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function pkceChallenge(verifier) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))); }

async function key(secret) {
  const bytes = Uint8Array.from(secret.match(/../g), (pair) => Number.parseInt(pair, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(payload, config, origin, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${purpose}:${origin}:v1`) }, await key(config.SESSION_SECRET), encoder.encode(JSON.stringify(payload)));
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
async function open(value, config, origin, purpose) {
  try {
    if (!value || value.length > 3900) return null;
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    const iv = unbase64url(parts[1]);
    if (iv.length !== 12) return null;
    const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${purpose}:${origin}:v1`) }, await key(config.SESSION_SECRET), unbase64url(parts[2]));
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
    if (!result || typeof result.exp !== 'number' || result.exp <= Date.now() || result.exp > Date.now() + SESSION_SECONDS * 1000 + 1000) return null;
    return result;
  } catch { return null; }
}
export function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export function clearCookie(name) { return cookie(name, '', 0); }
function readCookie(request, name) {
  const values = (request.headers.get('Cookie') || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}
export async function createOAuthState(config, origin) {
  const payload = { state: randomToken(), verifier: randomToken(), exp: Date.now() + STATE_SECONDS * 1000 };
  return { ...payload, cookie: cookie(STATE_COOKIE, await seal(payload, config, origin, 'oauth'), STATE_SECONDS) };
}
export async function consumeOAuthState(request, config, origin, supplied) {
  const state = await open(readCookie(request, STATE_COOKIE), config, origin, 'oauth');
  if (!state || typeof supplied !== 'string' || state.state !== supplied || typeof state.verifier !== 'string') throw new HttpError(403, '登录状态校验失败或已过期，请重新登录。');
  return state;
}
export async function createSession(config, origin, token, user) {
  const payload = { token, id: String(user.id), user: { login: user.login, avatar: user.avatar_url }, csrf: randomToken(), exp: Date.now() + SESSION_SECONDS * 1000 };
  const value = await seal(payload, config, origin, 'session');
  if (value.length > 3800) throw new HttpError(502, 'GitHub 会话过长，无法安全保存。');
  return cookie(SESSION_COOKIE, value, SESSION_SECONDS);
}
export async function session(request, config) {
  const value = await open(readCookie(request, SESSION_COOKIE), config, new URL(request.url).origin, 'session');
  if (!value || value.id !== config.ALLOWED_USER_ID || typeof value.token !== 'string' || !value.token || typeof value.csrf !== 'string' || !value.user || typeof value.user.login !== 'string' || typeof value.user.avatar !== 'string') return null;
  return value;
}
export function requireWrite(request, authenticated) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('X-CSRF-Token') !== authenticated.csrf) throw new HttpError(403, '请求来源或 CSRF 校验失败，请刷新后重试。');
}
export async function jsonBody(request, limit) {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, '请使用 application/json 请求。');
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new HttpError(413, '请求内容超过大小限制。');
  if (!request.body) throw new HttpError(400, '请求缺少 JSON 内容。');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, '请求内容超过大小限制。'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected object');
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON 内容或 UTF-8 编码无效。');
  } finally { reader.releaseLock(); }
}
export function secureResponse(response, request) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'");
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/auth/') || (headers.get('Content-Type') || '').includes('text/html')) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
