"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // 清掉 cookie 后必须刷新，让 proxy 重新判定登录态
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="flex w-full items-center gap-2.5 rounded-tile px-3 py-2 text-left font-sans text-sm text-slate-700 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:text-slate-200 dark:hover:text-red-400"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {busy ? "退出中…" : "退出登录"}
    </button>
  );
}
