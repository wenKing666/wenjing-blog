"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";
import { ImageField } from "./image-field";
import {
  inputClass,
  labelClass,
  hintClass,
  MessageBar,
  PageHeader,
  type SaveMessage,
} from "./ui";
import { PROJECT_STATUS } from "@/lib/project-status";
import type { Project, ProjectStatus } from "@/lib/content/projects";

export function ProjectEditor({ initial }: { initial: Project[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initial);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  const dirty = JSON.stringify(projects) !== snapshot;

  function update(id: string, patch: Partial<Project>) {
    setProjects((previous) =>
      previous.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );
  }

  function move(index: number, delta: number) {
    setProjects((previous) => {
      const next = [...previous];
      const target = index + delta;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function add() {
    setProjects((previous) => [
      ...previous,
      {
        id: `project-${Date.now()}`,
        name: "",
        description: "",
        url: "",
        repo: "",
        cover: "",
        tags: [],
        status: "active",
        featured: false,
        date: new Date().toISOString().slice(0, 10),
      },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        projects?: Project[];
      };

      if (!response.ok || !data.projects) {
        setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
        return;
      }

      setProjects(data.projects);
      setSnapshot(JSON.stringify(data.projects));
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
      <PageHeader title="项目" dirty={dirty} saving={saving} onSave={handleSave} />

      <MessageBar message={message} />

      <p className={hintClass}>
        共 {projects.length} 个。
        <strong className="font-semibold text-ink dark:text-white">精选</strong>
        的在前台会用整行大卡片展示，其余的走普通网格 —— 那是「最想让人看的东西」。
      </p>

      <ul className="space-y-5">
        {projects.map((project, index) => (
          <li key={project.id} className="glass space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="index-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {project.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-jade/15 px-2 py-0.5 font-sans text-[0.625rem] font-semibold text-jade dark:text-jade-pale">
                    <Star className="h-3 w-3" aria-hidden="true" />
                    精选
                  </span>
                )}
              </div>

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
                  disabled={index === projects.length - 1}
                  title="下移"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">下移</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setProjects((previous) => previous.filter((item) => item.id !== project.id))
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
                <label htmlFor={`name-${project.id}`} className={labelClass}>
                  名称
                </label>
                <input
                  id={`name-${project.id}`}
                  value={project.name}
                  onChange={(event) => update(project.id, { name: event.target.value })}
                  placeholder="留空的行会在保存时被丢掉"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={`date-${project.id}`} className={labelClass}>
                  日期
                </label>
                <input
                  id={`date-${project.id}`}
                  type="date"
                  value={project.date}
                  onChange={(event) => update(project.id, { date: event.target.value })}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            <div>
              <label htmlFor={`desc-${project.id}`} className={labelClass}>
                简介
              </label>
              <textarea
                id={`desc-${project.id}`}
                value={project.description}
                onChange={(event) => update(project.id, { description: event.target.value })}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`url-${project.id}`} className={labelClass}>
                  在线地址
                </label>
                <input
                  id={`url-${project.id}`}
                  value={project.url}
                  onChange={(event) => update(project.id, { url: event.target.value })}
                  placeholder="https://"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`repo-${project.id}`} className={labelClass}>
                  源码仓库
                </label>
                <input
                  id={`repo-${project.id}`}
                  value={project.repo}
                  onChange={(event) => update(project.id, { repo: event.target.value })}
                  placeholder="https://github.com/..."
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`tags-${project.id}`} className={labelClass}>
                  标签（逗号分隔）
                </label>
                <input
                  id={`tags-${project.id}`}
                  value={project.tags.join(", ")}
                  onChange={(event) =>
                    update(project.id, {
                      tags: event.target.value
                        .split(/[,，]/)
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Next.js, TypeScript"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={`status-${project.id}`} className={labelClass}>
                  状态
                </label>
                <select
                  id={`status-${project.id}`}
                  value={project.status}
                  onChange={(event) =>
                    update(project.id, { status: event.target.value as ProjectStatus })
                  }
                  className={inputClass}
                >
                  {Object.entries(PROJECT_STATUS).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ImageField
              id={`cover-${project.id}`}
              label="封面图"
              value={project.cover}
              onChange={(url) => update(project.id, { cover: url })}
              previewClassName="h-14 w-24"
              hint="选填。精选项目会把它放大作为左侧配图。"
            />

            <label className="inline-flex items-center gap-2 font-sans text-sm">
              <input
                type="checkbox"
                checked={project.featured}
                onChange={(event) => update(project.id, { featured: event.target.checked })}
                className="h-4 w-4 accent-[var(--color-jade)]"
              />
              设为精选（前台用大卡片展示）
            </label>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-2 rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        添加项目
      </button>
    </div>
  );
}
