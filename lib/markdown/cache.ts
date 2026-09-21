import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { contentRoot } from "@/lib/content/paths";
import { writeFileAtomic } from "@/lib/content/store";
import { renderMarkdown, type RenderResult } from "./render";

/**
 * Markdown 渲染结果的磁盘缓存。
 *
 * 为什么需要它：整站是 force-dynamic 的（内容要在线改、改完立刻可见），
 * 于是**每一次页面请求都要重跑一遍完整的渲染管线**。
 * 其中 rehype-highlight 是纯 JS 语法分析，一篇长文要几十到两百毫秒 CPU。
 * 在 2GB 的服务器上，几个人同时打开长文就能把 CPU 吃满。
 *
 * 缓存键用**内容本身的 sha1**，而不是文件 mtime：
 * mtime 在复制文件、切分支时会变，导致无谓失效；
 * 内容哈希只在真正改了字的时候才变，而且不需要额外的 stat 调用。
 *
 * 缓存目录在 content/.cache/ 下，已被 gitignore，**随时可以整个删掉** ——
 * 删了只会让下次访问慢一点，不会有任何数据损失。
 */

function cacheDir(): string {
  return path.join(contentRoot(), ".cache", "render");
}

/** 缓存文件名：把 key 里的路径分隔符等换成安全字符。 */
function cacheFile(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return path.join(cacheDir(), `${safe}.json`);
}

export async function renderMarkdownCached(
  key: string,
  source: string,
): Promise<RenderResult> {
  const hash = createHash("sha1").update(source).digest("hex");
  const file = cacheFile(key);

  try {
    const raw = await fs.readFile(file, "utf8");
    const cached = JSON.parse(raw) as {
      hash?: string;
      html?: string;
      toc?: RenderResult["toc"];
    };
    if (cached.hash === hash && typeof cached.html === "string") {
      return { html: cached.html, toc: cached.toc ?? [] };
    }
  } catch {
    // 没命中、或者缓存文件损坏 —— 都走重新渲染，不需要区分
  }

  const result = renderMarkdown(source);

  // 写缓存失败绝不能影响页面：磁盘满、权限不对都可能发生，
  // 那种情况下正确行为是"慢一点"，而不是"打不开"
  writeFileAtomic(file, JSON.stringify({ hash, ...result })).catch((error) => {
    console.warn("[cache] 写入渲染缓存失败（不影响页面）:", error);
  });

  return result;
}

/** 清空缓存。删除文章后想立刻回收空间时可以调它。 */
export async function clearRenderCache(): Promise<number> {
  const dir = cacheDir();
  try {
    const entries = await fs.readdir(dir);
    await Promise.all(
      entries.map((name) => fs.rm(path.join(dir, name), { force: true })),
    );
    return entries.length;
  } catch {
    return 0;
  }
}
