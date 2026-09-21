import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 内容读写的公共底座。
 *
 * 站点里有六种内容（文章、杂谈、说说、友链、相册、歌单），
 * 但它们归到底只有两种形态：**目录下的 Markdown 文件**，和**单个 JSON 文件**。
 * 把这两件事的读写、原子写入、容错在这里统一，别处就不再各写一遍。
 */

/*
 * 每文件的串行闸门。
 *
 * 站点里有好几处是「整份读出来 → 改数组 → 整份写回」：评论的新增/审核/删除、
 * 头像框清单、设置保存。这些操作**没有互斥**，两个请求重叠时后写的会
 * 覆盖先写的，而被覆盖的那次修改**静默消失**，接口还回 200。
 *
 * 最现实的触发入口是后台的评论审核：组件只把当前点的那一行置忙
 * （`setBusyId`），其它行的按钮仍然可点 —— 审核者连着点两条评论的"通过"
 * 就是两个并发读-改-写。另一篇内容下两条评论几乎同时到达也一样。
 *
 * 部署是 systemd 单进程，所以进程内的串行就够了，不需要文件锁。
 */
const chains = new Map<string, Promise<unknown>>();

/**
 * 把针对同一个文件的异步操作排成队，一次只跑一个。
 *
 * 注意链尾吞掉了异常：一次失败不能让后面排队的全部跟着 reject。
 * 调用方拿到的仍是原始的 promise，异常照常抛出。
 */
export function withFileLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const result = previous.then(run, run);
  chains.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/** 原子写入：先写临时文件再 rename，避免写到一半被读到残缺内容。 */
export async function writeFileAtomic(
  filePath: string,
  body: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  /*
   * ★ 临时文件名必须带**随机数**，光有 pid + 时间戳不够。
   *
   * 同一进程内，两个请求在同一毫秒写同一个文件时会算出同一个 tmp 路径：
   * 两人都往里写，其中一个 rename 走后，另一个 rename 报 ENOENT
   * （那个请求收到 500，用户以为没保存成功），而先 rename 的内容
   * 可能已经是两半拼接的。实测能稳定复现。
   *
   * 随机后缀是这类原子写的标准配方 —— 这个项目的上传那边早就在用了。
   */
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, body, "utf8");

  try {
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

/** 读 JSON。文件不存在或内容损坏时回落到给定的默认值，绝不让页面挂掉。 */
export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      // 损坏比缺失严重，要说出来，否则用户会以为"我存的东西没了"
      console.error(`[content] ${filePath} 读取或解析失败，已回落到默认值:`, error);
    }
    return fallback;
  }
}

/** 写 JSON。同样走原子替换。 */
export async function writeJson<T>(filePath: string, data: T): Promise<T> {
  await writeFileAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

/** 列出目录下所有 `.md` 的文件名（去掉扩展名），并过滤掉不合法的名字。 */
export async function listMarkdownSlugs(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    // 挡掉手工丢进来的怪文件名，避免一个坏文件让整个列表报错
    .filter(
      (slug) => /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(slug) && !slug.includes(".."),
    );
}

export async function removeFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
