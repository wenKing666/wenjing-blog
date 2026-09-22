import { UnsafePathError } from "@/lib/content/fs-safe";
import { denyIfUnauthenticated, guardMutation } from "@/lib/auth/guard";

/**
 * 后台接口的公共外壳。
 *
 * 每个路由都要做三件事：查登录态、防 CSRF、把异常翻译成合适的 HTTP 状态。
 * 写八遍就是八处会漏的地方 —— 尤其鉴权，漏一个就是裸奔。
 * 统一收在这里，路由体内只关心业务。
 */

/**
 * 请求体格式不对。
 *
 * 单独一个类型而不是抛普通 Error，是为了让 toErrorResponse 能认出它、
 * 回 400 —— 用消息字符串去匹配太脆，加个字就失效了。
 */
export class BadRequestError extends Error {}

function toErrorResponse(error: unknown): Response {
  if (error instanceof UnsafePathError) {
    // slug / 路径不合法属于"你请求的东西不对"，不是服务端故障
    return Response.json({ error: error.message }, { status: 400 });
  }
  /*
   * parseJsonBody 抛的"格式不正确"也必须算 400，
   * 否则会落进下面的兜底分支报 500 —— 客户端分不清"我传错了"
   * 和"服务端炸了"，而且每次都打一行 console.error，
   * 把真正的服务端故障淹在日志噪音里。
   */
  if (error instanceof BadRequestError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message.includes("不存在")) {
    return Response.json({ error: error.message }, { status: 404 });
  }

  console.error("[api] 操作失败:", error);
  return Response.json({ error: "操作失败，请查看服务端日志" }, { status: 500 });
}

/** 读接口：只查登录态（GET 不涉及 CSRF）。 */
export async function readRoute(
  run: () => Promise<Response>,
): Promise<Response> {
  const denied = await denyIfUnauthenticated();
  if (denied) return denied;

  try {
    return await run();
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** 写接口：查登录态 + 校验来源，再兜住异常。 */
export async function mutateRoute(
  request: Request,
  run: () => Promise<Response>,
): Promise<Response> {
  const denied = await guardMutation(request);
  if (denied) return denied;

  try {
    return await run();
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** 解析 JSON body，顺带挡住格式错误导致的 500。 */
export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BadRequestError("请求格式不正确");
  }
}

export type LimitedBody =
  | { ok: true; buffer: Buffer }
  | { ok: false; response: Response };

/** multipart 的 boundary、各分节的头也要占字节，留一点富余 */
const BODY_OVERHEAD = 4 * 1024;

/**
 * 带上限地读请求体。
 *
 * ★ 为什么不能直接 `request.formData()` / `request.json()`：
 *
 * 那两个方法会**先把整个 body 读进内存**，之后才轮到你判断大小。
 * 于是 `await request.formData()` 后面再写 `if (file.size > MAX_BYTES)`
 * 根本保护不了什么 —— 一个 500MB 的请求体已经落进内存了。
 * 服务器 `MemoryMax=800M`，一次就够把进程打挂，systemd 重启期间站点不可用。
 * （路由里那句"别让一次上传把内存吃满"的注释，实际并没有成立。）
 *
 * 这里按流读、边读边数，超了立刻掐断 —— 后面的字节根本不会进内存。
 *
 * Content-Length 只用来**快速拒绝**：正常客户端都会带，但它可以被省略、
 * 也可以撒谎，所以真正兜底的是下面的计数器。
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedBody> {
  const limit = maxBytes + BODY_OVERHEAD;

  const tooLarge = (): LimitedBody => ({
    ok: false,
    response: Response.json(
      {
        error: `请求体太大，上限 ${Math.round(maxBytes / 1024 / 1024)} MB。`,
      },
      { status: 413 },
    ),
  });

  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return tooLarge();

  const body = request.body;
  if (!body) return { ok: true, buffer: Buffer.alloc(0) };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > limit) {
        // 主动取消，不再继续收后面的字节
        await reader.cancel().catch(() => {});
        return tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    // releaseLock 在 reader 已被 cancel 的情况下可能抛，吞掉即可
    try {
      reader.releaseLock();
    } catch {
      // 忽略
    }
  }

  return { ok: true, buffer: Buffer.concat(chunks) };
}

/**
 * 用已经读进内存的 body 重新构造一个 Request，好复用标准的解析逻辑。
 *
 * 必须把 content-length 去掉 —— 原值可能缺省或者不准，
 * 留着会让 Request 按错误的长度解释这段 buffer。
 */
export function bodyToRequest(request: Request, buffer: Buffer): Request {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  /*
   * 转成普通 Uint8Array 再传：Node 的 Buffer 在类型上是
   * Uint8Array<ArrayBufferLike>，而 BodyInit 要的是非 SharedArrayBuffer 的那种，
   * 直接传过不了类型检查。这一份拷贝最大也就 8MB，可以接受。
   */
  return new Request(request.url, {
    method: "POST",
    headers,
    body: new Uint8Array(buffer),
  });
}
