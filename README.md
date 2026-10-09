# Alex 的学习手记 · Hexo + Redefine

从原 Astro/Fuwari 项目迁移到 Hexo 7 和 Redefine 2.9.0。保留 Markdown 文章，组件布局参考 https://anzai.sleepingbed.top/ 。

## 本地预览

安装 Node.js 22 LTS 后，在项目目录运行：

```powershell
npm ci
npm run dev
```

打开终端里的 http://localhost:4000 。

## 写文章

```powershell
npm run new-post -- "my-new-note"
```

编辑 `source/_posts/` 中生成的 Markdown 文件。文章头部使用 `date`、`tags` 和 `categories`。
图片放入 `source/images/`，插入方式为 `![说明](/images/文件名.png)`。
数学公式使用 `$...$` 或 `$$...$$`，代码块用三个反引号加语言名。

```powershell
npm run build
git add .
git commit -m "Add learning notes"
git push
```

## 第一次发布到 GitHub Pages

创建公开仓库 `Alex10086.github.io`，不初始化 README；Settings → Pages → Source 选择 GitHub Actions。
在源码目录运行以下命令（下载版本不包含 Git 元数据）：

```powershell
git init
git add .
git commit -m "Initialize Hexo blog"
git branch -M main
git remote add origin https://github.com/Alex10086/Alex10086.github.io.git
git push -u origin main
```

仓库已经存在内容时不要强制推送。Actions 成功后，地址为 https://alex10086.github.io/ 。

## 洛谷旧文迁移

已迁入 https://www.luogu.com.cn/user/110484/article 两页列表中的全部 14 篇公开文章，保留原始标题、发布时间、正文和代码，统一归入“洛谷旧文”。已有起步文章未删除，合计 15 篇。

- 文章：`source/_posts/luogu-*.md`，使用洛谷文章 ID 作为稳定文件名及链接。
- 配图：`source/images/luogu/`，5 张算法配图已下载到本地，正文不再依赖这些图片外链。
- 原始备份：`luogu-originals.json`，保存未经修改的正文和公开元数据，位于项目根目录，不会作为网页发布。
- 迁移清单与检查记录：`luogu-migration.json`；图片来源及失败记录：`luogu-image-map.json`。

为兼容原文的 Unicode 数学符号和中文公式，显式安装 KaTeX 0.16 系列，并通过 npm overrides 让 `markdown-it-katex` 使用相同版本。迁移仅修正公式定界符空白及一处原文定界符笔误；`SOS子集DP` 的引用内代码块移出引用层，以避免 Hexo 高亮把 `>>` 当成代码。代码内容保留，原始格式可从备份恢复。

已验证全部 14 个页面的标题、日期、20 个代码块及 429 处公式，5 张本地配图均可解码，搜索索引包含全部迁移文章。

唯一未恢复资源：《NOIP 2022 RP++》中重复引用的同一张 `//啧.tk/cy` 表情图目前无法访问；保留原始引用并在文章末尾说明，不以其他图片替换。

迁移不修改洛谷原文。发布到已有仓库时，应保留远端历史和个人改动：合入新增文章、图片和备份文件，合并 `package.json` 的 KaTeX 依赖与 overrides，并同步 `package-lock.json`；构建通过后正常提交推送，不要强制推送或重新初始化已有仓库。

## 改站点与组件

- `_config.yml`：站名、作者、正式网址、语言、文章链接和 Markdown 配置。
- `_config.redefine.yml`：横幅、配色、导航、侧栏、搜索、音乐播放器、统计和运行时间。
- `source/about/index.md`：关于页。
- `source/lab/index.md`：实验室页。
- `source/_data/links.yml`：友链/常用站点卡片。
- `source/_data/masonry.yml`：瀑布流相册。
- `source/custom.js`、`source/custom.css`：弹簧挂件。
- `source/images/avatar.svg`：默认头像与挂件图，可以换成自己的图片。

弹簧挂件通过 `autoFit` 跟随 CSS 容器尺寸：桌面端为 250px，距底部 32px；640px 及以下为 150px，距底部 56px 加设备安全区，避免头像遮挡首页社交按钮。位置和尺寸统一在 `source/custom.css` 中调整，无需改主题或监听窗口缩放。

音乐播放器使用一段原创合成音色演示，非参考站歌单。配置 `plugins.aplayer.audios` 可添加自己能使用的音乐。
相册、横幅使用主题附带的演示资源，暂无个人照片。评论配置暂关闭，后续可以接入自己的 Giscus 等服务。
访问量来自 Redefine 默认的 VerCount 服务，以当前站点实际访问为准，不沿用参考站数据。

## 开发与许可证

主题固定为 npm 的 `hexo-theme-redefine@2.9.0`，其 GPL-3.0 许可证随依赖保留。
弹簧组件为 Sakana Widget（MIT），数学渲染由 KaTeX（MIT）提供，依赖许可证在安装包中保留。
日常写作无需修改主题源码，个性化样式写在 `source/custom.css`。
项目可独立发布到 GitHub Pages。
