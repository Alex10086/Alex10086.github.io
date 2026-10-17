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
- `source/images/avatar.jpg`：导航栏、个人头像、站点图标和个人链接卡片使用的头像。
- `source/images/spring-character.png`：弹簧挂件使用的透明背景小人图，与头像独立配置。

弹簧挂件通过 `autoFit` 跟随正方形 CSS 容器，容器底边就是原生弹簧支点；整体通过 `bottom: -40px`（手机端 `-48px`）下移，使静止时小人底部略低于右侧回顶按钮。`--spring-size` 控制小人尺寸（图片宽高为其 80%），`--spring-base-gap` 增加原生弹簧总长：桌面端分别为 280px 和 32px；640px 及以下分别为 165px 和 56px 加设备安全区。图片尺寸独立覆盖组件的内联宽高，避免加长灰杆时小人一起变大；水平偏移补偿新增宽度，保持小人位置。整根灰杆由组件画布统一绘制，随拖拽倾斜和回弹，不使用固定延长段。参数统一在 `source/custom.css` 中调整，无需改主题或监听窗口缩放。

音乐播放器使用一段原创合成音色演示，非参考站歌单。配置 `plugins.aplayer.audios` 可添加自己能使用的音乐。
相册、横幅使用主题附带的演示资源，暂无个人照片。评论配置暂关闭，后续可以接入自己的 Giscus 等服务。
访问量来自 Redefine 默认的 VerCount 服务，以当前站点实际访问为准，不沿用参考站数据。

## 私人在线管理后台（免费托管）

后台独立部署到 Cloudflare Workers，前台仍由 Hexo 和 GitHub Pages 发布，不需要租服务器或数据库。`admin/` 不属于 Hexo 的 `source/`，不会混入博客页面。使用 Workers Free，不需要开通付费套餐；免费额度和网络可达性以平台及实际访问为准。

### 功能与数据

- 文章列表、搜索、新建与编辑，Markdown/KaTeX/代码高亮实时预览，预览内容经过 HTML 清理。预览不是完整的 Redefine 页面，正式页面以 Hexo 构建结果为准。
- 分类和标签写入文章 front matter；支持批量精确重命名，保留文章正文及其他元数据。多级分类的数组顺序代表层级，多条分类路径使用嵌套数组。
- 浅色、深色首页横幅设置，图片上传到 `source/images/uploads/`；这里调整的是首页横幅，不是所有页面的底色。
- 页面管理：编辑实验室（`source/lab/index.md`）和关于（`source/about/index.md`）的标题与 Markdown 正文，保留日期、页面类型等其他元数据，只能选择这两个固定页面。
- 链接管理：可视化增删、排序链接分组与卡片，同时修改 `source/_data/links.yml` 与链接页标题。链接支持 HTTP(S) 或站内 `/` 开头路径，头像和缩略图支持 HTTPS 或站内路径；开启缩略图模式的分组每张卡片都需要缩略图。链接页使用 `type: links`，Redefine 才会渲染卡片。
- 站点文案：站点标题、副标题（浏览器标题）、描述同步写入 `_config.yml` 和 `_config.redefine.yml`；作者名、头像下方签名、侧栏公告、首页大字欢迎语及其下方轮播句子写入主题配置。签名改为手动内容后不再按文章数量自动生成称号。开启“一言”后主题可能改为显示随机句子。这些字段只接受纯文本，不能写 HTML。两份配置同时提交，任一文件已被其他修改更新时会提示冲突，不会覆盖。
- 发布通过 GitHub API 提交到 `main`，由 `.github/workflows/deploy.yml` 构建部署；提交成功不等于上线，后台会查询该次提交的 Actions 状态。
- 草稿只保存在当前浏览器，不提交公开仓库；未加密，不会跨设备同步，清理浏览器数据会丢失。重要草稿请另行备份。上传的图片会立即进入公开仓库，即使文章尚未发布。

### 首次上线

1. 将本次代码正常提交并推送到现有博客仓库，保留远端历史，不要强制推送。先确认 GitHub Pages 的 Actions 可以正常发布。
2. 注册 Cloudflare 账户，保持 Workers Free。在项目目录执行：

   ```powershell
   npm ci
   npx wrangler login
   npm run admin:deploy
   ```

   第一次部署可以在尚未配置登录密钥时进行；登录接口会拒绝服务，不会开放管理权限。记下输出的 `https://alex-blog-admin.<你的子域>.workers.dev` 地址。
3. 在 GitHub → Settings → Developer settings → OAuth Apps → New OAuth App 创建应用：
   - Homepage URL：上一步的后台地址。
   - Authorization callback URL：`https://你的后台地址/auth/callback`。
   - 生成 Client Secret；不要把它粘贴进源码、截图、聊天或公开仓库。
4. 在终端逐个设置 Worker 密钥，按提示输入值：

   ```powershell
   npx wrangler secret put GITHUB_CLIENT_ID --config admin/wrangler.jsonc
   npx wrangler secret put GITHUB_CLIENT_SECRET --config admin/wrangler.jsonc
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   npx wrangler secret put SESSION_SECRET --config admin/wrangler.jsonc
   ```

   将第三条命令生成的 64 位十六进制随机字符串输入第四条命令。不要复用示例密码；更换该密钥会让所有已有会话失效。`GITHUB_CLIENT_ID` 本身不是秘密，这里统一通过平台配置管理。
5. 打开后台，用 **Alex10086** 登录并授权。后端仅允许固定 GitHub ID **39449451**，不是只在界面隐藏按钮。仓库、分支、站点地址和允许的 ID 在 `admin/wrangler.jsonc` 中配置。
6. 先编辑一篇文章，确认发布返回提交记录，并等待对应 Actions 成功，再检查公开博客。背景修改同样需要构建部署后生效。

默认 OAuth 权限为 `public_repo`，GitHub 会提示它有访问公开仓库的权限；后台代码将操作范围限定到配置的单个仓库和文章、横幅、上传图片路径。GitHub 的这项 OAuth 权限不是单仓库授权。访问令牌仅存于加密的 HttpOnly 会话 Cookie，不返回前端，也不存入浏览器草稿。可在 GitHub 的 Authorized OAuth Apps 中撤销授权。不要在共享或不可信设备上登录。

当前源码仓库公开，不能用它存放保密内容。若改为私有源码，需调整 `GITHUB_SCOPE`、重新授权，并另行核对 GitHub Pages 的套餐要求，不能仅修改后台权限就假定免费发布仍然可用。

### 本地检查与维护

```powershell
npm run admin:test
npm run admin:check
npm run admin:dev
```

`admin:check` 构建资源并对 Worker 做 dry-run，不发布；`admin:dev` 在本机 8787 端口运行后台，未配置授权时只能查看登录界面。OAuth 回调必须与 GitHub 应用登记地址一致，线上应用不会自动支持本地登录。需要本地授权调试时，使用单独的 OAuth App 和 `admin/.dev.vars`，不要提交密钥文件。正式更新后台运行 `npm run admin:deploy`；普通文章发布不需要重新部署后台。

Windows 下请先在开发服务终端按 Ctrl+C，再重新构建或部署，避免 Wrangler 占用 `admin/dist` 导致 EBUSY。后台构建脚本位于 `admin/build.mjs`，不要移入 Hexo 会自动加载的 `scripts/`。

资源边界：每篇文章最多 1 MiB、每张上传图片最多 3 MiB；完整列表及批量更名的文章文本总量最多 16 MiB，并预留 GitHub 写入事务所需的子请求额度。超出平台请求、CPU 或仓库树限制会报错，不会跳过部分文章后继续发布。后台只处理安全路径下带 YAML front matter 的 Markdown 文章；日期按博客的 `Asia/Shanghai` 时区解释，未来日期会被当前 Hexo 配置暂时排除。

本地验证包括后端的真实 Request/Response 和加密 Cookie 流程，以及浏览器的编辑、公式/代码预览、草稿恢复、版本冲突、背景保存、批量更名和手机布局。自动化中的 GitHub HTTP/登录后 UI 数据使用测试夹具，不会向真实仓库写入；正式上线仍需在自己的账号中验证一次 OAuth 回调和 Actions 发布。

登录兼容性：OAuth 及仓库 API 的出站请求使用 `redirect: "manual"`，并将非成功状态作为失败处理。Cloudflare Workers 不支持 Node 中可用的 `redirect: "error"`；也不能改成自动跟随，否则可能将 Client Secret 或 Bearer Token 带到重定向目标。`admin:test` 包含真实 workerd + 本地 HTTP 上游的登录、会话、API 及重定向拒绝回归测试，不依赖真实密钥。

安全边界：服务端固定身份校验、OAuth state、加密短期会话、同源及 CSRF 校验、路径白名单、文件版本冲突检测。遇到版本冲突先备份编辑内容，再重新读取远端；后台不强制覆盖仓库分支。不要随意延长会话或去掉这些检查。

## 开发与许可证

主题固定为 npm 的 `hexo-theme-redefine@2.9.0`，其 GPL-3.0 许可证随依赖保留。
弹簧组件为 Sakana Widget（MIT），数学渲染由 KaTeX（MIT）提供，依赖许可证在安装包中保留。
日常写作无需修改主题源码，个性化样式写在 `source/custom.css`。
项目可独立发布到 GitHub Pages。
