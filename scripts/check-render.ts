/**
 * Markdown 渲染管线的冒烟测试。
 *
 * 这条管线里最容易出事的是"净化"与"数学公式/代码高亮"的先后顺序：
 * 净化太严会把公式和代码块一起吃光，太松则等于没防。
 * 依赖升级后跑一次 `node scripts/check-render.ts` 就能确认没有回归。
 *
 * 需要 Node 22.18+ / 24（原生剥离 TypeScript 类型），仅在本机开发时使用。
 */
import { renderMarkdown } from "../lib/markdown/render.ts";

const SAMPLE = `# 一级标题

正文里有**粗体**、\`行内代码\` 和[链接](https://example.com)。

## 数学公式

行内公式 $E = mc^2$，以及块级公式：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

## 代码块

\`\`\`cpp
#include <iostream>
int main() { std::cout << "hi"; }
\`\`\`

## 表格与任务列表

| 列 A | 列 B |
| ---- | ---- |
| 1    | 2    |

- [x] 已完成
- [ ] 未完成

## 应当被净化掉的危险内容

<script>alert("xss")</script>
<img src="x" onerror="alert('xss')">
<a href="javascript:alert('xss')">恶意链接</a>
<div style="position:fixed;top:0">带内联样式的 div</div>

### 三级标题
`;

const { html, toc } = renderMarkdown(SAMPLE);

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

// —— 应当保留的能力 ——
check("GFM 表格渲染", html.includes("<table>"));
check("任务列表渲染", html.includes('type="checkbox"'));
check("代码块带语言类", /class="[^"]*language-cpp/.test(html));
check("代码高亮生效", html.includes("hljs-"));
check("行内公式 KaTeX", html.includes("katex"));
check("块级公式 KaTeX", html.includes("katex-display"));
check("标题锚点 id", html.includes('id="一级标题"'));
check("目录收集到 6 条", toc.length === 6, `实际 ${toc.length} 条: ${toc.map((t) => t.text).join(" / ")}`);
check("没有多余空行", !/\n{3,}/.test(html));
check("代码块内换行未被破坏", /hljs language-cpp[\s\S]*\n[\s\S]*<\/code>/.test(html));

// —— 应当被净化掉的内容 ——
check("script 标签被清除", !html.includes("<script"), html.match(/<script[^>]*>/)?.[0]);
check("onerror 事件属性被清除", !html.includes("onerror"));
check("javascript: 协议被清除", !html.includes("javascript:"));
check("内联 style 被清除", !/style="position:fixed/.test(html));

// —— 输出 ——
const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  const mark = c.pass ? "  ok  " : " FAIL ";
  console.log(`[${mark}] ${c.name}${c.detail && !c.pass ? `  <- ${c.detail}` : ""}`);
}

console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);

if (failed.length > 0) {
  console.log("\n—— 渲染结果 ——\n");
  console.log(html);
  process.exit(1);
}
