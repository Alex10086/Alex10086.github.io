import './app.css';
import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

const $ = (id) => document.getElementById(id);
const fields = ['title', 'path', 'date', 'description', 'tags', 'categories', 'body'];
const state = {
  session: null, posts: [], view: 'editor', editor: null, editorBaseline: null,
  settings: null, settingsBaseline: null, busy: false, disabled: [], previewTimer: null,
  deploy: null, deployTimer: null, deployGeneration: 0,
};
const markdown = new MarkdownIt({
  html: true, breaks: false, linkify: true, typographer: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      try { return hljs.highlight(code, { language, ignoreIllegals: true }).value; } catch { /* Escaped fallback below. */ }
    }
    return '';
  },
}).use(markdownItKatex, { throwOnError: false, errorColor: '#b42318' });

function notice(message, type = 'info', login = false) {
  const node = $('notice');
  node.replaceChildren();
  node.className = `notice ${type}`;
  const text = document.createElement('span');
  text.textContent = message;
  node.append(text);
  if (login) {
    const link = document.createElement('a');
    link.href = '/auth/login';
    link.textContent = '重新登录';
    link.addEventListener('click', (event) => {
      if (!canLeave()) event.preventDefault();
    });
    node.append(link);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'notice-close';
  close.setAttribute('aria-label', '关闭消息');
  close.textContent = '×';
  close.addEventListener('click', () => { node.hidden = true; });
  node.append(close);
  node.hidden = false;
}

function report(error) {
  const suffix = error.status === 409 ? ' 请先保存本地草稿，再重新打开文章或刷新设置，合并最新内容后重试。不会强制覆盖远端修改。' : '';
  notice(`${error.message}${suffix}`, 'error', error.status === 401);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      headers: {
        Accept: 'application/json',
        ...(options.method && options.method !== 'GET' ? {
          'Content-Type': 'application/json', 'X-CSRF-Token': state.session?.csrf || '',
        } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('无法连接工作台服务。请检查网络和 Worker 部署，然后重试。');
  }
  let data;
  try { data = await response.json(); } catch {
    throw new Error(`服务返回了非 JSON 响应（HTTP ${response.status}）。请检查 Worker 路由和部署配置。`);
  }
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : `请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function setBusy(busy) {
  state.busy = busy;
  $('workspace').setAttribute('aria-busy', String(busy));
  if (busy) {
    state.disabled = [...$('workspace').querySelectorAll('button, input, textarea, select')].filter((element) => !element.disabled);
    state.disabled.forEach((element) => { element.disabled = true; });
  } else {
    state.disabled.forEach((element) => { element.disabled = false; });
    state.disabled = [];
  }
}

async function action(fn) {
  if (state.busy) return;
  setBusy(true);
  try { await fn(); } catch (error) { report(error); } finally { setBusy(false); }
}

function rawEditor() {
  return Object.fromEntries(fields.map((field) => [field, $(`post-${field}`).value]));
}
function editorDirty() {
  return state.editor !== null && state.editorBaseline !== JSON.stringify(rawEditor());
}
function rawSettings() {
  return { light: $('background-light').value, dark: $('background-dark').value };
}
function settingsDirty() {
  return state.settings !== null && state.settingsBaseline !== JSON.stringify(rawSettings());
}
function anyDirty() { return editorDirty() || settingsDirty(); }

function canLeave() {
  if (state.busy) {
    notice('正在保存或加载，请等待完成后再操作。');
    return false;
  }
  return !anyDirty() || window.confirm('有尚未提交的修改。继续会丢弃这些修改。建议先“保存本地草稿”（背景设置不支持本地草稿）。确定继续？');
}

function discardChanges() {
  if (state.editor) state.editor.sha = state.editor.loadedSha;
  if (editorDirty() && state.editorBaseline) fillEditor(JSON.parse(state.editorBaseline), false);
  if (settingsDirty() && state.settingsBaseline) {
    const saved = JSON.parse(state.settingsBaseline);
    $('background-light').value = saved.light;
    $('background-dark').value = saved.dark;
    updateBackground('light');
    updateBackground('dark');
  }
  updateDirty();
}

function updateDirty() {
  $('dirty-state').textContent = editorDirty() ? '有未提交的修改' : '与已加载内容一致';
  $('dirty-state').classList.toggle('unsaved', editorDirty());
  $('settings-state').textContent = settingsDirty() ? '有未保存的背景修改' : '背景设置与已加载内容一致';
}

function showView(view) {
  state.view = view;
  for (const name of ['editor', 'settings', 'taxonomy']) {
    $(`${name}-view`).hidden = name !== view;
    $(`nav-${name}`).classList.toggle('active', name === view);
    $(`nav-${name}`).setAttribute('aria-current', name === view ? 'page' : 'false');
  }
  $('page-title').textContent = { editor: '文章写作', settings: '首页背景', taxonomy: '标签与分类' }[view];
}

async function navigate(view) {
  if (view === state.view) return;
  if (!canLeave()) return;
  await action(async () => {
    if (view === 'settings') await loadSettings();
    discardChanges();
    if (view === 'taxonomy') renderTaxonomy();
    showView(view);
  });
}

function flattenNames(value) {
  if (!Array.isArray(value)) return [];
  return value.flat(Infinity).filter((item) => typeof item === 'string');
}

function renderPosts() {
  const query = $('post-search').value.trim().toLocaleLowerCase();
  const matches = state.posts.filter((post) => [post.title, post.path, ...flattenNames(post.tags), ...flattenNames(post.categories)].join(' ').toLocaleLowerCase().includes(query));
  $('post-count').textContent = String(state.posts.length);
  $('posts-status').textContent = query ? `找到 ${matches.length} 篇文章` : `共 ${state.posts.length} 篇已提交文章`;
  const fragment = document.createDocumentFragment();
  for (const post of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'post-item';
    button.classList.toggle('selected', post.path === state.editor?.path);
    button.dataset.path = post.path;
    const title = document.createElement('strong');
    title.textContent = post.title || post.path;
    const meta = document.createElement('span');
    meta.textContent = post.date || '未设置日期';
    const path = document.createElement('small');
    path.textContent = post.path.replace(/^source\/_posts\//, '');
    button.append(title, meta, path);
    button.addEventListener('click', () => openPost(post.path));
    fragment.append(button);
  }
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = query ? '没有匹配的文章。试试其他关键词。' : '还没有文章，点击“新建”开始写作。';
    fragment.append(empty);
  }
  $('post-list').replaceChildren(fragment);
}

async function loadPosts() {
  const data = await api('/api/posts');
  state.posts = data.posts;
  renderPosts();
  renderTaxonomy();
}

function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function fillEditor(values, baseline = true) {
  for (const field of fields) $(`post-${field}`).value = values[field] ?? '';
  $('category-quick').value = '';
  if (baseline) {
    state.editorBaseline = JSON.stringify(rawEditor());
    state.editor.loadedSha = state.editor.sha;
  }
  $('post-path').readOnly = !state.editor.isNew;
  $('editor-mode').textContent = state.editor.isNew ? '新文章 · 尚未提交' : '编辑已提交文章';
  $('editor-form').hidden = false;
  $('empty-editor').hidden = true;
  updateDirty();
  renderPreview();
  updateDraftStatus();
}

async function openPost(path) {
  if (!canLeave()) return;
  await action(async () => {
    const post = await api(`/api/post?path=${encodeURIComponent(path)}`);
    discardChanges();
    state.editor = { path: post.path, sha: post.sha, isNew: false };
    fillEditor({
      title: post.title, path: post.path.replace(/^source\/_posts\//, ''), date: post.date,
      description: post.description, tags: (post.tags || []).join('\n'),
      categories: JSON.stringify(post.categories || []), body: post.body,
    });
    showView('editor');
    renderPosts();
  });
}

function newPost() {
  if (!canLeave()) return;
  discardChanges();
  state.editor = { path: null, sha: null, isNew: true };
  fillEditor({ title: '', path: '', date: localDate(), description: '', tags: '', categories: '[]', body: '' });
  showView('editor');
  renderPosts();
  $('post-title').focus();
}

function previewUrl(value) {
  try {
    const url = new URL(value, state.session?.siteUrl || window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function renderPreview() {
  clearTimeout(state.previewTimer);
  try {
    const html = markdown.render($('post-body').value);
    const fragment = DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      USE_PROFILES: { html: true, svg: true, mathMl: true },
      FORBID_TAGS: ['iframe', 'form', 'input', 'button', 'textarea', 'select', 'style', 'video', 'audio', 'link', 'meta', 'base'],
      FORBID_ATTR: ['srcset', 'id', 'name'],
    });
    fragment.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('src') || '';
      const safe = source ? previewUrl(source) : null;
      if (safe) image.src = safe;
      else image.removeAttribute('src');
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
    });
    fragment.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#')) {
        try {
          const url = new URL(href, state.session?.siteUrl || location.origin);
          if (['http:', 'https:', 'mailto:'].includes(url.protocol)) link.setAttribute('href', url.href);
          else link.removeAttribute('href');
        } catch { link.removeAttribute('href'); }
      }
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    $('markdown-preview').replaceChildren(fragment);
  } catch (error) {
    $('markdown-preview').textContent = `预览暂时无法生成：${error.message}`;
  }
}

function draftKey() {
  const path = state.editor?.isNew ? '__new__' : state.editor?.path;
  return `blog-admin:draft:${state.session?.repo}:${state.session?.user?.login}:${path}`;
}

function readDraft() {
  const text = localStorage.getItem(draftKey());
  if (!text) return null;
  const draft = JSON.parse(text);
  if (draft.version !== 1 || !draft.fields || !fields.every((field) => typeof draft.fields[field] === 'string') ||
      !(draft.sha === null || typeof draft.sha === 'string') || draft.path !== state.editor.path) {
    throw new Error('本地草稿格式无效或不属于当前文章，未恢复任何内容。');
  }
  return draft;
}

function updateDraftStatus() {
  try {
    const draft = readDraft();
    $('draft-status').textContent = draft
      ? `此设备有草稿（${new Date(draft.savedAt).toLocaleString('zh-CN')}）。草稿不加密、不跨设备同步；恢复前请确认内容版本。`
      : '草稿仅存于当前浏览器，不加密、不跨设备同步。清除浏览器数据会丢失草稿。';
  } catch (error) {
    $('draft-status').textContent = `无法读取本地草稿：${error.message} 请检查浏览器存储权限。`;
  }
}

function saveDraft() {
  if (!state.editor || state.busy) return;
  try {
    localStorage.setItem(draftKey(), JSON.stringify({
      version: 1, path: state.editor.path, sha: state.editor.sha, fields: rawEditor(), savedAt: new Date().toISOString(),
    }));
    updateDraftStatus();
    notice('草稿已保存在此浏览器，尚未上传或发布。共享设备上的其他使用者可能读取它。', 'success');
  } catch (error) {
    notice(`本地草稿保存失败：${error.message}。请检查存储权限或容量，或复制正文自行备份。`, 'error');
  }
}

function restoreDraft() {
  if (!state.editor || state.busy) return;
  try {
    const draft = readDraft();
    if (!draft) { notice('此浏览器没有当前文章的本地草稿。'); return; }
    const prompt = editorDirty() ? '恢复将覆盖当前尚未提交的编辑。确定恢复此设备的草稿？' : '确定恢复此设备的草稿？草稿可能早于 GitHub 最新版本。';
    if (!window.confirm(prompt)) return;
    if (!state.editor.isNew && draft.fields.path !== state.editor.path.replace(/^source\/_posts\//, '')) {
      throw new Error('草稿路径与当前文章不一致，已拒绝恢复。');
    }
    if (draft.sha !== state.editor.loadedSha && !state.editor.isNew) {
      if (!window.confirm('此草稿基于其他 GitHub 版本。是否将草稿内容恢复到当前已加载版本上？请逐项核对并合并远端改动后再发布；提交仍会检查之后发生的并发修改。取消则不恢复。')) return;
    }
    state.editor.sha = state.editor.loadedSha;
    fillEditor(draft.fields, false);
    notice('已恢复本地草稿。请核对内容后发布；提交会检查当前已加载版本是否又被修改。');
  } catch (error) { report(error); }
}

function validCategories(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('分类必须是有效 JSON，例如 ["技术","前端"] 或 [["技术","前端"],["随笔"]]。'); }
  const name = (item) => typeof item === 'string' && item.trim().length > 0;
  if (!Array.isArray(value) || !(value.every(name) || value.every((path) => Array.isArray(path) && path.length > 0 && path.every(name)))) {
    throw new Error('分类必须是字符串数组或分类路径数组，不可混合、包含空名称或空路径。没有分类请填写 []。');
  }
  return value;
}

function validateDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('发布日期格式应为 YYYY-MM-DD HH:mm:ss，例如 2026-10-16 14:30:00。');
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) {
    throw new Error('发布日期不是有效的本地日期和时间。');
  }
}

function postPayload() {
  const raw = rawEditor();
  const relative = raw.path.trim();
  if (!relative.endsWith('.md') || /[\\%\x00-\x1f\x7f?#]/.test(relative) || relative.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('文件路径须为 source/_posts/ 下的相对 .md 路径，不能包含空目录、.、..、反斜杠、百分号或控制字符。');
  }
  const path = `source/_posts/${relative}`;
  if (!state.editor.isNew && path !== state.editor.path) throw new Error('已有文章的路径不可修改。');
  if (state.editor.isNew && state.posts.some((post) => post.path === path)) throw new Error('此路径已有文章，请更换文件名，或从文章列表打开原文章。');
  if (!raw.title.trim()) throw new Error('请填写文章标题。');
  validateDate(raw.date);
  return {
    path, sha: state.editor.sha, title: raw.title.trim(), date: raw.date,
    description: raw.description, tags: [...new Set(raw.tags.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean))],
    categories: validCategories(raw.categories), body: raw.body,
  };
}

async function publishPost(event) {
  event.preventDefault();
  await action(async () => {
    const payload = postPayload();
    if (!window.confirm('将把此文章提交到 GitHub，并启动公开站点构建。提交成功不代表部署完成。确定发布？')) return;
    const result = await api('/api/post', { method: 'PUT', body: JSON.stringify(payload) });
    const oldDraftKey = draftKey();
    state.editor = { path: result.path, sha: result.sha, isNew: false };
    fillEditor({ ...rawEditor(), path: result.path.replace(/^source\/_posts\//, '') });
    try { localStorage.removeItem(oldDraftKey); } catch { /* The committed content remains safe on GitHub. */ }
    updateDraftStatus();
    startDeploy(result.commit);
    notice('文章已提交到 GitHub。请查看发布状态，等待工作流部署成功。', 'success');
    try { await loadPosts(); } catch (error) { report(new Error(`文章提交成功，但文章列表刷新失败：${error.message}`)); }
  });
}

function backgroundValue(value) {
  if (value.startsWith('/') && !value.startsWith('//') && !/[\\\x00-\x1f\x7f]/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return value;
  } catch { /* Report the permitted URL forms below. */ }
  throw new Error('背景地址必须是 HTTPS 图片 URL 或以单个 / 开头的站点相对路径，不可使用 //、凭据或控制字符。');
}

function updateBackground(mode) {
  const value = $(`background-${mode}`).value.trim();
  const image = $(`preview-${mode}`);
  const status = $(`preview-${mode}-status`);
  image.hidden = true;
  image.removeAttribute('src');
  status.hidden = false;
  if (!value) { status.textContent = '尚未设置图片'; return; }
  try {
    backgroundValue(value);
    status.textContent = '正在加载预览…';
    image.src = previewUrl(value);
  } catch {
    status.textContent = '请输入 HTTPS 地址或 /images/… 路径';
  }
}

async function loadSettings() {
  const data = await api('/api/settings');
  state.settings = { sha: data.sha };
  $('background-light').value = data.light || '';
  $('background-dark').value = data.dark || '';
  state.settingsBaseline = JSON.stringify(rawSettings());
  updateBackground('light');
  updateBackground('dark');
  updateDirty();
}

async function saveSettings(event) {
  event.preventDefault();
  await action(async () => {
    if (!state.settings) throw new Error('背景配置尚未加载，请重新打开“首页背景”。');
    const light = backgroundValue($('background-light').value.trim());
    const dark = backgroundValue($('background-dark').value.trim());
    const result = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ sha: state.settings.sha, light, dark }) });
    state.settings.sha = result.sha;
    $('background-light').value = light;
    $('background-dark').value = dark;
    state.settingsBaseline = JSON.stringify(rawSettings());
    updateDirty();
    startDeploy(result.commit);
    notice('背景配置已提交，请等待站点部署完成。', 'success');
  });
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择文件。'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

async function uploadImage(mode) {
  const input = $(`upload-${mode}`);
  const file = input.files?.[0];
  if (!file) return;
  await action(async () => {
    if (file.size > 3 * 1024 * 1024) throw new Error('图片超过 3 MiB，请压缩后重试。');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('仅支持 PNG、JPEG、WebP 或 GIF 图片。');
    if (!window.confirm(`“${file.name}”会立即提交到公开 GitHub 仓库，并触发部署。不要上传私密内容。确定公开上传？`)) return;
    const data = await fileData(file);
    const result = await api('/api/image', { method: 'POST', body: JSON.stringify({ name: file.name, mime: file.type, data }) });
    $(`background-${mode}`).value = result.url;
    updateBackground(mode);
    updateDirty();
    startDeploy(result.commit);
    notice('图片已公开提交。地址已填入表单；还需“保存背景并发布”才会应用到首页。', 'success');
  });
  input.value = '';
}

function taxonomyCounts(kind) {
  const counts = new Map();
  state.posts.forEach((post) => {
    new Set(flattenNames(post[kind])).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
}

function renderTaxonomy() {
  for (const kind of ['tags', 'categories']) {
    const counts = taxonomyCounts(kind);
    if (kind === 'categories') {
      $('category-options').replaceChildren(...counts.map(([name]) => {
        const option = document.createElement('option');
        option.value = name;
        return option;
      }));
    }
    $(`${kind}-total`).textContent = String(counts.length);
    const fragment = document.createDocumentFragment();
    for (const [name, count] of counts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'taxonomy-chip';
      const text = document.createElement('span');
      text.textContent = name;
      const number = document.createElement('small');
      number.textContent = String(count);
      button.append(text, number);
      button.addEventListener('click', () => {
        $('rename-kind').value = kind;
        $('rename-from').value = name;
        $('rename-confirm').value = '';
        updateRenameImpact();
        $('rename-to').focus();
      });
      fragment.append(button);
    }
    if (!counts.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '暂无数据';
      fragment.append(empty);
    }
    $(`${kind}-list`).replaceChildren(fragment);
  }
  updateRenameImpact();
}

function updateRenameImpact() {
  const kind = $('rename-kind').value;
  const from = $('rename-from').value;
  const count = taxonomyCounts(kind).find(([name]) => name === from)?.[1] || 0;
  $('rename-impact').textContent = from ? `“${from}”精确匹配 ${count} 篇文章；同一文章只计一次。` : '选择或输入原名称，查看影响范围。';
}

async function renameTaxonomy(event) {
  event.preventDefault();
  if (!canLeave()) return;
  const kind = $('rename-kind').value;
  const from = $('rename-from').value;
  const to = $('rename-to').value;
  if (!from.trim() || !to.trim() || from === to) { notice('原名称和新名称必须非空且不能相同。', 'error'); return; }
  if ($('rename-confirm').value !== from) { notice('确认名称与原名称不完全一致，请重新输入。', 'error'); return; }
  const count = taxonomyCounts(kind).find(([name]) => name === from)?.[1] || 0;
  if (!count) { notice('没有精确匹配的文章；请刷新文章列表后检查名称。', 'error'); return; }
  if (!window.confirm(`将 ${count} 篇文章中的${kind === 'tags' ? '标签' : '分类'}“${from}”精确更名为“${to}”。这会提交所有修改并触发公开部署。确定执行？`)) return;
  await action(async () => {
    const result = await api('/api/taxonomy', { method: 'POST', body: JSON.stringify({ kind, from, to }) });
    discardChanges();
    // A rename changes post SHAs. Never leave an editor with a stale base version.
    state.editor = null;
    state.editorBaseline = null;
    $('editor-form').hidden = true;
    $('empty-editor').hidden = false;
    $('rename-confirm').value = '';
    $('rename-from').value = to;
    $('rename-to').value = '';
    startDeploy(result.commit);
    notice(`已提交更名，实际修改 ${result.count} 篇文章。请重新打开文章以加载最新版本。`, 'success');
    try { await loadPosts(); } catch (error) { report(new Error(`更名已提交，但列表刷新失败：${error.message}`)); }
  });
}

function actionsUrl() {
  return `https://github.com/${state.session.repo}/actions/workflows/deploy.yml`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function startDeploy(commit) {
  clearTimeout(state.deployTimer);
  state.deployGeneration += 1;
  state.deploy = { commit, attempts: 0, checking: false, status: 'pending' };
  $('deploy-panel').hidden = false;
  $('deploy-commit').textContent = `提交 ${commit}`;
  $('deploy-title').textContent = '已提交 · 等待部署';
  $('deploy-detail').textContent = 'GitHub 已接收更改，正在等待部署工作流。此时还不能认定网站已更新。';
  $('deploy-link').href = actionsUrl();
  $('deploy-panel').dataset.status = 'pending';
  checkDeploy(false);
}

async function checkDeploy(manual = true) {
  const deployment = state.deploy;
  if (!deployment || deployment.checking) return;
  clearTimeout(state.deployTimer);
  if (manual) deployment.attempts = 0;
  const generation = state.deployGeneration;
  deployment.checking = true;
  try {
    const data = await api(`/api/deploy?commit=${encodeURIComponent(deployment.commit)}`);
    if (generation !== state.deployGeneration) return;
    deployment.attempts += 1;
    deployment.status = data.status;
    $('deploy-link').href = safeExternalUrl(data.url) || actionsUrl();
    $('deploy-panel').dataset.status = data.status;
    const descriptions = {
      pending: ['已提交 · 等待部署', '尚未发现对应提交的部署任务。GitHub 排队可能需要一段时间。'],
      in_progress: ['部署进行中', '对应提交的 GitHub Actions 正在运行；工作流完成前，线上内容可能仍是旧版本。'],
      success: ['部署成功', '此提交对应的部署工作流已成功完成。可访问博客查看，浏览器或 CDN 缓存可能略有延迟。'],
      failure: ['部署失败或已取消', '更改已保存在 GitHub，但站点部署未成功。请打开 Actions 查看错误，不要把“已提交”当作“已上线”。'],
    };
    const description = descriptions[data.status] || descriptions.pending;
    $('deploy-title').textContent = description[0];
    $('deploy-detail').textContent = description[1];
    if (['pending', 'in_progress'].includes(data.status)) {
      if (deployment.attempts < 30) state.deployTimer = setTimeout(() => checkDeploy(false), 10000);
      else $('deploy-detail').textContent += ' 已停止自动检查；可手动刷新状态或打开 Actions，不需要重复提交。';
    }
  } catch (error) {
    if (generation !== state.deployGeneration) return;
    $('deploy-title').textContent = '已提交 · 状态检查暂不可用';
    $('deploy-detail').textContent = `${error.message} 自动检查已暂停，请手动刷新或查看 Actions。`;
  } finally {
    deployment.checking = false;
  }
}

async function logout() {
  if (!canLeave()) return;
  await action(async () => {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    clearTimeout(state.deployTimer);
    state.deployGeneration += 1;
    discardChanges();
    state.session = null;
    state.posts = [];
    state.editor = null;
    state.editorBaseline = null;
    state.settings = null;
    state.settingsBaseline = null;
    state.deploy = null;
    $('deploy-panel').hidden = true;
    $('editor-form').reset();
    $('editor-form').hidden = true;
    $('empty-editor').hidden = false;
    $('markdown-preview').replaceChildren();
    $('post-list').replaceChildren();
    $('workspace').hidden = true;
    $('login-panel').hidden = false;
    $('login-status').textContent = '已退出登录。本地草稿仍保存在此浏览器；共享设备上请自行清除浏览器站点数据。';
    $('login-button').hidden = false;
    $('retry-session').hidden = false;
  });
}

async function initialize() {
  $('retry-session').disabled = true;
  $('login-status').textContent = '正在检查登录状态…';
  try {
    const session = await api('/api/session');
    if (!session.authenticated) {
      $('workspace').hidden = true;
      $('login-panel').hidden = false;
      const callbackError = new URLSearchParams(location.search).get('error');
      $('login-status').textContent = callbackError
        ? `GitHub 登录未完成：${callbackError}。请检查 GitHub OAuth 回调地址、账号白名单和 Worker 配置后重试。`
        : '请使用被授权的 GitHub 账号登录。访问权限由服务端校验，不由本页面决定。';
      $('login-button').hidden = false;
      $('retry-session').hidden = false;
      return;
    }
    state.session = session;
    $('account-name').textContent = `@${session.user.login}`;
    $('visit-site').href = safeExternalUrl(session.siteUrl) || '/';
    $('login-panel').hidden = true;
    $('workspace').hidden = false;
    showView('editor');
    await action(loadPosts);
  } catch (error) {
    $('login-status').textContent = `${error.message} 请检查 Worker 的 GITHUB_CLIENT_ID、ALLOWED_USER_ID、GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH / SITE_URL，以及 GITHUB_CLIENT_SECRET、SESSION_SECRET secrets；OAuth callback 应为本站 /auth/callback。修复后重新检查。`;
    $('login-button').hidden = true;
    $('retry-session').hidden = false;
  } finally {
    $('retry-session').disabled = false;
  }
}

$('retry-session').addEventListener('click', initialize);
$('brand-home').addEventListener('click', (event) => { event.preventDefault(); navigate('editor'); });
for (const name of ['editor', 'settings', 'taxonomy']) $(`nav-${name}`).addEventListener('click', () => navigate(name));
$('new-post').addEventListener('click', newPost);
$('empty-new').addEventListener('click', newPost);
$('post-search').addEventListener('input', renderPosts);
$('refresh-posts').addEventListener('click', () => action(loadPosts));
$('logout').addEventListener('click', logout);
$('save-draft').addEventListener('click', saveDraft);
$('restore-draft').addEventListener('click', restoreDraft);
$('apply-category').addEventListener('click', () => {
  const name = $('category-quick').value.trim();
  if (!name) { notice('请选择或输入分类名称。', 'error'); return; }
  $('post-categories').value = JSON.stringify([name]);
  updateDirty();
});
$('editor-form').addEventListener('submit', publishPost);
$('editor-form').addEventListener('input', (event) => {
  updateDirty();
  if (event.target === $('post-body')) {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(renderPreview, 160);
  }
});
for (const button of document.querySelectorAll('button[data-layout]')) {
  button.addEventListener('click', () => {
    $('writing-area').dataset.layout = button.dataset.layout;
    document.querySelectorAll('button[data-layout]').forEach((item) => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
  });
}
$('settings-form').addEventListener('submit', saveSettings);
for (const mode of ['light', 'dark']) {
  $(`background-${mode}`).addEventListener('input', () => { updateBackground(mode); updateDirty(); });
  $(`upload-${mode}`).addEventListener('change', () => uploadImage(mode));
  $(`preview-${mode}`).addEventListener('load', () => {
    $(`preview-${mode}`).hidden = false;
    $(`preview-${mode}-status`).hidden = true;
  });
  $(`preview-${mode}`).addEventListener('error', () => {
    $(`preview-${mode}`).hidden = true;
    $(`preview-${mode}-status`).hidden = false;
    $(`preview-${mode}-status`).textContent = '图片暂时无法加载。新上传图片需等部署完成；也请检查地址和防盗链设置。';
  });
}
$('rename-form').addEventListener('submit', renameTaxonomy);
$('rename-kind').addEventListener('change', updateRenameImpact);
$('rename-from').addEventListener('input', updateRenameImpact);
$('refresh-deploy').addEventListener('click', () => checkDeploy(true));
$('visit-site').addEventListener('click', (event) => {
  if (state.busy) event.preventDefault();
});
window.addEventListener('beforeunload', (event) => {
  if (anyDirty() || state.busy) { event.preventDefault(); event.returnValue = ''; }
});
initialize();
