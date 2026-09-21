# 问荆 · 个人博客

Next.js 16 毛玻璃风格个人博客，自带网页后台与自建评论系统。所有内容是磁盘上的 Markdown 与 JSON 文件，**内容目录在构建产物之外 —— 重新部署不会碰它**。

---

## 有什么

**前台**

| 页面 | 说明 |
| --- | --- |
| `/` 首页 | 题头（纯排版，不套卡片）+ 序号式文章列表 + 标签云 |
| `/posts` 文章 | 卡片网格，支持标签筛选与分页 |
| `/chatter` 杂谈 | 随性的长文，与文章共用编辑器 |
| `/moments` 说说 | 时间轴式的碎片记录 |
| `/timeline` 归档 | 按年份分组的全部文章 + 字号随频次变化的标签云 |
| `/photowall` 照片墙 | 多列瀑布流 + 灯箱（键盘可翻页） |
| `/music` 音乐 | 底部常驻播放器，歌单可展开 |
| `/friends` 友链 | 卡片网格 + 申请格式一键复制 |
| `/about` 关于 | 个人档案与站点统计 |

还带：全文搜索（`Ctrl/Cmd + K`）、深浅主题、RSS 订阅、站点地图、分享卡片、液态玻璃材质、滚动入场动效、开屏动画。

**后台** `/admin`：文章 / 杂谈 / 说说 / 照片墙 / 评论 / 友链 / 音乐 / 设置，八个管理页。

---

## 快速开始（本机开发）

```bash
npm install

npm run set-password     # 生成管理密码摘要，输出粘进 .env.local
openssl rand -base64 48  # 生成 SESSION_SECRET，同样粘进去
cp .env.example .env.local

npm run dev
```

前台 http://localhost:3000 ，后台 http://localhost:3000/admin 。

---

## 内容存在哪

全部在**一个目录**里，也是备份时唯一需要拷的东西：

```
content/
├── posts/<slug>.md          文章
├── chatters/<slug>.md       杂谈
├── moments/<id>.md          说说
├── comments/<类型>/<slug>.json   评论（按内容分文件）
├── uploads/                 上传的图片
├── albums.json              相册
├── friends.json             友链
├── music.json               歌单与音源配置
└── settings.json            站点设置
```

开发环境下它是项目根下的 `content/`；生产环境由 `CONTENT_DIR` 指向构建产物之外的绝对路径。

文章 front-matter：

```yaml
---
title: 文章标题
date: 2026-09-18
summary: 摘要，用于列表页和搜索引擎
tags: [Next.js, 前端]
category: 技术
cover: /uploads/xxx.jpg
draft: false
pinned: false
---
```

> `slug` 由文件名决定。中文标题会自动生成 `post-20260918-9c36` 这样的别名；
> 想要好看的 URL，在编辑器里手填一个英文的。

---

## 评论系统

自建的，不依赖任何第三方服务。

**存取**：一个内容一个 JSON 文件，放在 `content/comments/` 下。删文章时它的评论会一起删掉，不留无主数据。

**四道防线**（因为没有验证码，也没有第三方垃圾过滤）：

1. **蜜罐字段** —— 界面上藏着对用户和读屏都不可见的输入框，自动填表的机器人会中招，命中了服务端静默丢弃（还返回"成功"，别提示它哪里露馅）
2. **频率限制** —— 按 IP，10 分钟 5 条。只在内存里计数，不落盘
3. **目标校验** —— slug 必须对应一篇真实存在的内容，否则任何人都能凭空造出成千上万个文件把磁盘塞满
4. **先审后发** —— 默认新评论要你在后台点过才显示（可在设置里关掉）

**隐私**：不存 IP（只用于内存里的频率限制，用完即弃）；访客填的邮箱只有你在后台能看到，前台数据和页面里都没有。

**正文按纯文本存储和渲染**，不支持 Markdown —— 这是刻意的，从根上就没有 XSS 面。

审核入口在后台侧边栏「互动 → 评论」，有待审时数字会标出来。

---

## 部署

目标环境：**2 vCPU / 2GB 内存 / Debian 13**。

架构上有一条硬边界：`next build` 在 2GB 机器上大概率 OOM。所以是 **本机构建、只上传产物、服务器永不构建** —— 服务器上物理上没有源码。

```
本机                                    服务器
npm run build                          /opt/myblog/
npm run pack   ──── scp ────►          ├── releases/<时间戳>/   ← 每次部署整个换掉
npm run deploy                         ├── current -> releases/...
                                       ├── content/            ← ★ 你的全部内容，部署永不触碰
                                       └── shared/blog.env     ← ★ 密钥，跨版本保留
```

### 首次部署

```bash
# 1. 本机：生成 SSH 密钥并传上去
ssh-keygen -t ed25519 -C "blog-deploy"
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@你的服务器IP

# 2. 服务器：一次性初始化（装 Node、建目录、加 swap、装 systemd）
scp -r deploy root@你的服务器IP:/tmp/
ssh root@你的服务器IP 'bash /tmp/deploy/install-server.sh'

# 3. 服务器：填密钥
ssh root@你的服务器IP
nano /opt/myblog/shared/blog.env    # 填 ADMIN_PASSWORD_HASH 和 SESSION_SECRET

# 4. 本机：配置并发布
cp deploy.config.example.json deploy.config.json   # 填 host / user / sshKey
npm run build && npm run pack && npm run deploy
```

### 以后每次更新

```bash
npm run build && npm run pack && npm run deploy
```

### 备份（重要）

```bash
npm run backup
```

把服务器上的 `content/` 整个拉回本地的 `backups/`，自动保留最近 10 份。

**为什么必须单独做这件事**：`content/uploads/` 里的图片**不在 git 里**（二进制会让仓库越来越臃肿），所以只靠 git 备份的话 —— 文章都在，**图片会全丢**。

建议把 `backups/` 再同步一份到网盘或另一台机器。只存在一台电脑上的备份不算备份。

### 反向代理与 HTTPS

**域名已备案** → 装 Caddy，把 [`deploy/Caddyfile`](deploy/Caddyfile) 拷到 `/etc/caddy/Caddyfile` 改好域名，证书自动申请：

```bash
apt-get install -y caddy
cp /tmp/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

**域名未备案** → 别用 Caddy。阿里云大陆地域会拦 80/443 上的域名，Let's Encrypt 的验证也可能因此失败。改用高位端口直连：

1. 编辑 `/etc/systemd/system/myblog.service`，`HOSTNAME` 改 `0.0.0.0`、`PORT` 改 `8080`
2. 在 `blog.env` 里设 **`COOKIE_SECURE=false`**（不设的话登录会静默失效）
3. 阿里云安全组放行 8080
4. `systemctl daemon-reload && systemctl restart myblog`

### 回滚

每次部署都是独立目录，回滚就是把软链指回去：

```bash
ls /opt/myblog/releases/
ln -sfn /opt/myblog/releases/<上一个时间戳> /opt/myblog/current
systemctl restart myblog
```

### 运维命令

```bash
systemctl status myblog      # 状态
journalctl -u myblog -f      # 实时日志
systemctl restart myblog     # 重启
```

---

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD_HASH` | ✅ | 管理密码摘要。**里面绝不能出现 `$`** —— Next 加载 .env 时做变量展开会把它截断，症状是"密码明明对却提示密码不正确"。用 `npm run set-password` 生成就没事 |
| `SESSION_SECRET` | ✅ | 会话签名密钥，≥32 字符。换掉即强制所有会话下线 |
| `CONTENT_DIR` | 生产 ✅ | 内容目录绝对路径。**生产环境不设会拒绝启动** —— 这是有意的，回落到 `process.cwd()` 会把文章写进产物里 |
| `COOKIE_SECURE` | | `true`/`false`。**纯 HTTP 访问必须设 `false`**，否则浏览器不回传 cookie、登录静默失效 |
| `SITE_URL` | | 站点地址。也可以在后台设置里填（后台优先） |
| `PORT` / `HOSTNAME` | | **只能写在 systemd 里**，放 `.env` 无效 —— Next 的 `server.js` 在任何 `.env` 加载之前就读了它们 |

---

## 开发命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 → `.next/standalone` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run check-render` | Markdown 渲染管线冒烟测试（14 项断言） |
| `npm run pack` | 组装产物并打 tar.gz → `dist/` |
| `npm run deploy` | 发布到服务器 |
| `npm run backup` | 从服务器拉回内容备份 |
| `npm run set-password` | 生成 `ADMIN_PASSWORD_HASH` |

---

## 一些设计取舍

**性能**（针对 2GB 服务器）

- **渲染结果有磁盘缓存**：整站是动态渲染的（内容要在线改、改完立刻可见），所以每次请求都会重跑 Markdown 管线，而 `rehype-highlight` 是纯 JS 语法分析，一篇长文几十到两百毫秒。缓存键用**内容的 sha1**而不是 mtime —— 复制文件、切分支都不会让它无谓失效。缓存目录 `content/.cache/` 随时可以整个删掉。
- **文章列表分页**，每页数量在后台设置。
- **图片在浏览器端压缩**后上传（长边 1920、转 WebP）。这样服务器不需要 sharp 这个平台相关的原生模块，也就没有 CPU 开销。动图不做处理，压缩会丢帧。

**为什么正文用衬线体**：全站正文字体是宋体/思源宋体的系统栈，这是"书卷气"的来源。刻意**不用 `next/font/google`** —— 它要在构建时连 `fonts.googleapis.com`，实测该域名 TLS 握手直接失败，构建会卡死。

**为什么没有每篇文章自动生成分享卡片**：那需要给渲染引擎喂一份中文字体，而 CJK 字体动辄十几 MB —— 对一个 4.7MB 的产物不划算。放一张 1200×630 的图到 `public/`，在后台设置里填路径即可。

**动效分级**：跟随系统「减少动态效果」偏好时，去掉粒子、开屏、大幅位移与模糊，但**保留**颜色渐变和轻微的悬停反馈。一刀切地全杀掉只会让页面又硬又廉价。可在后台改成"始终开启"或"全部关闭"。

---

## 安全

- 后台密码用 scrypt（N=2^15）哈希；登录按 IP 限流（15 分钟 5 次）
- 会话是 HMAC-SHA256 签名的 httpOnly cookie，**先验签再解析**
- `proxy.ts` 拦一层，每个 route handler 再查一次（纵深防御）
- 变更类请求校验 `Origin` 防 CSRF
- 文章/杂谈/评论的 slug 走白名单 + resolve 后前缀校验，挡住路径穿越
- 上传的文件名**完全由服务端生成**，扩展名从 MIME 推出，绝不信任客户端文件名；不收 SVG（可以内嵌脚本）
- 评论是全站唯一无需登录的写接口，四道防线见上文
- systemd 单元开了 `NoNewPrivileges` / `ProtectSystem=strict` / `PrivateTmp` 等加固

公网机器请务必：**用密钥登录 SSH 并关掉密码登录**，装 fail2ban。`install-server.sh` 结尾会打印具体命令。

---

## 技术栈

Next.js 16.2.1（App Router）· React 19.2.4 · Tailwind CSS 4 · TypeScript 5
unified / remark / rehype（Markdown 管线，含 `rehype-sanitize`）· KaTeX · highlight.js

## 许可

你自己的代码，随便用。
