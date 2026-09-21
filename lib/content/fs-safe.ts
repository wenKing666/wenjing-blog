import { createHash } from "node:crypto";
import path from "node:path";
import { contentRoot } from "./paths";

/** slug 白名单：字母数字开头，只含字母数字与 . _ -，最长 128。 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePathError";
  }
}

/**
 * 校验 slug。
 *
 * 注意 `.` 是允许出现在 slug 中间的（hello.world 是合法文件名），
 * 所以必须单独挡掉 `..` —— 光靠正则字符集挡不住路径穿越。
 */
export function assertSafeSlug(slug: string): string {
  if (typeof slug !== "string" || slug.length === 0) {
    throw new UnsafePathError("slug 不能为空");
  }
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new UnsafePathError(`slug 含有非法路径片段: ${JSON.stringify(slug)}`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new UnsafePathError(
      `slug 只能用小写字母、数字、点、下划线和连字符，且必须以字母或数字开头（收到 ${JSON.stringify(slug)}）。` +
        `中文标题请留空由系统生成，或手动填一个英文 slug。`,
    );
  }
  return slug;
}

/**
 * 把一个相对路径片段解析到内容目录内，并确认解析结果确实还在目录内。
 *
 * 这是纵深防御的第二道：即便 assertSafeSlug 被绕过（比如将来加了别的入口），
 * resolve 之后的前缀校验仍会拦住 `../../etc/passwd` 这类目标。
 */
export function resolveInContent(...segments: string[]): string {
  const root = contentRoot();
  const target = path.resolve(root, ...segments);
  const rel = path.relative(root, target);

  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new UnsafePathError(
      `路径逃逸出内容目录: ${segments.join("/")} -> ${target}`,
    );
  }
  return target;
}

/**
 * 由标题生成 slug。
 *
 * **只产出 ASCII** —— 这很重要：assertSafeSlug 的白名单就是 ASCII，
 * 如果这里保留中文，中文标题生成出来的 slug 会在读取时被自己的校验挡回去。
 * 中文标题一律退化成 `post-<日期>-<短哈希>`：既保证合法唯一，也比一串时间戳好认。
 *
 * 想要好看的 URL，在后台编辑器里手动填 slug 即可（比如把《聊聊 Next.js》填成 chat-nextjs）。
 */
export function slugifyTitle(title: string, prefix = "post"): string {
  const base = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  if (base) return base;

  const now = new Date();
  const stamp =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}`;
  const hash = createHash("sha1").update(title).digest("hex").slice(0, 4);
  return `${prefix}-${stamp}-${hash}`;
}
