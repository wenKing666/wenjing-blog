import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { contentDirs } from "./paths";
import { DEFAULT_SETTINGS, type SiteSettings } from "../site";

/** 头像历史保留几张。再多也没人翻，白白撑大 settings.json。 */
export const AVATAR_HISTORY_LIMIT = 5;

/**
 * 把读到的对象与默认值做深合并。
 *
 * 目的：以后给 SiteSettings 加了新字段，老站点的 settings.json 里没有这一项，
 * 也能拿到合理的默认值，而不是变成 undefined 把页面渲染炸掉。
 */
function mergeSettings(raw: unknown): SiteSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const input = raw as Partial<SiteSettings>;

  const motion =
    input.motion === "full" || input.motion === "off" || input.motion === "system"
      ? input.motion
      : DEFAULT_SETTINGS.motion;

  return {
    ...DEFAULT_SETTINGS,
    ...input,
    motion,
    splashMode:
      input.splashMode === "session" || input.splashMode === "off"
        ? input.splashMode
        : DEFAULT_SETTINGS.splashMode,
    // 只认 "stage"，其余一律回落成 "list" —— 坏数据不该让音乐页变成一片空白
    musicMode: input.musicMode === "stage" ? "stage" : "list",
    commentsEnabled: input.commentsEnabled !== false,
    commentModeration: input.commentModeration !== false,
    social: { ...DEFAULT_SETTINGS.social, ...(input.social ?? {}) },
    effects: { ...DEFAULT_SETTINGS.effects, ...(input.effects ?? {}) },
    /*
     * 背景图要去重 —— 前台是 `backgroundImages.map(src => <img key={src}>)`，
     * key 用 URL。同一个地址出现两次就是重复 key，React 会报警并且轮播错乱。
     * 顺手 trim + 丢掉空串（后台的 textarea 很容易多出空行）。
     */
    backgroundImages: Array.isArray(input.backgroundImages)
      ? Array.from(
          new Set(
            input.backgroundImages
              .filter((s): s is string => typeof s === "string")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        )
      : DEFAULT_SETTINGS.backgroundImages,
    themeColors:
      Array.isArray(input.themeColors) && input.themeColors.length >= 2
        ? input.themeColors.filter((s): s is string => typeof s === "string")
        : DEFAULT_SETTINGS.themeColors,
    icp: input.icp && typeof input.icp === "object" ? input.icp : null,
    avatarHistory: Array.isArray(input.avatarHistory)
      ? input.avatarHistory
          .filter((item): item is string => typeof item === "string")
          .slice(0, AVATAR_HISTORY_LIMIT)
      : DEFAULT_SETTINGS.avatarHistory,
    avatarStyle: input.avatarStyle === "frame" ? "frame" : "circle",
    avatarFrame:
      typeof input.avatarFrame === "string"
        ? input.avatarFrame
        : DEFAULT_SETTINGS.avatarFrame,
    // 夹在合理范围：坏数据不该把框放大到糊满整屏
    avatarFrameScale:
      typeof input.avatarFrameScale === "number" &&
      Number.isFinite(input.avatarFrameScale) &&
      input.avatarFrameScale >= 1 &&
      input.avatarFrameScale <= 4
        ? input.avatarFrameScale
        : DEFAULT_SETTINGS.avatarFrameScale,
    nowPlaying:
      typeof input.nowPlaying === "string"
        ? input.nowPlaying
        : DEFAULT_SETTINGS.nowPlaying,
    about: {
      /*
       * 空字符串落回内置默认文案。
       * 所以"清空内容并保存"= 恢复默认，而不是让关于页变成一片空白。
       */
      site:
        typeof input.about?.site === "string" && input.about.site.trim()
          ? input.about.site
          : DEFAULT_SETTINGS.about.site,
      tech:
        typeof input.about?.tech === "string" && input.about.tech.trim()
          ? input.about.tech
          : DEFAULT_SETTINGS.about.tech,
    },
  };
}

/**
 * 维护「最近用过的图片」。头像和头像框共用这一套逻辑。
 *
 * 只在**图真的变了、且旧图非空**时才记录。否则每保存一次设置
 * 都会把当前图塞进历史，列表很快就被同一张占满。
 *
 * 新的历史 = [旧图, ...去掉旧图和当前图的其余项]，截到上限。
 * 这样最新用过的永远排第一，且列表里不会出现重复。
 */
function pushHistory(
  existing: string[],
  previous: string,
  next: string,
): string[] {
  if (!previous || previous === next) return existing;

  const rest = existing.filter((item) => item !== previous && item !== next);
  return [previous, ...rest].slice(0, AVATAR_HISTORY_LIMIT);
}

/** 读取站点设置。文件不存在或损坏时回落到默认值，绝不让首屏挂掉。 */
export async function getSettings(): Promise<SiteSettings> {
  try {
    const raw = await fs.readFile(contentDirs.settings, "utf8");
    return mergeSettings(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error("[settings] 读取失败，回落到默认值:", err);
    }
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * 一次请求内共享的设置读取。
 * layout 的 generateMetadata 和页面正文都要读设置，用 cache 包一层避免重复读盘。
 */
export const getSettingsOnce = cache(getSettings);

/** 写入站点设置。同样走"临时文件 + rename"的原子替换。 */
export async function saveSettings(input: SiteSettings): Promise<SiteSettings> {
  const merged = mergeSettings(input);

  /*
   * 头像历史在这里维护，而不是在后台表单里。
   *
   * 放在这一层的好处：无论从哪个入口保存（设置页、将来可能加的
   * "一键切回头像"、直接调 API），历史都不会漏记 —— 表单只负责
   * 头像本身，记录历史是"保存"这个动作的副作用。
   */
  const previous = await getSettings();
  merged.avatarHistory = pushHistory(
    merged.avatarHistory,
    previous.avatar,
    merged.avatar,
  );

  /*
   * 注意这里**不要**在"框变了"时去重置 avatarFrameScale。
   *
   * 换框和算倍数是同一次保存里一起提交的（倍数由浏览器量出来），
   * 在这里重置只会把刚算好的值冲掉。
   *
   * 而"客户端没给倍数"这种情况，mergeSettings 已经让它回落成 1 了 ——
   * 所以本来就不需要额外的兜底。
   */

  const target = contentDirs.settings;

  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }

  return merged;
}

/** 首次启动时铺一份默认 settings.json，方便用户直接改文件。 */
export async function ensureSettingsFile(): Promise<void> {
  try {
    await fs.access(contentDirs.settings);
  } catch {
    await saveSettings(DEFAULT_SETTINGS);
  }
}
