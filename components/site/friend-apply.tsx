"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * 友链申请格式。
 *
 * 让访客一键复制，省得对方照着手敲格式还写错。
 * 复制用了 clipboard API，失败时（非 HTTPS、权限被拒）自动退回选中文本，
 * 让用户手动 Ctrl+C —— 总比点了没反应强。
 */
export function FriendApply({ template }: { template: string }) {
  const [copied, setCopied] = useState(false);
  /*
   * 「已复制」两秒后复位的定时器，卸载时要清掉 ——
   * 切页走的是 PageTransition（以 pathname 为 key 强制重挂载），
   * 必然卸载整棵子树，定时器会落在卸载之后。
   */
  const resetTimer = useRef(0);

  useEffect(() => {
    return () => window.clearTimeout(resetTimer.current);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 退回手动选中：把内容放进一个可选的区域，用户自己复制
      const range = document.createRange();
      const node = document.getElementById("friend-apply-text");
      if (node) {
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <section className="reveal glass glass-spec mt-14 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="rule-label flex-1">
          <span>申请友链</span>
        </h2>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-2 rounded-tile border border-jade/30 bg-jade/10 px-3 py-1.5 font-sans text-xs font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "已复制" : "复制格式"}
        </button>
      </div>

      <pre
        id="friend-apply-text"
        className="mt-5 overflow-x-auto rounded-tile bg-ink/5 p-4 font-mono text-xs leading-relaxed text-ink-soft dark:bg-white/5 dark:text-slate-300"
      >
        {template}
      </pre>

      <p className="mt-3 font-sans text-xs text-ink-faint dark:text-slate-500">
        复制上面的格式，把内容换成你自己的，然后通过页脚的邮箱发给我。
      </p>
    </section>
  );
}
