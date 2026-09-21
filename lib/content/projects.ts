import { contentDirs } from "./paths";
import { readJson, writeJson } from "./store";

/**
 * 项目/作品展示。
 *
 * 条目少、字段固定、需要整体排序 —— 和友链、相册一样用 JSON 存，
 * 一次读写搞定，后台表单也能直接映射。
 */

export type ProjectStatus = "active" | "wip" | "archived";

export type Project = {
  id: string;
  name: string;
  description: string;
  /** 在线地址 / 项目主页 */
  url: string;
  /** 代码仓库地址 */
  repo: string;
  cover: string;
  tags: string[];
  status: ProjectStatus;
  /** 精选：排在前面，前台可以额外强调 */
  featured: boolean;
  /** 开始或完成时间 YYYY-MM-DD，用来排序 */
  date: string;
};

export type ProjectInput = Omit<Project, "id"> & { id?: string };

function normalizeStatus(value: unknown): ProjectStatus {
  return value === "wip" || value === "archived" ? value : "active";
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * 排序：精选优先，然后按日期倒序。
 * 日期相同时用名字兜底，保证顺序稳定 —— 否则每次读出来顺序都可能不一样。
 */
export async function listProjects(): Promise<Project[]> {
  const raw = await readJson<unknown>(contentDirs.projects, []);
  if (!Array.isArray(raw)) return [];

  // 逐条校验：文件可能被手工改坏，一条坏数据不该让整页消失
  const projects = raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      description: String(item.description ?? ""),
      url: String(item.url ?? ""),
      repo: String(item.repo ?? ""),
      cover: String(item.cover ?? ""),
      tags: normalizeTags(item.tags),
      status: normalizeStatus(item.status),
      featured: item.featured === true,
      date: String(item.date ?? ""),
    }))
    .filter((project) => project.id && project.name);

  return projects.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
  });
}

export async function saveProjects(projects: Project[]): Promise<Project[]> {
  // 丢掉没有名字的行 —— 那多半是点了「添加」还没填
  const cleaned = projects
    .map((project) => ({
      ...project,
      name: project.name.trim(),
      description: project.description.trim(),
      url: project.url.trim(),
      repo: project.repo.trim(),
      cover: project.cover.trim(),
      date: project.date.trim(),
    }))
    .filter((project) => project.name);

  return writeJson(contentDirs.projects, cleaned);
}

export function newProjectId(): string {
  return `project-${Date.now()}`;
}

/** 汇总所有用到的标签，给后台做提示或前台做筛选。 */
export async function listProjectTags(): Promise<string[]> {
  const projects = await listProjects();
  return [...new Set(projects.flatMap((project) => project.tags))].sort();
}
