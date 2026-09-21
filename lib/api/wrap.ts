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
