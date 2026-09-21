import { contentDirs } from "./paths";
import { readJson, writeJson } from "./store";

/**
 * 歌单与音源配置。
 *
 * ⚠️ 关于音源的说明（请读完再用）：
 *
 * 本站**不内置也不提供任何音乐解析接口**。`apiUrl` 由你自己填写，
 * 指向你自行部署或选择的第三方解析服务（社区里常见的是 Meting 协议：
 *   `{apiUrl}?server=netease&type=url&id={歌曲ID}` 返回音频地址
 *   `{apiUrl}?server=netease&type=pic&id={歌曲ID}` 返回封面
 *   `{apiUrl}?server=netease&type=lrc&id={歌曲ID}` 返回歌词）
 *
 * 这类接口抓取的是各音乐平台的非公开数据，属于版权灰区，且**会周期性失效** ——
 * 参考项目就在更新日志里记着"已更换 API，修复显示 bug"。
 * 接口挂了不用改代码，到后台换一个地址即可。
 *
 * 想彻底避开这些问题，把音频文件放进 content/uploads/ 用直链（`type: "direct"`）也可用。
 */

/** 一首歌。id 是它在来源平台上的 ID，不是本地主键。 */
export type Track = {
  /** 平台歌曲 ID */
  id: string;
  /** 音源：netease / tencent / kugou / kuwo ……由解析接口决定支持哪些 */
  server: string;
  /** 歌名与歌手。留空时前台会显示"未知"，填上体验更好 */
  name: string;
  artist: string;
  /** 直接给音频地址时用这个，填了就优先于解析接口 */
  directUrl: string;
};

/**
 * 音源方式。
 *
 *   builtin  内置的网易云直连（服务端调用网易的公开 Web 接口）
 *            零配置，填上歌曲 ID 就能用。代价是依赖网易的接口不变，
 *            且只有平台允许免费听的歌能播。
 *   custom   自定义解析接口（Meting 协议）。由你自己部署或指定，
 *            挂了换一个地址即可，支持多个平台。
 *
 * 两种都不需要 API Key。
 */
export type MusicSource = "builtin" | "custom";

export type MusicConfig = {
  source: MusicSource;
  /** 自定义解析接口地址。source=custom 时必填 */
  apiUrl: string;
  /** 列表标题，比如"我的歌单" */
  title: string;
  tracks: Track[];
};

export const DEFAULT_MUSIC: MusicConfig = {
  source: "builtin",
  apiUrl: "",
  title: "歌单",
  tracks: [],
};

export async function getMusicConfig(): Promise<MusicConfig> {
  const config = await readJson<MusicConfig>(contentDirs.music, DEFAULT_MUSIC);
  return {
    source: config.source === "custom" ? "custom" : "builtin",
    apiUrl: config.apiUrl?.trim() ?? "",
    title: config.title?.trim() || DEFAULT_MUSIC.title,
    tracks: Array.isArray(config.tracks)
      ? config.tracks.map((track) => ({
          id: String(track.id ?? "").trim(),
          server: String(track.server ?? "netease").trim() || "netease",
          name: String(track.name ?? "").trim(),
          artist: String(track.artist ?? "").trim(),
          directUrl: String(track.directUrl ?? "").trim(),
        }))
      : [],
  };
}

export async function saveMusicConfig(
  config: MusicConfig,
): Promise<MusicConfig> {
  const cleaned: MusicConfig = {
    source: config.source === "custom" ? "custom" : "builtin",
    apiUrl: config.apiUrl.trim().replace(/\/+$/, ""),
    title: config.title.trim() || DEFAULT_MUSIC.title,
    // 既没有平台 ID 又没有直链的条目留着也没用
    tracks: config.tracks.filter(
      (track) => track.id.trim() || track.directUrl.trim(),
    ),
  };
  return writeJson(contentDirs.music, cleaned);
}

/**
 * 播放器能不能用。
 *
 * 内置音源只要有曲目就行（歌曲 ID 就是全部所需）；
 * 自定义音源必须配了接口地址，或者至少有直链。
 */
export function isMusicPlayable(config: MusicConfig): boolean {
  if (config.tracks.length === 0) return false;
  if (config.source === "builtin") {
    return config.tracks.some((t) => t.id || t.directUrl);
  }
  return Boolean(config.apiUrl) || config.tracks.some((t) => t.directUrl);
}
