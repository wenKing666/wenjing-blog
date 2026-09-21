import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = {
  title: "登录",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <div className="glass-xl w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold tracking-tight">管理后台</h1>
        <p className="mt-2 font-sans text-sm text-slate-500 dark:text-slate-400">
          输入管理密码以继续。
        </p>

        {/* useSearchParams 需要 Suspense 边界，否则整页会退化成客户端渲染 */}
        <Suspense fallback={<div className="mt-6 h-32" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
