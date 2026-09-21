"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { inputClass, labelClass, hintClass, MessageBar, PageHeader, type SaveMessage } from "./ui";
import type { Friend } from "@/lib/content/friends";

/**
 * 友链编辑。
 *
 * 整体保存而不是逐条增删 —— 条目本来就少，一次提交比多次请求简单可靠得多
 * （不会出现"删了一半网络断了"的中间状态）。
 */
export function FriendEditor({ initial }: { initial: Friend[] }) {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>(initial);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  const dirty = JSON.stringify(friends) !== snapshot;

  function update(id: string, patch: Partial<Friend>) {
    setFriends((previous) =>
      previous.map((friend) => (friend.id === id ? { ...friend, ...patch } : friend)),
    );
  }

  function move(index: number, delta: number) {
    setFriends((previous) => {
      const next = [...previous];
      const target = index + delta;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function add() {
    setFriends((previous) => [
      ...previous,
      {
        id: `friend-${Date.now()}`,
        name: "",
        url: "",
        avatar: "",
        description: "",
      },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/friends", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friends }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        friends?: Friend[];
      };

      if (!response.ok || !data.friends) {
        setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
        return;
      }

      setFriends(data.friends);
      setSnapshot(JSON.stringify(data.friends));
      setMessage({ kind: "ok", text: "已保存，前台立刻生效" });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="友链" dirty={dirty} saving={saving} onSave={handleSave} />

      <MessageBar message={message} />

      <p className={hintClass}>
        名字和链接都空着的行会被自动丢弃，所以点了「添加」不填也没关系。
      </p>

      <ul className="space-y-4">
        {friends.map((friend, index) => (
          <li key={friend.id} className="glass space-y-4 p-5">
            <div className="flex items-center justify-between">
              <span className="index-num">
                {String(index + 1).padStart(2, "0")}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title="上移"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">上移</span>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === friends.length - 1}
                  title="下移"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">下移</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFriends((previous) => previous.filter((item) => item.id !== friend.id))
                  }
                  title="删除"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">删除</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`name-${friend.id}`} className={labelClass}>
                  名称
                </label>
                <input
                  id={`name-${friend.id}`}
                  value={friend.name}
                  onChange={(event) => update(friend.id, { name: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`url-${friend.id}`} className={labelClass}>
                  链接
                </label>
                <input
                  id={`url-${friend.id}`}
                  value={friend.url}
                  onChange={(event) => update(friend.id, { url: event.target.value })}
                  placeholder="https://"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor={`avatar-${friend.id}`} className={labelClass}>
                头像 URL
              </label>
              <input
                id={`avatar-${friend.id}`}
                value={friend.avatar}
                onChange={(event) => update(friend.id, { avatar: event.target.value })}
                placeholder="留空则显示名称首字"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor={`desc-${friend.id}`} className={labelClass}>
                简介
              </label>
              <textarea
                id={`desc-${friend.id}`}
                value={friend.description}
                onChange={(event) => update(friend.id, { description: event.target.value })}
                rows={2}
                className={`${inputClass} resize-y`}
              />
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-2 rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        添加一条
      </button>
    </div>
  );
}
