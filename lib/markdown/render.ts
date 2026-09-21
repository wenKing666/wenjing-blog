import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import GithubSlugger from "github-slugger";

export type TocEntry = { depth: number; text: string; id: string };
export type RenderResult = { html: string; toc: TocEntry[] };

/* ------------------------------------------------------------------ *
 * 极简 hast 遍历
 *
 * 只为拿标题、抽文本两件事，不值得再引 unist-util-visit / hast-util-to-string。
 * 自己写十行，顺带少两个依赖。
 * ------------------------------------------------------------------ */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function collectText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  if (!node.children) return "";
  return node.children.map(collectText).join("");
}

function walkElements(node: HastNode, visit: (n: HastNode) => void): void {
  if (node.type === "element") visit(node);
  for (const child of node.children ?? []) walkElements(child, visit);
}

/** 内容里换行有语义的标签，遍历时要整棵跳过。 */
const VERBATIM_TAGS = new Set(["pre", "code"]);

function walkAll(
  node: HastNode,
  visit: (n: HastNode) => void,
  skipTags?: Set<string>,
): void {
  visit(node);
  if (node.type === "element" && node.tagName && skipTags?.has(node.tagName)) return;
  for (const child of node.children ?? []) walkAll(child, visit, skipTags);
}

/* ------------------------------------------------------------------ *
 * 净化 schema
 *
 * 参考项目的管线是 allowDangerousHtml + dangerouslySetInnerHTML，中间没有任何净化，
 * 等于给正文开了一条存储型 XSS 通道。这里补上 rehype-sanitize，
 * 但必须放行几类节点，否则数学公式、代码高亮、GFM 会全部失效。
 * ------------------------------------------------------------------ */

// 标注类型是必需的：schema 里的属性规则是元组（[属性名, ...允许值]），
// 不加注解时 TS 会把它们推成普通数组，与 Schema 对不上。
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    // 保留连续空行时我们自己会注入 <br>，作者也常手写
    "br",
    "details",
    "summary",
    "kbd",
    "mark",
  ],
  attributes: {
    ...defaultSchema.attributes,
    // 数学节点靠 class 被 rehype-katex 识别，GFM 任务列表靠 input，
    // 代码语言靠 code 上的 language-* —— 这几类必须放行。
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    code: [["className", /^language-/, /^hljs/, "math-inline", "math-display"]],
    input: [["type", "checkbox"], "checked", "disabled"],
    // 链接统一加 rel，避免 reverse tabnabbing
    a: [...(defaultSchema.attributes?.a ?? []), "rel"],
  },
};

/* ------------------------------------------------------------------ *
 * 文本清洗
 *
 * 照搬参考项目验证过的几条正则 —— 它们解决的是一类真实痛点：
 * 从别处粘过来的 Markdown 经常有中文序号后缺空格、代码块没标语言之类的毛病。
 * 注意：连续空行的处理必须跳过代码块内部，否则会把代码里的空行也改成 <br/>。
 * ------------------------------------------------------------------ */

function normalizeMarkdown(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");

  // "1.百度" -> "1. 百度"
  text = text.replace(/^(\s*\d+)\.([^ \n])/gm, "$1. $2");

  // 去掉只含空白的行
  text = text.replace(/^[ \t]+$/gm, "");

  // 三个以上连续换行 -> 保留空行语义但折叠数量。
  // 用 split 保护代码块，避免动到代码里的空行。
  const blocks = text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  text = blocks
    .map((block, index) =>
      index % 2 === 1 ? block : block.replace(/\n{3,}/g, "\n\n"),
    )
    .join("");

  return text;
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

export function renderMarkdown(source: string): RenderResult {
  const toc: TocEntry[] = [];
  const slugger = new GithubSlugger();

  /** 给 h1–h4 加锚点 id，同时收集目录。放在净化之后，id 才不会被抹掉。 */
  function rehypeHeadingAnchors() {
    return (tree: HastNode) => {
      walkElements(tree, (node) => {
        const tag = node.tagName;
        if (!tag || !/^h[1-4]$/.test(tag)) return;

        const text = collectText(node).trim();
        if (!text) return;

        const id = slugger.slug(text);
        node.properties = { ...node.properties, id };
        toc.push({ depth: Number(tag[1]), text, id });
      });
    };
  }

  /**
   * rehype-raw 为了让重新解析后的节点还能对上原始行号，会在块级元素之间补一串换行，
   * 一个表格前面能凭空多出 14 个 \n。视觉上无害（HTML 会折叠空白），但白白让每个页面变大。
   * 这里在最后收一次，跳过 <pre>/<code> —— 那里的换行是有语义的。
   */
  function rehypeCollapseBlankLines() {
    return (tree: HastNode) => {
      walkAll(
        tree,
        (node) => {
          if (node.type !== "text" || !node.value?.includes("\n\n\n")) return;
          node.value = node.value.replace(/\n{3,}/g, "\n\n");
        },
        VERBATIM_TAGS,
      );
    };
  }

  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // allowDangerousHtml 让作者手写的 HTML 先变成原始节点，
    // 紧接着 rehypeRaw 把它解析成真正的 AST，最后交给 rehypeSanitize 清洗。
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema)
    .use(rehypeHeadingAnchors)
    // katex 与 highlight 都排在净化之后：它们生成的是可信内容，
    // 不该被 schema 折腾（KaTeX 的输出元素多到没法维护白名单）。
    .use(rehypeKatex, { strict: false, throwOnError: false })
    .use(rehypeHighlight, {
      detect: true,
      ignoreMissing: true,
      subset: [
        "cpp", "c", "python", "java", "javascript", "typescript",
        "go", "rust", "bash", "json", "html", "css", "sql", "xml",
        "yaml", "markdown", "diff",
      ],
    })
    .use(rehypeCollapseBlankLines)
    .use(rehypeStringify)
    .processSync(normalizeMarkdown(source));

  return { html: String(file), toc };
}
