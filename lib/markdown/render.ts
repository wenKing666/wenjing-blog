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

/** GitHub alert 的标记 -> 中文标题与配色。没有列出的一律不动。 */
const CALLOUT_META: Record<string, { label: string; tone: string }> = {
  NOTE: { label: "提示", tone: "info" },
  TIP: { label: "技巧", tone: "info" },
  IMPORTANT: { label: "重要", tone: "warning" },
  WARNING: { label: "注意", tone: "warning" },
  CAUTION: { label: "警告", tone: "danger" },
};

/**
 * 把 `> [!WARNING]` 这种 GitHub alert 变成带色块的提示框。
 *
 * 文档是从 GitBook 搬来的，那边用 `{% hint %}` 写提示块，转换脚本会把它们
 * 改写成 GitHub 的 alert 语法 —— 好处是正文仍然是**引用块里的正常 Markdown**，
 * 列表、代码、行内代码照常解析，不需要把 HTML 塞进 Markdown（那样里面的
 * Markdown 就不会被渲染了）。
 *
 * 必须排在 rehype-sanitize 之后：这里要加 class 和标题节点，
 * 放前面会被白名单洗掉。
 */
function rehypeCallouts() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children) return;

      node.children = node.children.map((child) => {
        if (child.type === "element" && child.tagName === "blockquote") {
          /*
           * ★ 不能直接取 children[0]：引用块里第一个子节点常常是换行产生的
           * **文本节点 "\n"**，而不是 <p>。要往后找第一个元素节点。
           * （这个问题让提示框一开始完全没生效，而且不报错。）
           */
          const children = child.children ?? [];
          const first = children.find((sub) => sub.type === "element");
          if (first && first.type === "element" && first.tagName === "p") {
            const marker = collectText(first).match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
            if (marker) {
              const meta = CALLOUT_META[marker[1]];

              // 标记可能落在第一个文本节点里，也可能被拆开；深度优先找一次
              const strip = (target: HastNode): boolean => {
                if (target.type === "text" && typeof target.value === "string") {
                  const at = target.value.indexOf(marker[0]);
                  if (at >= 0) {
                    target.value = target.value.slice(at + marker[0].length);
                    return true;
                  }
                }
                for (const sub of target.children ?? []) {
                  if (strip(sub)) return true;
                }
                return false;
              };
              strip(first);

              // 标记独占一行时，第一段会变成空段落，删掉它（按引用删，不能假设它在第 0 个）
              if (collectText(first).trim() === "" && (first.children?.length ?? 0) === 0) {
                child.children = children.filter((sub) => sub !== first);
              }

              child.properties = {
                ...(child.properties ?? {}),
                className: ["callout", `callout-${meta.tone}`],
              };
              children.unshift({
                type: "element",
                tagName: "p",
                properties: { className: ["callout-title"] },
                children: [{ type: "text", value: meta.label }],
              });
              child.children = children;
            }
          }
        }

        walk(child);
        return child;
      });
    };

    walk(tree);
  };
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
   * 给表格套一层滚动容器。
   *
   * 原来是在 CSS 里给 table 直接写 `display:block; overflow-x:auto`，
   * 桌面看着没问题，但窄屏上表格的**布局溢出仍然会撑大页面** ——
   * 浏览器对 table 元素上的 overflow 处理不可靠，子元素照样参与文档宽度计算，
   * 结果整页能横向拖动几百像素（实测 390 宽的视口，文档宽 789）。
   *
   * 套一个 div 才是可靠做法：普通块级容器的 overflow 一定能裁住。
   */
  function rehypeTableWrap() {
    return (tree: HastNode) => {
      const wrap = (node: HastNode) => {
        if (!node.children) return;
        node.children = node.children.map((child) => {
          if (child.type === "element" && child.tagName === "table") {
            return {
              type: "element",
              tagName: "div",
              properties: { className: ["table-scroll"] },
              children: [child],
            } as HastNode;
          }
          wrap(child);
          return child;
        });
      };
      wrap(tree);
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
    .use(rehypeCallouts)
    .use(rehypeTableWrap)
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
