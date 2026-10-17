import yaml from 'js-yaml';
import { HttpError, unbase64 } from './security.js';

export const MAX_POST_BYTES = 1024 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function mapping(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function checkYaml(value, ancestors = new Set(), depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 20000 || depth > 30) throw new HttpError(422, 'YAML 元数据过于复杂。');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) throw new HttpError(422, '不支持循环 YAML 别名。');
  ancestors.add(value);
  for (const entry of Object.values(value)) checkYaml(entry, ancestors, depth + 1, budget);
  ancestors.delete(value);
}
export function readYaml(text) {
  let data;
  try { data = yaml.load(text, { schema: yaml.JSON_SCHEMA }); } catch { throw new HttpError(422, '仓库中的 YAML 无效，未写入任何更改。'); }
  if (!mapping(data)) throw new HttpError(422, 'YAML 顶层必须是键值映射。');
  checkYaml(data);
  return data;
}
function dumpYaml(data) {
  return yaml.dump(data, { schema: yaml.JSON_SCHEMA, noRefs: true, lineWidth: -1, sortKeys: false, quotingType: '"' });
}
export function readPost(text) {
  if (encoder.encode(text).byteLength > MAX_POST_BYTES) throw new HttpError(422, '文章超过 1 MiB，无法在管理器中编辑。');
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new HttpError(422, '文章缺少有效的 YAML front matter。');
  return { metadata: readYaml(match[1]), body: text.slice(match[0].length) };
}
export function writePost(metadata, body) {
  const text = `---\n${dumpYaml(metadata)}---\n${body}`;
  if (encoder.encode(text).byteLength > MAX_POST_BYTES) throw new HttpError(413, '文章超过 1 MiB。');
  return text;
}
export function postPath(value) {
  if (typeof value !== 'string' || value.length > 512 || !value.startsWith('source/_posts/') || !value.endsWith('.md') || /[\\%\x00-\x1f\x7f]/.test(value)) throw new HttpError(400, '文章路径必须是 source/_posts/ 下的安全 .md 文件。');
  const pieces = value.slice('source/_posts/'.length).split('/');
  if (!pieces.length || pieces.some((piece) => !/^[\p{L}\p{N}_-][\p{L}\p{N}_. -]*$/u.test(piece) || piece.endsWith('.') || piece.endsWith(' ') || piece.includes('..'))) throw new HttpError(400, '文章路径不能包含空段、隐藏段或路径穿越字符。');
  return value;
}
export function isPostPath(value) { try { postPath(value); return true; } catch { return false; } }
export function sha(value, allowNull = false) {
  if (allowNull && value === null) return value;
  if (typeof value !== 'string' || !/^[a-f\d]{40}$/.test(value)) throw new HttpError(400, '必须提供有效的文件或提交 SHA。');
  return value;
}
function string(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) throw new HttpError(400, `${name}格式无效${required ? '或为空' : ''}。`);
  return value;
}
function taxonomyName(value) {
  return string(value, '分类或标签名称', 120, true);
}
export function validDate(value) {
  string(value, '日期', 19, true);
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new HttpError(400, '日期必须是本地时间 YYYY-MM-DD HH:mm:ss，不添加时区。');
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) throw new HttpError(400, '日期不是有效的本地时间。');
  return value;
}
function tagInput(value) {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string')) throw new HttpError(400, '标签必须是字符串数组。');
  return [...new Set(value.map(taxonomyName))];
}
function categoryInput(value) {
  if (!Array.isArray(value) || value.length > 100) throw new HttpError(400, '分类必须是字符串数组或分类路径数组。');
  if (value.every((entry) => typeof entry === 'string')) return value.map(taxonomyName);
  if (value.every((entry) => Array.isArray(entry) && entry.length > 0 && entry.length <= 30 && entry.every((part) => typeof part === 'string'))) return value.map((entry) => entry.map(taxonomyName));
  throw new HttpError(400, '分类路径格式无效；请保留完整的多级分类结构。');
}
function existingTags(value) {
  if (value === undefined || value === null) return [];
  return tagInput(typeof value === 'string' ? [value] : value);
}
function existingCategories(value) {
  if (value === undefined || value === null) return [];
  return categoryInput(typeof value === 'string' ? [value] : value);
}
export function postView(path, blobSha, text) {
  const { metadata, body } = readPost(text);
  return {
    path, sha: blobSha,
    title: metadata.title == null ? '' : String(metadata.title),
    date: metadata.date == null ? '' : String(metadata.date),
    description: metadata.description == null ? '' : String(metadata.description),
    tags: existingTags(metadata.tags), categories: existingCategories(metadata.categories), body,
  };
}
export function postInput(input, original) {
  const title = string(input.title, '标题', 300, true);
  const date = validDate(input.date);
  const description = string(input.description, '摘要', 5000);
  const body = string(input.body, '正文', MAX_POST_BYTES);
  const tags = tagInput(input.tags);
  const categories = categoryInput(input.categories);
  const metadata = original ? readPost(original).metadata : {};
  metadata.title = title;
  metadata.date = date;
  if (description || Object.hasOwn(metadata, 'description')) metadata.description = description;
  metadata.tags = tags;
  metadata.categories = categories;
  return writePost(metadata, body);
}
export function bannerUrl(value) {
  string(value, '背景图片地址', 2048, true);
  if (/[\x00-\x20\x7f\\]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|20|5c|7f)/i.test(value)) throw new HttpError(400, '背景地址不能包含空白、控制字符或反斜杠。');
  if (value.startsWith('/') && !value.startsWith('//')) {
    // Reject encoded protocol-relative paths too: browsers and proxies normalize these inconsistently.
    let decoded;
    try { decoded = decodeURIComponent(value); } catch { throw new HttpError(400, '背景地址包含无效的 URL 转义。'); }
    if (decoded.startsWith('//') || decoded.includes('\\')) throw new HttpError(400, '不支持协议相对地址。');
    return value;
  }
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, '背景地址必须是 HTTPS 或站点根相对地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new HttpError(400, '背景地址必须是无凭据的 HTTPS 地址。');
  return value;
}
function bannerConfig(text) {
  const data = readYaml(text);
  if (!mapping(data.home_banner) || !mapping(data.home_banner.image)) throw new HttpError(422, '主题配置缺少 home_banner.image 映射，未写入更改。');
  return data;
}
export function settingsView(blobSha, text) {
  const data = bannerConfig(text);
  return { sha: blobSha, light: data.home_banner.image.light ?? '', dark: data.home_banner.image.dark ?? '' };
}
export function settingsInput(input, original) {
  const light = bannerUrl(input.light);
  const dark = bannerUrl(input.dark);
  const data = bannerConfig(original);
  data.home_banner.image.light = light;
  data.home_banner.image.dark = dark;
  return dumpYaml(data);
}
export function taxonomyInput(input) {
  if (!['tags', 'categories'].includes(input.kind)) throw new HttpError(400, '批量重命名仅支持 tags 或 categories。');
  const from = taxonomyName(input.from);
  const to = taxonomyName(input.to);
  if (from.trim() !== from || to.trim() !== to || from === to) throw new HttpError(400, '原名和新名不能为空、首尾含空格或相同。');
  return { kind: input.kind, from, to };
}
export function renameTaxonomy(text, { kind, from, to }) {
  const { metadata, body } = readPost(text);
  const current = metadata[kind];
  if (current === undefined || current === null) return null;
  // Validate Hexo's scalar / list / multiple-category-path representations without flattening paths.
  if (kind === 'tags') existingTags(current); else existingCategories(current);
  let changed = false;
  function rename(value) {
    if (typeof value === 'string') {
      if (value === from) { changed = true; return to; }
      return value;
    }
    const result = value.map(rename);
    const seen = new Set();
    return result.filter((entry) => { const key = JSON.stringify(entry); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  const replacement = rename(current);
  if (!changed) return null;
  metadata[kind] = replacement;
  return writePost(metadata, body);
}
export function imageInput(input) {
  string(input.name, '文件名', 120, true);
  if (/[\\/\x00-\x1f\x7f]/.test(input.name)) throw new HttpError(400, '图片名称不能包含目录或控制字符。');
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  const extension = typeof input.mime === 'string' && Object.hasOwn(extensions, input.mime) ? extensions[input.mime] : null;
  if (!extension) throw new HttpError(400, '仅允许 PNG、JPEG、WebP、GIF 图片。');
  if (typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new HttpError(413, '图片不能超过 3 MiB。');
  if (!input.data || input.data.length % 4 !== 0 || !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(input.data)) throw new HttpError(400, '图片必须是有效的纯 base64 内容。');
  const bytes = unbase64(input.data);
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, '图片不能超过 3 MiB。');
  const start = Array.from(bytes.subarray(0, 12));
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const uint32 = (offset) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
  const valid = extension === 'png' ? bytes.length >= 33 && start.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' && ascii(12, 4) === 'IHDR'
    : extension === 'jpg' ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
      : extension === 'gif' ? bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) && (bytes[6] || bytes[7]) && (bytes[8] || bytes[9])
        : bytes.length >= 20 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 4)) && uint32(4) + 8 === bytes.length;
  if (!valid) throw new HttpError(400, '图片文件特征与 MIME 类型不匹配。');
  const stem = input.name.replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^a-z\d_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48).toLowerCase() || 'image';
  return { data: input.data, filename: `${stem}-${crypto.randomUUID()}.${extension}` };
}
export function decodeBlob(value) {
  if (value.encoding !== 'base64' || typeof value.content !== 'string' || (value.size != null && value.size > MAX_POST_BYTES)) throw new HttpError(422, '文件过大或 GitHub 未返回可读取的文本内容。');
  try { return decoder.decode(unbase64(value.content.replace(/\s/g, ''))); } catch { throw new HttpError(422, '仓库文件不是有效 UTF-8 文本。'); }
}
export async function blobSha(text) {
  const bytes = encoder.encode(text);
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const source = new Uint8Array(header.length + bytes.length);
  source.set(header); source.set(bytes, header.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', source)), (value) => value.toString(16).padStart(2, '0')).join('');
}
