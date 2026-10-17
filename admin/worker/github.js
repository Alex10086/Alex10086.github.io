import { HttpError } from './security.js';
import { MAX_POST_BYTES, blobSha, decodeBlob, isPostPath } from './content.js';

const BLOB_BATCH_SIZE = 40;
const MAX_BATCH_BYTES = 16 * 1024 * 1024;
const API = 'https://api.github.com';
const encoder = new TextEncoder();

export class GitHub {
  constructor(config, token, externalFetch) {
    this.config = config;
    this.token = token;
    this.fetch = externalFetch;
    this.base = `/repos/${encodeURIComponent(config.GITHUB_OWNER)}/${encodeURIComponent(config.GITHUB_REPO)}`;
    this.branch = config.GITHUB_BRANCH.split('/').map(encodeURIComponent).join('/');
    this.requests = 0;
  }
  async request(path, options = {}) {
    if (++this.requests > 49) throw new HttpError(422, '此次操作超过免费 Worker 的 GitHub 子请求上限，未继续写入。');
    let response;
    try {
      response = await this.fetch(`${API}${path}`, {
        method: options.method || 'GET', redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Hexo-Private-Admin',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch { throw new HttpError(502, '无法连接 GitHub，请稍后重试。'); }
    if (!response.ok) {
      if (response.status === 401) throw new HttpError(401, 'GitHub 登录凭据已失效，请退出后重新登录。');
      if (response.status === 403 || response.status === 429) throw new HttpError(503, 'GitHub 权限不足或请求额度已用尽，请检查 OAuth 权限并稍后重试。');
      if (options.conflict && [409, 422].includes(response.status)) throw new HttpError(409, '分支已有并发更改，未覆盖远程内容；请刷新后重试。');
      if (response.status === 404) throw new HttpError(404, 'GitHub 仓库、分支或文件不存在，或当前账号无访问权限。');
      throw new HttpError(502, `GitHub 操作失败（HTTP ${response.status}），未确认发布成功。`);
    }
    try { return await response.json(); } catch { throw new HttpError(502, 'GitHub 返回了无效响应。'); }
  }
  async head() {
    const result = await this.request(`${this.base}/git/ref/heads/${this.branch}`);
    if (result.object?.type !== 'commit' || !/^[a-f\d]{40}$/.test(result.object.sha)) throw new HttpError(502, 'GitHub 分支引用无效。');
    return result.object.sha;
  }
  async snapshot() {
    const commit = await this.head();
    const detail = await this.request(`${this.base}/git/commits/${commit}`);
    if (!/^[a-f\d]{40}$/.test(detail.tree?.sha)) throw new HttpError(502, 'GitHub 提交树无效。');
    const tree = await this.request(`${this.base}/git/trees/${detail.tree.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new HttpError(422, '仓库文件树被 GitHub 截断，无法安全列出或修改文章；请减小仓库后重试。');
    return { commit, tree: detail.tree.sha, files: new Map(tree.tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry])) };
  }
  posts(snapshot) {
    const posts = [...snapshot.files.values()].filter((entry) => isPostPath(entry.path));
    posts.forEach((entry) => this.regularFile(entry));
    return posts.sort((left, right) => left.path.localeCompare(right.path));
  }
  regularFile(entry) {
    if (!entry || !['100644', '100755'].includes(entry.mode) || !/^[a-f\d]{40}$/.test(entry.sha)) throw new HttpError(422, '目标不是普通文件，不能通过管理器编辑。');
    return entry;
  }
  file(snapshot, path) {
    const entry = snapshot.files.get(path);
    if (!entry) throw new HttpError(404, '文件不存在。');
    return this.regularFile(entry);
  }
  async text(entry) {
    this.regularFile(entry);
    if (entry.size != null && entry.size > 1024 * 1024) throw new HttpError(422, '文件超过 1 MiB，无法通过管理器编辑。');
    const result = await this.request(`${this.base}/git/blobs/${entry.sha}`);
    if (result.sha !== entry.sha) throw new HttpError(502, 'GitHub 文件 SHA 不匹配。');
    return decodeBlob(result);
  }
  async texts(entries) {
    entries.forEach((entry) => {
      this.regularFile(entry);
      if (entry.size > MAX_POST_BYTES) throw new HttpError(422, '文章超过 1 MiB，无法完整读取。');
    });
    const batches = Math.ceil(entries.length / BLOB_BATCH_SIZE);
    // Reserve four calls for a complete tree/commit/check/ref transaction.
    if (this.requests + batches + 4 > 49) throw new HttpError(422, '完整读取文章会超过免费 Worker 子请求上限，未提交任何更改。');
    const texts = new Map();
    let totalBytes = 0;
    for (let offset = 0; offset < entries.length; offset += BLOB_BATCH_SIZE) {
      const batch = entries.slice(offset, offset + BLOB_BATCH_SIZE);
      const fields = batch.map((entry, index) => `p${index}: object(oid: ${JSON.stringify(entry.sha)}) { ... on Blob { oid text isTruncated isBinary byteSize } }`).join('\n');
      const query = `query { repository(owner: ${JSON.stringify(this.config.GITHUB_OWNER)}, name: ${JSON.stringify(this.config.GITHUB_REPO)}) { ${fields} } }`;
      const result = await this.request('/graphql', { method: 'POST', body: { query } });
      if ((result.errors && (!Array.isArray(result.errors) || result.errors.length)) || !result.data?.repository) throw new HttpError(502, 'GitHub 批量读取失败，未提交任何更改。');
      for (let index = 0; index < batch.length; index++) {
        const blob = result.data.repository[`p${index}`];
        const entry = batch[index];
        if (!blob || blob.oid !== entry.sha || blob.isTruncated !== false || blob.isBinary !== false || typeof blob.text !== 'string' || !Number.isSafeInteger(blob.byteSize) || blob.byteSize < 0) throw new HttpError(422, 'GitHub 返回缺失、截断或非文本文章，未提交任何更改。');
        const size = encoder.encode(blob.text).byteLength;
        if (size !== blob.byteSize || size > MAX_POST_BYTES) throw new HttpError(422, '文章大小或 UTF-8 内容无效，未提交任何更改。');
        totalBytes += size;
        if (totalBytes > MAX_BATCH_BYTES) throw new HttpError(422, '文章文本总量超过免费管理器的 16 MiB 内存安全限制，未提交任何更改。');
        texts.set(entry.path, blob.text);
      }
    }
    return texts;
  }
  async commit(snapshot, changes, message) {
    if (!changes.length) return { commit: snapshot.commit, shas: new Map() };
    // A final head check plus a non-force update reject concurrent branch writes.
    // Orphan tree/commit objects from a losing transaction never publish.
    const entries = [];
    const shas = new Map();
    for (const change of changes) {
      const mode = snapshot.files.get(change.path)?.mode || '100644';
      if (change.content !== undefined) {
        entries.push({ path: change.path, type: 'blob', mode, content: change.content });
        shas.set(change.path, await blobSha(change.content));
      } else {
        entries.push({ path: change.path, type: 'blob', mode, sha: change.sha });
        shas.set(change.path, change.sha);
      }
    }
    const tree = await this.request(`${this.base}/git/trees`, { method: 'POST', body: { base_tree: snapshot.tree, tree: entries } });
    if (!/^[a-f\d]{40}$/.test(tree.sha)) throw new HttpError(502, 'GitHub 未返回有效的新文件树。');
    const commit = await this.request(`${this.base}/git/commits`, { method: 'POST', body: { message, tree: tree.sha, parents: [snapshot.commit] } });
    if (!/^[a-f\d]{40}$/.test(commit.sha)) throw new HttpError(502, 'GitHub 未返回有效的新提交。');
    if (await this.head() !== snapshot.commit) throw new HttpError(409, '分支已有并发更改，未覆盖远程内容；请刷新后重试。');
    const ref = await this.request(`${this.base}/git/refs/heads/${this.branch}`, { method: 'PATCH', conflict: true, body: { sha: commit.sha, force: false } });
    if (ref.object?.sha !== commit.sha) throw new HttpError(502, 'GitHub 未确认分支更新，请刷新检查发布结果。');
    return { commit: commit.sha, shas };
  }
  async upload(snapshot, path, data) {
    if (snapshot.files.has(path)) throw new HttpError(409, '图片路径已存在，请重新上传。');
    const blob = await this.request(`${this.base}/git/blobs`, { method: 'POST', body: { encoding: 'base64', content: data } });
    if (!/^[a-f\d]{40}$/.test(blob.sha)) throw new HttpError(502, 'GitHub 未返回有效的图片 SHA。');
    return this.commit(snapshot, [{ path, sha: blob.sha }], 'admin: upload public image');
  }
  async deploy(commit) {
    const query = new URLSearchParams({ head_sha: commit, branch: this.config.GITHUB_BRANCH, per_page: '100' });
    const result = await this.request(`${this.base}/actions/workflows/deploy.yml/runs?${query}`);
    if (!Array.isArray(result.workflow_runs)) throw new HttpError(502, 'GitHub 工作流响应无效。');
    const run = result.workflow_runs.find((entry) => entry.head_sha === commit && entry.head_branch === this.config.GITHUB_BRANCH);
    if (!run) return { status: 'pending', url: null };
    const status = run.status === 'completed' ? (run.conclusion === 'success' ? 'success' : 'failure') : run.status === 'in_progress' ? 'in_progress' : 'pending';
    let url = `https://github.com/${this.config.GITHUB_OWNER}/${this.config.GITHUB_REPO}/actions`;
    try { const candidate = new URL(run.html_url); if (candidate.protocol === 'https:' && candidate.hostname === 'github.com' && !candidate.username && !candidate.password) url = candidate.href; } catch { /* Use the fixed repository Actions link. */ }
    return { status, url };
  }
}
