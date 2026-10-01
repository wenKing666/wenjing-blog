import { contentDirs } from "./paths";
import { readJson, writeJson } from "./store";
/*
 * 主键相关的常量和发号器住在 music/playlist-id.ts —— 那边刻意不依赖这个文件，
 * 后台的客户端组件才引得到（原因见那个文件的说明）。这里转出去，
 * 服务端代码仍旧从 content/music 拿，调用点不用改。
 */
import {
  createPlaylistId,
  LEGACY_PLAYLIST_ID,
  LEGACY_PLAYLIST_NAME,
} from "../music/playlist-id";

export { createPlaylistId, LEGACY_PLAYLIST_ID, LEGACY_PLAYLIST_NAME };

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

/**
 * 一个歌单。
 *
 * **注意这里刻意没有封面字段。** 歌单封面取的是它第一首歌的封面
 * （见前台的 `trackCover`）—— 网易同一张专辑里每首歌的 `picUrl` 是一模一样的，
 * 所以从专辑导入时，"第一首的封面"就是那张专辑的封面。
 * 少存一份数据，也就少一处可能和曲目不一致的地方。
 */
export type Playlist = {
  /**
   * 本地主键。前台切换歌单、后台增删改都认它。
   *
   * 一旦生成就**不能变** —— 它一变，前台记住的"上次听的是哪个歌单"就失效了。
   * 老数据迁移过来的那个固定叫 `default`（见 migrateMusic）。
   */
  id: string;
  /** 歌单名。从专辑导入时就是专辑名 */
  name: string;
  /** 来源备注，例如「专辑 · 周杰伦」。前台不显示，只在后台帮你认出这是哪来的 */
  note: string;
  tracks: Track[];
};

export type MusicConfig = {
  source: MusicSource;
  /** 自定义解析接口地址。source=custom 时必填 */
  apiUrl: string;
  playlists: Playlist[];
};

export const DEFAULT_MUSIC: MusicConfig = {
  source: "builtin",
  apiUrl: "",
  playlists: [],
};


/**
 * 规整自定义解析接口地址。
 *
 * **必须做这件事**：后台那个输入框是个纯文本框，而人填接口地址时
 * 十有八九只写 `example.com/api`，不会带协议。这个值后面会被
 * `new URL()` 直接吃掉 —— 不带协议就抛 ERR_INVALID_URL，结果是**每一首歌的请求都 500**，
 * 播放器完全没反应。
 *
 * 而且 `isMusicPlayable` 原来只看 `Boolean(apiUrl)`，填了个非法地址
 * 它照样返回 true —— 前台照常渲染播放器，用户点了没声音、也没有任何提示，
 * 只会以为网站坏了。
 *
 * 拿不到合法地址就返回空串，让"没配接口"这条既有逻辑接管。
 */
export function normalizeApiUrl(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  // 带 "://" 但不是 http/https —— 协议拼错了，当作没填
  if (/:\/\//.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return "";

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return "";
    if (/\s/.test(parsed.hostname)) return "";
    return candidate;
  } catch {
    return "";
  }
}


function normalizeTrack(track: Partial<Track> | undefined): Track | null {
  const id = String(track?.id ?? "").trim();
  const directUrl = String(track?.directUrl ?? "").trim();
  // 既没有平台 ID 又没有直链的条目留着也没用
  if (!id && !directUrl) return null;
  return {
    id,
    server: String(track?.server ?? "netease").trim() || "netease",
    name: String(track?.name ?? "").trim(),
    artist: String(track?.artist ?? "").trim(),
    directUrl,
  };
}

function normalizeTracks(input: unknown): Track[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    const track = normalizeTrack(item as Partial<Track>);
    return track ? [track] : [];
  });
}

/**
 * 磁盘上的原始形状。
 *
 * 这里的 `title` / `tracks` 是**旧版**的单歌单字段，只用于读取时迁移 ——
 * 保存之后就不再写它们了。留着是为了让已经上线的站点升级上来时
 * 那一个歌单不会凭空消失。
 */
type StoredMusic = {
  source?: string;
  apiUrl?: string;
  title?: string;
  tracks?: unknown;
  playlists?: unknown;
};

/**
 * 把磁盘上读到的东西归一化成当前的形状。
 *
 * 迁移规则：新字段 `playlists` 有内容就用它；否则把老的 `title` + `tracks`
 * 包成一个主键为 `default` 的歌单。两者都没有就是空。
 */
function migrateMusic(raw: StoredMusic): MusicConfig {
  const source: MusicSource = raw.source === "custom" ? "custom" : "builtin";
  const apiUrl = raw.apiUrl?.trim() ?? "";

  const playlists: Playlist[] = Array.isArray(raw.playlists)
    ? (raw.playlists as Partial<Playlist>[]).flatMap((item) => {
        const tracks = normalizeTracks(item?.tracks);
        const id = String(item?.id ?? "").trim();
        /*
         * 没有主键的歌单直接丢掉，不在这里补一个 —— 补的话每次读盘都会得到
         * 不同的主键，前台"当前是哪个歌单"就永远对不上了。
         */
        if (!id) return [];
        return [
          {
            id,
            name: String(item?.name ?? "").trim() || LEGACY_PLAYLIST_NAME,
            note: String(item?.note ?? "").trim(),
            tracks,
          },
        ];
      })
    : [];

  if (playlists.length > 0) return { source, apiUrl, playlists };

  const legacyTracks = normalizeTracks(raw.tracks);
  if (legacyTracks.length === 0) return { source, apiUrl, playlists: [] };

  return {
    source,
    apiUrl,
    playlists: [
      {
        id: LEGACY_PLAYLIST_ID,
        name: raw.title?.trim() || LEGACY_PLAYLIST_NAME,
        note: "",
        tracks: legacyTracks,
      },
    ],
  };
}

export async function getMusicConfig(): Promise<MusicConfig> {
  const raw = await readJson<StoredMusic>(contentDirs.music, {});
  return migrateMusic(raw);
}

export async function saveMusicConfig(
  config: MusicConfig,
): Promise<MusicConfig> {
  const cleaned: MusicConfig = {
    source: config.source === "custom" ? "custom" : "builtin",
    // 顺手补协议 + 校验，别把非法地址存进去（原因见 normalizeApiUrl 的注释）
    apiUrl: normalizeApiUrl(config.apiUrl),
    playlists: (Array.isArray(config.playlists) ? config.playlists : [])
      .map((playlist) => ({
        id: String(playlist?.id ?? "").trim(),
        name: String(playlist?.name ?? "").trim() || LEGACY_PLAYLIST_NAME,
        note: String(playlist?.note ?? "").trim(),
        tracks: normalizeTracks(playlist?.tracks),
      }))
      .filter((playlist) => playlist.id !== ""),
  };
  return writeJson(contentDirs.music, cleaned);
}

/** 所有歌单的曲目总数。首页/关于页那几个"共 N 首"的地方用它 */
export function countTracks(config: MusicConfig): number {
  return config.playlists.reduce((sum, list) => sum + list.tracks.length, 0);
}

/**
 * 播放器能不能用。
 *
 * 内置音源只要有曲目就行（歌曲 ID 就是全部所需）；
 * 自定义音源必须配了接口地址，或者至少有直链。
 */
export function isMusicPlayable(config: MusicConfig): boolean {
  const tracks = config.playlists.flatMap((list) => list.tracks);
  if (tracks.length === 0) return false;
  if (config.source === "builtin") {
    return tracks.some((t) => t.id || t.directUrl);
  }
  /*
   * 自定义模式必须校验地址本身合不合法。
   * 原来只看 `Boolean(apiUrl)` —— 填了 `example.com/api`（不带协议）
   * 也算"能播"，前台照常渲染播放器，用户点下去只会得到一片 500。
   */
  return (
    normalizeApiUrl(config.apiUrl) !== "" ||
    tracks.some((t) => t.directUrl)
  );
}