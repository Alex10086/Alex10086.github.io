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
