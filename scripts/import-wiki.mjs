#!/usr/bin/env node
/**
 * 把 FarmersDelight Wiki 的中文文档导入成本站的文档区。
 *
 * 用法：
 *   node scripts/import-wiki.mjs "D:\下载\服务器\FarmersdelightPluginWiKi-main"
 *   node scripts/import-wiki.mjs <wiki根目录> --out <输出目录>
 *
 * 它做的事：
 *   1. 只收中文页（zh-cn / README.zh-cn.md），英文页保留在上游仓库里
 *   2. 解析 SUMMARY.md 拿到分区的阅读顺序，标题以各页的一级标题为准
 *   3. 把相对链接换算成本站的 /docs/... 地址；指向英文页或仓库其它文件的链
 *      一律换成 GitHub 原文地址，保证点得开
 *   4. 去掉 GitBook 专用的 frontmatter（icon 留下当装饰用）和「English」语言切换行
 *   5. 生成 _meta.json（分区、条目顺序、来源与许可），并把 LICENSE 一起带过来
 *
 * 重复执行是安全的：只会覆盖 content/docs 下自己生成的文件。
 */

import fs from "node:fs";
import path from "node:path";

const REPO = "https://github.com/IOVEYOUMC0/FarmersdelightPluginWiKi";
const BRANCH = "main";
const LICENSE = "GPL-3.0";

const args = process.argv.slice(2);
const sourceRoot = args.find((a) => !a.startsWith("--"));
const outIndex = args.indexOf("--out");
const outRoot =
  outIndex >= 0 && args[outIndex + 1]
    ? path.resolve(args[outIndex + 1])
    : path.resolve(process.cwd(), "content", "docs");

if (!sourceRoot) {
  console.error("缺少参数：wiki 根目录");
  process.exit(1);
}

const src = path.resolve(sourceRoot);

/** 分区顺序 = 服主先上手，玩家次之，再往扩展走。 */
const SECTIONS = [
  {
    id: "server-guide",
    dir: "server-guide/zh-cn",
    title: "服主指南",
    desc: "环境要求、安装、配置、方块行为、故障排查与性能调节。",
  },
  {
    id: "player-guide",
    dir: "player-guide/zh-cn",
    title: "玩家指南",
    desc: "烹饪工作站、工具、作物与土壤、食物与效果，从玩家视角讲清楚。",
  },
  {
    id: "addon-guide",
    dir: "addon-guide",
    title: "附属指南",
    desc: "附属的支持范围、上游署名与许可，以及各附属之间的玩法差异。",
  },
  {
    id: "api-docs",
    dir: "api-docs/zh-cn",
    title: "附属 API",
    desc: "第三方插件扩展 FarmersDelight 用的 Java 接口：入口、事件、配方、调度与工具。",
  },
];

const read = (p) => fs.readFileSync(p, "utf8");
const rel = (p) => path.relative(src, p).split(path.sep).join("/");

/** 源文件 -> 站点上的文档键（section/slug）。 */
const keyBySource = new Map();

function slugOf(file) {
  const base = path.basename(file, ".md").toLowerCase();
  // README.md / README.zh-cn.md 都是分区的首页
  return base === "readme" || base.startsWith("readme.") ? "index" : base;
}

for (const section of SECTIONS) {
  const dir = path.join(src, section.dir);
  if (!fs.existsSync(dir)) {
    throw new Error(`找不到目录：${section.dir}`);
  }
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".md"));
  for (const name of files) {
    if (name.toLowerCase() === "summary.md") continue;
    // 附属指南那一层同时有 README.md 和 README.zh-cn.md，两个都收会抢同一个
    // "index" 键，最后写进去的是哪一个取决于 readdir 顺序。英文那份跳过。
    if (name === "README.md" && files.includes("README.zh-cn.md")) continue;
    keyBySource.set(path.join(dir, name), `${section.id}/${slugOf(name)}`);
  }
}

/** 文档键 -> 站点路径。 */
function urlOfKey(key) {
  const [section, slug] = key.split("/");
  return slug === "index" ? `/docs/${section}` : `/docs/${section}/${slug}`;
}

const githubUrl = (abs) =>
  `${REPO}/blob/${BRANCH}/${encodeURI(rel(abs))}`;

/** 只认站内中文文档；其余一律回落到 GitHub。 */
function resolveTarget(abs) {
  if (keyBySource.has(abs)) return urlOfKey(keyBySource.get(abs));

  /*
   * 指向某个分区英文首页的链接（比如 README.zh-cn.md 里的 server-guide/README.md），
   * 要落到**我们的中文首页**上，而不是甩回 GitHub —— 读者点"服主指南"就该进站内。
   */
  if (/README\.md$/i.test(abs)) {
    const dir = path.dirname(abs);
    for (const candidate of [
      path.join(dir, "README.zh-cn.md"),
      path.join(dir, "zh-cn", "README.md"),
    ]) {
      if (keyBySource.has(candidate)) return urlOfKey(keyBySource.get(candidate));
    }
  }

  // `[文字](./)` 这种指向目录的写法
  for (const name of ["README.zh-cn.md", "README.md"]) {
    const candidate = path.join(abs, name);
    if (keyBySource.has(candidate)) return urlOfKey(keyBySource.get(candidate));
  }
  return null;
}

/* ---------- SUMMARY.md：拿分区的条目顺序和原始标题 ---------- */

const summaryPath = path.join(src, "SUMMARY.md");
const ordered = new Map(); // sectionId -> [slug]
if (fs.existsSync(summaryPath)) {
  const lines = read(summaryPath).split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const link = line.match(/\]\(([^)]+)\)/);
    if (!link) continue;
    const target = link[1];
    for (const section of SECTIONS) {
      if (target.startsWith(`${section.dir}/`)) {
        current = section.id;
        const abs = path.resolve(src, target);
        const key = keyBySource.get(abs);
        if (key) {
          if (!ordered.has(current)) ordered.set(current, []);
          ordered.get(current).push(key.split("/")[1]);
        }
        break;
      }
    }
  }
}

/* ---------- 逐篇处理 ---------- */

/**
 * GitBook 的提示块：
 *
 *   {% hint style="warning" %}
 *   正文，可以是多段、列表、代码
 *   {% endhint %}
 *
 * 原样留着的话页面上会直接显示这两行模板标记（线上就出现过）。
 * 这里转成 GitHub 的 alert 写法（> [!WARNING]），交给渲染管线里的
 * rehypeCallouts 变成带色块的提示框 —— 用引用块承载正文，
 * 里面的列表和代码仍然按 Markdown 正常解析。
 */
function convertHints(text) {
  const STYLE_TO_TYPE = {
    info: "NOTE",
    success: "TIP",
    tip: "TIP",
    warning: "WARNING",
    danger: "CAUTION",
  };

  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\{%\s*hint\s+style="([^"]*)"\s*%\}\s*$/);
    if (!open) {
      out.push(lines[i]);
      continue;
    }

    const type = STYLE_TO_TYPE[open[1]] || "NOTE";
    const body = [];
    i += 1;
    while (i < lines.length && !/^\{%\s*endhint\s*%\}\s*$/.test(lines[i])) {
      body.push(lines[i]);
      i += 1;
    }

    // 去掉提示块头尾的空行，否则引用块里会多出几行空白
    while (body.length && body[0].trim() === "") body.shift();
    while (body.length && body[body.length - 1].trim() === "") body.pop();

    out.push(`> [!${type}]`);
    for (const line of body) out.push(line === "" ? ">" : `> ${line}`);
    out.push("");
  }

  return out.join("\n");
}

/**
 * GitBook 的语言切换行。中文页上是
 *   [English](../en/events.md)
 * 或是
 *   [English](README.md) | **中文**
 * 两种写法都要去掉，页脚已经有原文入口。
 */
function stripLanguageSwitch(body) {
  return body
    .replace(/^\[English\]\([^)]*\)\s*$/gm, "")
    .replace(/^\[English\]\([^)]*\)\s*\|\s*\*\*中文\*\*\s*$/gm, "")
    .replace(/^\*\*English\*\*\s*\|\s*\[中文\]\([^)]*\)\s*$/gm, "");
}

const parseFrontmatter = (text) => {
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: text };
  const raw = text.slice(3, end).trim();
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: text.slice(end + 4).replace(/^\r?\n/, "") };
};

/**
 * 重写正文里的链接。
 * 先按源文件所在目录解析成绝对路径，再查回文档键 —— 这样跨分区、
 * 跨语言的链接都不会因为"看起来像同一个文件名"而错配。
 */
function rewriteLinks(body, absFile) {
  const dir = path.dirname(absFile);
  return body.replace(/(!?\[[^\]]*\]\()([^)\s]+)(\))/g, (whole, pre, url, post) => {
    if (/^(https?:|mailto:|tel:|#)/i.test(url)) return whole;
    const hashAt = url.indexOf("#");
    const hash = hashAt >= 0 ? url.slice(hashAt) : "";
    const rawPath = hashAt >= 0 ? url.slice(0, hashAt) : url;
    if (!rawPath) return whole;

    let decoded = rawPath;
    try {
      decoded = decodeURI(rawPath);
    } catch {
      /* 保持原样 */
    }
    const abs = path.resolve(dir, decoded);
    const mapped = resolveTarget(abs);
    if (mapped) return `${pre}${mapped}${hash}${post}`;
    return `${pre}${githubUrl(abs)}${hash}${post}`;
  });
}

const report = { files: 0, linksToGithub: 0, missing: [] };

for (const [absFile, key] of keyBySource) {
  const raw = read(absFile);
  const { data, body: afterFm } = parseFrontmatter(raw);

  // 有的页面 frontmatter 后面先空一行再接 [English]，不去掉开头的空白，
  // 下面的 ^# 就永远匹配不上，页面上会出现两个标题。
  let body = afterFm.replace(/\r\n/g, "\n").trimStart();

  // 再 trim 一次：上一步的正则匹配到行尾、但把换行留了下来，
  // 开头多出一个 \n 就够让下面的 ^# 匹配不上。
  body = stripLanguageSwitch(body).trimStart();
  body = convertHints(body);

  // 一级标题挪到 frontmatter 里，正文从下一个标题开始，避免页面上出现两个标题
  const h1 = body.match(/^#\s+(.+)$/m);
  const [sectionId, slug] = key.split("/");
  // 分区首页统一用分区名：api-docs 那一页的一级标题写的是"中文"
  const title =
    slug === "index"
      ? (SECTIONS.find((s) => s.id === sectionId)?.title ?? sectionId)
      : h1
        ? h1[1].trim()
        : slug;
  if (h1) {
    body = body.replace(/^#\s+.+\n+/, "");
  }

  const before = body;
  body = rewriteLinks(body, absFile);
  const githubCount = (body.match(new RegExp(REPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  report.linksToGithub += githubCount;
  if (before === body) {
    /* 没有链接也正常 */
  }

  const fm = ["---", `title: ${JSON.stringify(title)}`, `section: ${sectionId}`];
  if (data.icon) fm.push(`icon: ${data.icon}`);
  if (data.description) fm.push(`description: ${JSON.stringify(data.description)}`);
  fm.push(`source: ${rel(absFile)}`);
  fm.push("---", "");

  const outFile = path.join(outRoot, sectionId, `${slug}.md`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, fm.join("\n") + body.replace(/\n{3,}/g, "\n\n").trimStart() + "\n", "utf8");
  report.files += 1;
}

/* ---------- 总览页（原 README.zh-cn.md） ---------- */

const readmeSrc = path.join(src, "README.zh-cn.md");
let overview = "";
if (fs.existsSync(readmeSrc)) {
  const { body: afterFm } = parseFrontmatter(read(readmeSrc));
  let body = afterFm.replace(/\r\n/g, "\n").trimStart();
  body = stripLanguageSwitch(body).trimStart();
  body = convertHints(body);
  body = body.replace(/^#\s+.+\n+/, "");
  body = rewriteLinks(body, readmeSrc);
  overview = body.trim();
}

/* ---------- 元数据 ---------- */

const meta = {
  title: "FarmersDelight 文档",
  subtitle: "基于 CraftEngine 的 Farmer's Delight Paper / Folia 移植插件",
  source: {
    repo: REPO,
    branch: BRANCH,
    license: LICENSE,
    licenseUrl: `${REPO}/blob/${BRANCH}/LICENSE`,
    retrieved: new Date().toISOString().slice(0, 10),
    note: "中文文档转载自上游 Wiki，按 GPL-3.0 许可分发；页面标题、正文与代码片段均未改动，仅做了链接与排版上的适配。",
  },
  sections: SECTIONS.map((section) => {
    const items = [];
    // 注意 Map 的元素是 [源文件绝对路径, 文档键]，不要只解构第一个
    for (const [, key] of keyBySource) {
      const [sid, slug] = key.split("/");
      if (sid !== section.id) continue;
      const file = path.join(outRoot, sid, `${slug}.md`);
      const text = read(file);
      const h = text.match(/^title:\s*(.+)$/m);
      let title = h ? h[1].trim() : slug;
      if (title.startsWith('"') && title.endsWith('"')) title = JSON.parse(title);
      // 分区首页用分区名，不用页内的一级标题 —— API 那一页的标题是"中文"
      if (slug === "index") title = section.title;
      items.push({ slug, title });
    }
    const order = ordered.get(section.id) || [];
    items.sort((a, b) => {
      const ia = order.indexOf(a.slug);
      const ib = order.indexOf(b.slug);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    // 分区首页永远排第一
    items.sort((a, b) => (b.slug === "index" ? 1 : 0) - (a.slug === "index" ? 1 : 0));
    return { id: section.id, title: section.title, desc: section.desc, items };
  }),
  overview,
};

fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, "_meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");

const licenseSrc = path.join(src, "LICENSE");
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(outRoot, "LICENSE.txt"));
}

console.log(`[wiki] 导入 ${report.files} 篇，外链到 GitHub ${report.linksToGithub} 处`);
for (const section of meta.sections) {
  console.log(`[wiki]   ${section.title}: ${section.items.length} 篇`);
}
console.log(`[wiki] 输出目录：${outRoot}`);