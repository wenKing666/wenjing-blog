/**
 * 进程内的固定窗口限流。
 *
 * 单实例的个人博客不需要 Redis 那套东西 —— 一个 Map 就够。
 * 代价是重启后计数清零，且多实例部署时不共享；对本站场景可以接受。
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** 上限保护：万一被大量不同 IP 打，别把内存吃光。 */
const MAX_ENTRIES = 5000;

function sweep(now: number): void {
  if (buckets.size < MAX_ENTRIES) return;

  // 先把已经过期的清掉
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_ENTRIES) return;

  /*
   * ★ 仍然超量时**逐出最快过期的那些**，绝不能 `buckets.clear()`。
   *
   * clear() 会把所有计数一起抹掉，包括登录失败次数 —— 攻击者只要用大量
   * 不同 IP 把表灌到 5000 条，就能顺手把自己的登录失败记录也清零，
   * 等于给口令爆破开了个后门。只逐出最少量的、最旧的，才既控住内存
   * 又不影响别人。
   */
  const byExpiry = [...buckets.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt,
  );
  const excess = buckets.size - MAX_ENTRIES + 1;
  for (let i = 0; i < excess && i < byExpiry.length; i += 1) {
    buckets.delete(byExpiry[i][0]);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** 登录成功后清掉计数，避免之前几次失败继续占着额度。 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * 从请求头里取客户端 IP。
 *
 * ⚠️ **必须是 X-Real-IP 优先，而不是 X-Forwarded-For 的第一段。**
 *
 * 这两个头看起来等价，实际语义完全不同。反向代理那边配的是：
 *
 *   proxy_set_header X-Real-IP       $remote_addr;                ← 覆盖写
 *   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  ← 追加写
 *
 * XFF 是**追加**的：客户端自己带一个 `X-Forwarded-For: 1.2.3.4`，
 * 代理会拼成 `1.2.3.4, 真实IP`。取第一段 = 完全采信攻击者塞的值。
 *
 * 这不只是"统计能被污染"：登录限流是按 IP 计数的，
 * 攻击者每次请求换一个伪造 IP，就能把爆破防护整个绕过去。
 *
 * X-Real-IP 由代理**覆盖写**，客户端塞什么都会被盖掉，所以可信。
 *
 * 应用只监听 127.0.0.1，外面碰不到它，因此这两个头只可能来自我们自己的代理。
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // 没有 X-Real-IP 时（比如换了个不设这个头的代理）退回 XFF，
    // 但取**最后一段** —— 那是最后一跳代理写上的，最接近真实来源
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return "unknown";
}
