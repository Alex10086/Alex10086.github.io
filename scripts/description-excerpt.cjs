// Hexo 只把 <!-- more --> 之前的内容当作摘要；后台填写的 description 默认只进入 meta 标签。
// 在 Hexo 自带的摘要过滤器（优先级 10）之后运行：文章没有 <!-- more --> 时，
// 用 description 作为首页卡片摘要。按纯文本转义，避免摘要中的符号被当作 HTML。
const { escapeHTML } = require('hexo-util');

hexo.extend.filter.register('after_post_render', (data) => {
  if (!data.source?.startsWith('_posts/') || data.excerpt) return data;
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (description) data.excerpt = escapeHTML(description);
  return data;
}, 20);
