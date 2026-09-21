"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `登录失败（HTTP ${response.status}）`);
        return;
      }

      // 只接受站内相对路径，防止 next 参数被用来做跳转钓鱼
      const rawNext = searchParams.get("next") ?? "/admin";
      const target = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/admin";

      router.replace(target);
      router.refresh();
    } catch {
      setError("无法连接服务器，请检查网络。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block font-sans text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          管理密码
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
          className="mt-2 w-full rounded-tile border border-white/50 bg-white/60 px-3 py-2 font-sans text-slate-900 outline-none transition-colors focus:border-jade dark:border-white/10 dark:bg-slate-900/60 dark:text-white"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-tile border border-red-500/30 bg-red-500/10 px-3 py-2 font-sans text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !password}
        className="inline-flex w-full items-center justify-center gap-2 rounded-tile bg-jade px-4 py-2.5 font-sans font-semibold text-white transition-colors hover:bg-jade-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogIn className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
