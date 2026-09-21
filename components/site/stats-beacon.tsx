"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 访问上报。
 *
 * 只在**客户端**发，不走服务端中间件。原因：
 *   - `proxy.ts` 的设计意图是"只做无 I/O 的校验"，往里塞数据库写入会破坏它
 *   - 服务端记的话，静态资源、预取、爬虫的请求都会混进来，很难筛干净
 *
 * 用 `sendBeacon` 而不是 fetch：
 *   - 它在页面卸载时也能可靠发出（访客点完链接就走，fetch 会被取消）
 *   - 不占用连接、不影响页面性能
 *
 * 这个组件不渲染任何东西，挂一次就够（放在站点 layout 里）。
 */
export function StatsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    const payload = JSON.stringify({
      path: pathname,
      // 只带来源主机名。完整 URL 可能含查询串，既占地方又涉及隐私
      referrer: document.referrer || "",
    });

    const url = "/api/stats/hit";

    try {
      if (typeof navigator.sendBeacon === "function") {
        // Blob 的类型必须是 application/json，否则服务端 request.json() 解析不了
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      }
    } catch {
      // sendBeacon 在个别浏览器/隐私模式下会抛，回落到 fetch
    }

    // keepalive 让请求在页面卸载后仍能完成，效果接近 sendBeacon
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // 统计失败不值得打扰任何人
    });
  }, [pathname]);

  return null;
}
