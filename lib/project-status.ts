import type { ProjectStatus } from "./content/projects";

/**
 * 项目状态的文案与配色。
 *
 * **单独成文件的理由**：它是纯展示常量，前台页面和后台编辑器都要用，
 * 而后台编辑器是客户端组件。如果把它留在 `lib/content/projects.ts` 里，
 * 客户端 import 它就会把整条依赖链（projects → store → node:fs/promises）
 * 一起打进浏览器包 —— 构建时会报
 * "Code generation for chunk item errored: lib/content/store.ts [app-client]"。
 *
 * 只 import 类型是安全的（会被编译期擦除），但**常量是运行时值**，擦不掉。
 * 所以凡是客户端要用的东西，都不能放在依赖 node:fs 的模块里。
 */
export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; className: string }
> = {
  active: {
    label: "进行中",
    className: "bg-jade/15 text-jade dark:text-jade-pale",
  },
  wip: {
    label: "开发中",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  archived: {
    label: "已归档",
    className: "bg-ink/10 text-ink-muted dark:bg-white/10 dark:text-slate-400",
  },
};
