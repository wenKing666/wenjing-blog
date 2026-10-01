"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Disc3,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  inputClass,
  labelClass,
  hintClass,
  MessageBar,
  PageHeader,
  Section,
  type SaveMessage,
} from "./ui";
import type { MusicConfig, Playlist, Track } from "@/lib/content/music";
/*
 * 常量与发号器从 music/playlist-id 引，**不能**从 content/music 引 ——
 * 后者背后有一整条 node:fs 依赖链（见下面 import type 那段注释），
 * 而这里是个客户端组件。值和常量不像类型那样能被编译期抹掉。
 */
import {
  createPlaylistId,
  LEGACY_PLAYLIST_ID,
  LEGACY_PLAYLIST_NAME,
} from "@/lib/music/playlist-id";
import { formatTime } from "@/lib/format-time";
/*
 * 只引类型。`import type` 会在编译期被完全抹掉，不会把 netease.ts 里的
 * 请求逻辑打进浏览器包 —— 那个文件是服务端专用的（同样的原因，
 * track-id.ts 才被单独拆了出去）。
 */
import type { NeteaseAlbumHit, NeteaseSearchHit } from "@/lib/music/netease";

/** 解析接口通常支持这些平台，写成下拉省得用户手打错。 */
const SERVERS = [
  { value: "netease", label: "网易云音乐" },
  { value: "tencent", label: "QQ 音乐" },
  { value: "kugou", label: "酷狗音乐" },
  { value: "kuwo", label: "酷我音乐" },
  { value: "baidu", label: "百度音乐" },
];

/**
 * 付费类型的角标。
 *
 * `fee` 是网易的原始字段，取值含义记在 lib/music/netease.ts。
 * 标出来的目的只有一个：让人**加之前**就知道哪些加了也播不了 ——
 * 内置音源走的是网易对免费歌曲开放的外链，VIP 和付费专辑会返回空文件。
 */
function feeBadge(fee: number): { text: string; className: string } | null {
  if (fee === 1) {
    return {
      text: "VIP",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    };
  }
  if (fee === 4) {
    return {
      text: "付费专辑",
      className: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    };
  }
  if (fee === 8) {
    return {
      text: "低音质",
      className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    };
  }
  return null;
}

/**
 * 后台表单里的一行：曲目本身 + 一个**只在本地用**的行标识。
 *
 * ★ 为什么要往曲目对象里塞一个额外的字段，而不是另开一个 rowIds 数组：
 *
 * 折叠 + 拖拽之后，React 的 key 不能再是下标了 —— 拖完一条，下标和内容的
 * 对应关系就变了，React 会按位置复用节点，展开状态、输入框里的光标全会串行。
 * 而 key 也不能从内容里算：`id` 是用户正在编辑的字段，敲一个字符 key 就变，
 * 整行重新挂载，**输入框在打字途中丢焦点**。
 *
 * 所以标识只能是"发一次、跟着对象走"。挂在对象上之后，展开、交换、splice、
 * filter 全都自动带着它，不存在两份状态对不齐的可能。
 *
 * `rowId` 不保存、不进配置文件、不参与脏检查（见 serialize）。
 */
type TrackRow = Track & { rowId: string };

/**
 * 组件内部的歌单形态：曲目带上本地行标识。
 * 存盘前要经过 toSaved 剥掉 rowId。
 */
type EditorPlaylist = Omit<Playlist, "tracks"> & { tracks: TrackRow[] };

/** 组件内部的配置形态。 */
type EditorConfig = {
  source: MusicConfig["source"];
  apiUrl: string;
  playlists: EditorPlaylist[];
};

/**
 * 脏检查用的序列化。
 *
 * ★ 必须剥掉 rowId —— 不剥的话 config 永远比 initial 多一个字段，
 *   表单一进来就顶着「未保存」。
 *
 * ★ 每首曲目序列化成**数组**而不是对象：对象的键序不同，字符串就不同，
 *   「未保存」会永远亮着。歌单名和备注也一并进指纹，
 *   光改个歌单名同样得让人看见"未保存"。
 */
function serialize(config: {
  source: MusicConfig["source"];
  apiUrl: string;
  playlists: readonly {
    id: string;
    name: string;
    note: string;
    tracks: readonly Track[];
  }[];
}): string {
  return JSON.stringify({
    source: config.source,
    apiUrl: config.apiUrl,
    playlists: config.playlists.map((list) => [
      list.id,
      list.name,
      list.note,
      list.tracks.map((track) => [
        track.id,
        track.server,
        track.name,
        track.artist,
        track.directUrl,
      ]),
    ]),
  });
}

/** 送去 PUT 的请求体。rowId 绝不能进配置文件。 */
function toSaved(config: EditorConfig): MusicConfig {
  return {
    source: config.source,
    apiUrl: config.apiUrl,
    playlists: config.playlists.map((list) => ({
      id: list.id,
      name: list.name,
      note: list.note,
      tracks: list.tracks.map(({ id, server, name, artist, directUrl }) => ({
        id,
        server,
        name,
        artist,
        directUrl,
      })),
    })),
  };
}

export function MusicEditor({ initial }: { initial: MusicConfig }) {
  const router = useRouter();
  const [config, setConfig] = useState<EditorConfig>(() => {
    /*
     * 一个歌单都没有时**先摆一个空的**。
     *
     * 不是偷懒：整套编辑界面（曲目列表、拖拽、搜索加歌）都是围绕"当前歌单"
     * 写的，没有当前歌单就得让每一处都处理"可能不存在"，白白多出一堆分支。
     * 摆一个空的，界面各处照常工作，用户往里加的第一首歌就是它的内容。
     *
     * 主键用固定的 default 而不是随机值：这个初始化函数服务端和客户端
     * 各跑一次，随机会在两边得到不同的 id。
     */
    const playlists =
      initial.playlists.length > 0
        ? initial.playlists
        : [
            {
              id: LEGACY_PLAYLIST_ID,
              name: LEGACY_PLAYLIST_NAME,
              note: "",
              tracks: [],
            },
          ];

    return {
      source: initial.source,
      apiUrl: initial.apiUrl,
      playlists: playlists.map((list) => ({
        ...list,
        tracks: list.tracks.map((track, index) => ({
          ...track,
          rowId: `t${index}`,
        })),
      })),
    };
  });
  const [snapshot, setSnapshot] = useState(() => serialize(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  /** 当前编辑的是哪个歌单（主键）。存主键不存下标 —— 删掉一个歌单之后下标的含义会整体前移 */
  const [activeId, setActiveId] = useState(
    () => initial.playlists[0]?.id ?? LEGACY_PLAYLIST_ID,
  );

  /** 当前歌单。主键找不到（比如刚被删掉）就退到第一个 */
  const active =
    config.playlists.find((list) => list.id === activeId) ?? config.playlists[0];

  /** 改**当前歌单**。曲目的增删改全都从这儿走 */
  function setActive(patch: (list: EditorPlaylist) => EditorPlaylist) {
    setConfig((previous) => ({
      ...previous,
      playlists: previous.playlists.map((list) =>
        list.id === active.id ? patch(list) : list,
      ),
    }));
  }

  /**
   * 行标识发号器。初值取初始曲目总数，免得和已经发出去的 t0..t(n-1) 撞上。
   *
   * 用递增序号而不是 crypto.randomUUID()：这个组件会被服务端预渲染一遍，
   * 随机会在两边各算一次。key 不进 DOM、不会报水合不一致，但"两边算出不同的
   * 东西"这件事本身就该避免。
   */
  const rowSeqRef = useRef(
    initial.playlists.reduce((sum, list) => sum + list.tracks.length, 0),
  );
  const nextRowId = () => `t${rowSeqRef.current++}`;

  /** 展开了哪几行 */
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  /** 正在拖的行下标；null = 没在拖 */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** 插入位，取值 0..曲目数 —— 是"插到第几行之前"，不是目标下标 */
  const [dropAt, setDropAt] = useState<number | null>(null);

  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  /** null = 还没搜过，结果区不渲染 */
  const [results, setResults] = useState<NeteaseSearchHit[] | null>(null);
  /** 搜的是单曲还是专辑 */
  const [searchKind, setSearchKind] = useState<"song" | "album">("song");
  /** 专辑结果。和 results 分开存：两种结果形状不同，合起来到处都得窄化 */
  const [albumResults, setAlbumResults] = useState<NeteaseAlbumHit[] | null>(null);
  /** 正在取曲目的那张专辑。非空时所有"加为歌单"都禁用，防连点建出一堆重复歌单 */
  const [albumBusy, setAlbumBusy] = useState<string | null>(null);
  const [albumNote, setAlbumNote] = useState<string | null>(null);
  /** 搜出当前这批结果时用的关键词，只用于"没搜到 xxx"那句提示 */
  const [searchedFor, setSearchedFor] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const dirty = serialize(config) !== snapshot;

  /*
   * every() 而不是 size >= length：保存后可能残留已不存在的标识，
   * 用 size 判断会虚高，按钮文字就错了。
   */
  const allOpen =
    active.tracks.length > 0 &&
    active.tracks.every((track) => openRows.has(track.rowId));

  /** 有 ID 的曲目才值得抓。 */
  const ids = active.tracks
    .map((track) => track.id.trim())
    .filter((id) => /^\d{1,20}$/.test(id));
  const hasFetchableIds = ids.length > 0;

  /**
   * 从音源抓取歌名、歌手、封面、歌词，写回表单。
   *
   * 只覆盖抓到的字段，抓不到就保留原样 —— 手填的内容不该被空值冲掉。
   * 注意抓完要点保存才落到文件里。
   */
  async function fetchInfo() {
    setFetchingInfo(true);
    setFetchNote(null);

    try {
      const response = await fetch(`/api/music/info?ids=${ids.join(",")}`);
      const data = (await response.json().catch(() => ({}))) as {
        songs?: { id: string; name: string; artist: string; error?: string }[];
        error?: string;
      };

      if (!response.ok || !data.songs) {
        setFetchNote(data.error ?? "抓取失败");
        return;
      }

      const byId = new Map(data.songs.map((song) => [song.id, song]));
      let filled = 0;
      const failures: string[] = [];

      setActive((list) => ({
        ...list,
        tracks: list.tracks.map((track) => {
          if (!track.directUrl && !track.id) return track;
          const song = byId.get(track.id.trim());
          if (!song) return track;
          if (song.error) {
            failures.push(song.error);
            return track;
          }
          filled += 1;
          return {
            ...track,
            name: song.name || track.name,
            artist: song.artist || track.artist,
          };
        }),
      }));

      /*
       * 把失败原因带出来。
       *
       * 原来无论什么原因都写"（可能已下架）"—— 遇到网易限流时，
       * 这句会把人往"歌没了、去删掉吧"的方向带，而实际只是服务器 IP
       * 被"操作频繁"挡了，等一会儿自己就好。错误信息不该比实际情况更吓人。
       */
      const reason = failures[0];
      setFetchNote(
        failures.length > 0
          ? `已填充 ${filled} 首，${failures.length} 首没抓到${reason ? `（${reason}）` : ""}。记得点保存。`
          : `已填充 ${filled} 首。记得点保存。`,
      );
    } catch {
      setFetchNote("无法连接服务器。");
    } finally {
      setFetchingInfo(false);
    }
  }

  /** 搜歌或搜专辑。浏览器只跟自己的后台说话，由服务端去问网易云。 */
  async function runSearch() {
    const keyword = query.trim();
    if (!keyword || searching) return;

    setSearching(true);
    setSearchError(null);
    setAlbumNote(null);

    try {
      const response = await fetch(
        `/api/admin/music/search?q=${encodeURIComponent(keyword)}${
          searchKind === "album" ? "&type=album" : ""
        }`,
      );
      const data = (await response.json().catch(() => ({}))) as {
        songs?: NeteaseSearchHit[];
        albums?: NeteaseAlbumHit[];
        error?: string;
      };

      /*
       * 按当前这一档取结果。不能只看 response.ok ——
       * 出错时两条列表都是 undefined，当成失败处理。
       */
      const hits = searchKind === "album" ? data.albums : data.songs;
      if (!response.ok || !hits) {
        setSearchError(data.error ?? `搜索失败（HTTP ${response.status}）`);
        setResults(null);
        setAlbumResults(null);
        return;
      }

      if (searchKind === "album") {
        setAlbumResults(data.albums ?? []);
        setResults(null);
      } else {
        setResults(data.songs ?? []);
        setAlbumResults(null);
      }
      setSearchedFor(keyword);
    } catch {
      setSearchError("无法连接服务器。");
      setResults(null);
      setAlbumResults(null);
    } finally {
      setSearching(false);
    }
  }

  /**
   * 把一张专辑整张存成一个新歌单。
   *
   * 曲目一次性从服务端拿回来（见 /api/admin/music/album），不用一首首抓 ——
   * 专辑详情本来就是成批给的。建好之后**直接切过去**，人马上能看见结果。
   */
  async function importAlbum(hit: NeteaseAlbumHit) {
    if (albumBusy) return;
    setAlbumBusy(hit.id);
    setAlbumNote(null);

    try {
      const response = await fetch(
        `/api/admin/music/album?id=${encodeURIComponent(hit.id)}`,
      );
      const data = (await response.json().catch(() => ({}))) as {
        album?: { name: string; artist: string; tracks: NeteaseSearchHit[] };
        error?: string;
      };

      if (!response.ok || !data.album) {
        setAlbumNote(data.error ?? `取专辑失败（HTTP ${response.status}）`);
        return;
      }

      const album = data.album;
      const id = createPlaylistId();
      /* 行标识在更新函数**外面**发，理由见 addHit 里那段 */
      const rows = album.tracks.map((track) => ({
        rowId: nextRowId(),
        id: track.id,
        server: "netease",
        name: track.name,
        artist: track.artist,
        directUrl: "",
      }));

      setConfig((previous) => ({
        ...previous,
        playlists: [
          ...previous.playlists,
          {
            id,
            name: album.name || hit.name || "新歌单",
            note: album.artist ? `专辑 · ${album.artist}` : "专辑导入",
            tracks: rows,
          },
        ],
      }));
      setActiveId(id);
      setAlbumNote(
        `已把「${album.name || hit.name}」存成新歌单，共 ${rows.length} 首。记得点保存。`,
      );
    } catch {
      setAlbumNote("无法连接服务器。");
    } finally {
      setAlbumBusy(null);
    }
  }

  /**
   * 把搜索结果加进歌单。
   *
   * 歌名歌手在这儿就填上了 —— 搜索结果本来就有，没必要加完再点一次
   * 「抓取歌曲信息」。封面和歌词仍由前台的 /api/music 按歌曲 ID 取，
   * 不存进配置文件。
   */
  function addHit(hit: NeteaseSearchHit) {
    /*
     * 标识在更新函数**外面**发。StrictMode 下更新函数会被调用两次，
     * 在里面发号会平白多消耗一个号（结果仍然对，但没必要）。
     */
    const rowId = nextRowId();

    /*
     * 刻意**不自动展开**这一行。
     *
     * 搜索结果已经把歌名歌手填好了，加进去没有需要立刻改的东西；
     * 连加十首就自动展开十行的话，折叠本身也就白做了。
     * 反馈交给行尾那个会变成「已在歌单」的按钮。
     */
    setActive((list) =>
      list.tracks.some((track) => track.id.trim() === hit.id)
        ? list
        : {
            ...list,
            tracks: [
              ...list.tracks,
              {
                rowId,
                id: hit.id,
                server: "netease",
                name: hit.name,
                artist: hit.artist,
                directUrl: "",
              },
            ],
          },
    );
  }

  /** 展开 / 收起一行。 */
  function toggleRow(rowId: string) {
    setOpenRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  /**
   * 全部展开 / 全部收起。
   *
   * 用 Set 而不是"当前展开第几个"那种单值状态，就是为了这里能表达得出来 ——
   * 单值状态下的"全部展开"根本不存在。而且整理歌单本来就是批量活：
   * 抓完信息往往要连着改好几首，单值会在你点开下一行的瞬间把上一行收掉，
   * 还得重新滚回去找。
   */
  function toggleAllRows() {
    setOpenRows(
      allOpen ? new Set() : new Set(active.tracks.map((track) => track.rowId)),
    );
  }

  /**
   * 删掉一行。
   *
   * openRows 里会残留一个死标识，**故意不清** —— 它匹配不上任何活着的行，
   * 代价只是一个 Set 条目；要清就得再穿一次状态更新进删除流程，不划算。
   */
  function removeTrack(index: number) {
    setActive((list) => ({
      ...list,
      tracks: list.tracks.filter((_, i) => i !== index),
    }));
  }

  /** 新增一个空行，并**自动展开** —— 它是空的，下一步就是往里填 ID。 */
  function addEmptyTrack() {
    const rowId = nextRowId();
    setActive((list) => ({
      ...list,
      tracks: [
        ...list.tracks,
        { rowId, id: "", server: "netease", name: "", artist: "", directUrl: "" },
      ],
    }));
    setOpenRows((previous) => new Set(previous).add(rowId));
  }

  /**
   * 把第 from 首放到 to 号**插入位**。
   *
   * `to` 取 0..length，含义是"插到第 to 行之前"，不是目标下标 ——
   * 指示线画在行的上沿，两端都用插入位表示就不会出现经典的差一位错误。
   */
  function dropTrack(from: number, to: number) {
    setActive((list) => {
      if (from < 0 || from >= list.tracks.length) return list;

      const target = to > from ? to - 1 : to;
      // 原地放下：连重渲染都不必，也不会平白把表单弄脏
      if (target === from) return list;

      const next = [...list.tracks];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      // 整个对象搬移，rowId 自动跟着走 —— 这就是把它挂在对象上的回报
      return { ...list, tracks: next };
    });
  }

  function updateTrack(index: number, patch: Partial<Track>) {
    setActive((list) => ({
      ...list,
      tracks: list.tracks.map((track, i) =>
        i === index ? { ...track, ...patch } : track,
      ),
    }));
  }

  function moveTrack(index: number, delta: number) {
    setActive((list) => {
      const next = [...list.tracks];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...list, tracks: next };
    });
  }

  /** 新建一个空歌单并切过去。主键在事件里发，不在渲染期算 */
  function addPlaylist() {
    const id = createPlaylistId();
    setConfig((previous) => ({
      ...previous,
      playlists: [
        ...previous.playlists,
        {
          id,
          name: `歌单 ${previous.playlists.length + 1}`,
          note: "",
          tracks: [],
        },
      ],
    }));
    setActiveId(id);
  }

  /**
   * 删掉当前歌单（连同里面的曲目）。
   *
   * 至少留一个 —— 一个不剩的话整个编辑器就没有"当前歌单"可编辑了。
   * 按钮只在歌单数 > 1 时出现，这里的兜底是防手滑，不是为了走得到。
   */
  function removePlaylist() {
    if (config.playlists.length <= 1) return;
    const rest = config.playlists.filter((list) => list.id !== active.id);
    setConfig((previous) => ({
      ...previous,
      playlists: previous.playlists.filter((list) => list.id !== active.id),
    }));
    setActiveId(rest[0]?.id ?? LEGACY_PLAYLIST_ID);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/music", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSaved(config)),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        music?: MusicConfig;
      };

      if (!response.ok || !data.music) {
        setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
        return;
      }

      // 先取成 const —— 收窄后的类型才能带进 setConfig 的回调里
      const saved = data.music;
      setConfig((previous) => ({
        source: saved.source,
        apiUrl: saved.apiUrl,
        playlists: saved.playlists.map((list, listIndex) => ({
          ...list,
          tracks: list.tracks.map((track, index) => ({
            ...track,
            /*
             * 服务端会丢掉"既没有 ID 又没有直链"的空行（见 lib/content/music.ts 的
             * saveMusicConfig），回来的数组可能比发出去时短，所以不能直接切旧数组。
             * 按位置沿用旧标识只是为了让已展开的行尽量别乱跳；真错位了也无所谓 ——
             * 标识只需要唯一。为这个在客户端复刻一遍服务端的过滤规则不值得。
             */
            rowId:
              previous.playlists[listIndex]?.tracks[index]?.rowId ?? nextRowId(),
          })),
        })),
      }));
      setSnapshot(serialize(saved));
      setMessage({ kind: "ok", text: "已保存，刷新前台即可看到" });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "无法连接服务器。" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="音乐" dirty={dirty} saving={saving} onSave={handleSave} />

      <MessageBar message={message} />

      <Section title="音源" description="决定播放器去哪儿取音频和歌曲信息。">
        <div>
          <label htmlFor="musicSource" className={labelClass}>
            音源方式
          </label>
          <select
            id="musicSource"
            value={config.source}
            onChange={(event) =>
              setConfig((previous) => ({
                ...previous,
                source: event.target.value as MusicConfig["source"],
              }))
            }
            className={inputClass}
          >
            <option value="builtin">内置 · 网易云直连（推荐，零配置）</option>
            <option value="custom">自定义解析接口</option>
          </select>
        </div>

        {config.source === "builtin" ? (
          <div className="rounded-tile border border-ink/8 p-4 dark:border-white/8">
            <p className="font-sans text-sm leading-relaxed text-ink-soft dark:text-slate-300">
              不需要配置任何接口 —— 下面填上歌曲 ID，服务端会去网易云取歌名、歌手、
              封面和歌词，音频也由服务端代为转发。
            </p>
            <p className="mt-2 font-sans text-xs leading-relaxed text-ink-faint dark:text-slate-500">
              <strong className="font-semibold text-ink dark:text-white">
                用之前请知情：
              </strong>
              它调的是网易云网页版在用的内部接口，不是官方开放平台 ——
              <strong className="font-semibold">随时可能失效或改结构</strong>，
              届时换回自定义接口即可。
              另外只有平台允许免费听的歌能播，VIP / 独家歌曲会加载失败。
              版权上属于灰区，请自行判断使用风险。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-tile border border-amber-500/25 bg-amber-500/8 p-4">
              <p className="font-sans text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                接口地址指向第三方解析服务（社区里常见的是 Meting 协议）。
                它<strong className="font-semibold">会周期性失效</strong>，
                但换一个地址即可，不用改代码。
              </p>
              <p className="mt-2 font-sans text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                协议要求：
                <code className="mx-1 font-mono">
                  {"{接口地址}?server=netease&type=url&id={歌曲ID}"}
                </code>
                返回音频，<code className="mx-1 font-mono">type=pic</code> 返回封面。
                服务端按这个格式去请求，并代为转发给浏览器。
              </p>
            </div>

            <div>
              <label htmlFor="apiUrl" className={labelClass}>
                解析接口地址
              </label>
              <input
                id="apiUrl"
                value={config.apiUrl}
                onChange={(event) =>
                  setConfig((previous) => ({ ...previous, apiUrl: event.target.value }))
                }
                placeholder="https://your-meting-instance.example.com/api"
                className={`${inputClass} font-mono`}
              />
              <p className={hintClass}>留空则播放器只显示歌单、不能播放。</p>
            </div>
          </div>
        )}

        <p className={hintClass}>
          无论是哪种方式，把音频放进
          <code className="mx-1 font-mono">content/uploads/</code>
          再在曲目里填「直链」，都能绕开所有外部依赖 —— 也最稳。
        </p>
      </Section>

      <Section
        title="歌单"
        description="可以放多个歌单，前台的右栏能左右切换。从专辑导入会自动建成一个新歌单。"
      >
        <div className="flex flex-wrap items-center gap-2">
          {config.playlists.map((list) => {
            const selected = list.id === active.id;
            return (
              <button
                key={list.id}
                type="button"
                onClick={() => setActiveId(list.id)}
                aria-pressed={selected}
                className={`inline-flex items-center gap-1.5 rounded-tile border px-3 py-1.5 font-sans text-sm font-semibold transition-colors ${
                  selected
                    ? "border-jade bg-jade text-white"
                    : "border-ink/15 text-ink-soft hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300 dark:hover:text-jade-pale"
                }`}
              >
                {list.name || "未命名"}
                <span className="tnum font-mono text-[0.6875rem] opacity-60">
                  {list.tracks.length}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={addPlaylist}
            className="inline-flex items-center gap-1.5 rounded-tile border border-dashed border-ink/20 px-3 py-1.5 font-sans text-sm font-semibold text-ink-soft transition-colors hover:border-jade/50 hover:text-jade dark:border-white/20 dark:text-slate-300"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            新建歌单
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="playlistName" className={labelClass}>
              歌单名
            </label>
            <input
              id="playlistName"
              value={active.name}
              onChange={(event) =>
                setActive((list) => ({ ...list, name: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="playlistNote" className={labelClass}>
              备注（选填）
            </label>
            <input
              id="playlistNote"
              value={active.note}
              onChange={(event) =>
                setActive((list) => ({ ...list, note: event.target.value }))
              }
              placeholder="专辑 · 周杰伦"
              className={inputClass}
            />
            <p className={hintClass}>只在后台显示，用来记住这个歌单是从哪儿来的。</p>
          </div>
        </div>

        {config.playlists.length > 1 && (
          <button
            type="button"
            onClick={removePlaylist}
            className="inline-flex items-center gap-1.5 rounded-tile border border-red-500/30 px-3 py-1.5 font-sans text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            删除当前歌单
          </button>
        )}
      </Section>

      <Section
        title="从网易云搜索"
        description="搜到点一下就能加进歌单。搜专辑还能把整张专辑一次存成一个新歌单。"
      >
        {/* 搜单曲还是搜专辑。两种结果长得不一样，所以分开渲染 */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "song", label: "单曲" },
              { key: "album", label: "专辑" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setSearchKind(option.key);
                setSearchError(null);
              }}
              aria-pressed={searchKind === option.key}
              className={`rounded-tile border px-3 py-1.5 font-sans text-sm font-semibold transition-colors ${
                searchKind === option.key
                  ? "border-jade bg-jade text-white"
                  : "border-ink/15 text-ink-soft hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300 dark:hover:text-jade-pale"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="musicQuery" className={labelClass}>
              关键词
            </label>
            <input
              id="musicQuery"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                searchKind === "album" ? "专辑名或歌手名" : "歌名、歌手、专辑都行"
              }
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex items-center gap-2 rounded-tile border border-ink/12 px-4 py-2 font-sans text-sm font-semibold text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/12 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            搜索
          </button>
        </form>

        {searchError && (
          <p className="font-sans text-xs text-red-600 dark:text-red-400">
            {searchError}
          </p>
        )}

        {albumNote && (
          <p className="font-sans text-xs text-jade dark:text-jade-pale">
            {albumNote}
          </p>
        )}

        {searchKind === "song" && results !== null && results.length === 0 && (
          <p className={hintClass}>没搜到「{searchedFor}」，换个关键词试试。</p>
        )}

        {searchKind === "album" &&
          albumResults !== null &&
          albumResults.length === 0 && (
            <p className={hintClass}>
              没搜到「{searchedFor}」这张专辑，换个关键词试试。
            </p>
          )}

        {searchKind === "song" && results !== null && results.length > 0 && (
          <ul className="divide-y divide-ink/8 dark:divide-white/8">
            {results.map((hit) => {
              const added = active.tracks.some(
                (track) => track.id.trim() === hit.id,
              );
              const badge = feeBadge(hit.fee);

              return (
                <li key={hit.id} className="flex items-center gap-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 后台缩略图，无需图片优化器 */}
                  <img
                    src={hit.cover}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-tile bg-ink/5 object-cover dark:bg-white/5"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-semibold">
                      {hit.name || "（无标题）"}
                    </p>
                    <p className="truncate font-sans text-xs text-ink-faint dark:text-slate-500">
                      {[hit.artist, hit.album].filter(Boolean).join(" · ") ||
                        "未知歌手"}
                    </p>
                  </div>

                  {badge && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-sans text-xs font-semibold ${badge.className}`}
                    >
                      {badge.text}
                    </span>
                  )}

                  {hit.duration > 0 && (
                    <span className="shrink-0 font-mono text-xs text-ink-faint dark:text-slate-500">
                      {formatTime(hit.duration / 1000)}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => addHit(hit)}
                    disabled={added}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-tile border border-jade/30 bg-jade/10 px-3 py-1.5 font-sans text-xs font-semibold text-jade transition-colors hover:bg-jade/20 disabled:border-ink/10 disabled:bg-transparent disabled:text-ink-faint dark:text-jade-pale dark:disabled:text-slate-500"
                  >
                    {added ? (
                      "已在歌单"
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        加入
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {searchKind === "album" &&
          albumResults !== null &&
          albumResults.length > 0 && (
            <ul className="divide-y divide-ink/8 dark:divide-white/8">
              {albumResults.map((album) => {
                const busy = albumBusy === album.id;
                return (
                  <li key={album.id} className="flex items-center gap-3 py-2">
                    {album.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 后台缩略图，无需图片优化器
                      <img
                        src={album.cover}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-tile bg-ink/5 object-cover dark:bg-white/5"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-ink/5 text-ink-faint dark:bg-white/5 dark:text-slate-500">
                        <Disc3 className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-sm font-semibold">
                        {album.name || "（无标题）"}
                      </p>
                      <p className="truncate font-sans text-xs text-ink-faint dark:text-slate-500">
                        {[
                          album.artist,
                          album.size > 0 ? `${album.size} 首` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "未知歌手"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void importAlbum(album)}
                      disabled={busy || albumBusy !== null}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-tile border border-jade/30 bg-jade/10 px-3 py-1.5 font-sans text-xs font-semibold text-jade transition-colors hover:bg-jade/20 disabled:border-ink/10 disabled:bg-transparent disabled:text-ink-faint dark:text-jade-pale dark:disabled:text-slate-500"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {busy ? "取曲目中…" : "加为歌单"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

        <p className={hintClass}>
          带 <span className="font-semibold">VIP</span> /{" "}
          <span className="font-semibold">付费专辑</span>{" "}
          角标的歌，加进去也播不了 —— 内置音源走的是网易对免费歌曲开放的外链，
          这一点不会因为换了添加方式而改变。<span className="font-semibold">
            低音质
          </span>{" "}
          的能播，但只有 128kbps。
        </p>
      </Section>

      <Section
        title={`曲目（${active.tracks.length} 首）`}
        description="填平台歌曲 ID 即可，歌名和歌手留空也能播，但填上体验更好。拖动左侧把手调整顺序，点一行展开编辑。"
      >
        <ul
          className="space-y-2"
          onDragOver={(event) => {
            /*
             * 列表本身也要拦一下：行与行之间有 space-y-2 的缝隙，光标落在缝隙里
             * 不会触发任何一行的 dragover —— 而不 preventDefault 就等于放弃 drop 资格。
             * 这里不重算插入位，沿用最后一次算出来的那个。
             */
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          }}
          onDragLeave={(event) => {
            // 在行与行之间移动也会触发 dragleave，只有真的离开整个列表才清空
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropAt(null);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragFrom !== null && dropAt !== null) dropTrack(dragFrom, dropAt);
            setDragFrom(null);
            setDropAt(null);
          }}
        >
          {active.tracks.map((track, index) => {
            const open = openRows.has(track.rowId);
            const bodyId = `track-body-${track.rowId}`;
            /*
             * 歌名空着时显示「曲目 <ID>」。措辞和前台歌单保持一致
             * （music-stage.tsx 里的 itemInfo.name || `曲目 ${item.id}`）——
             * 只有 ID 的行一眼认不出是哪首，留空更糟。
             */
            const title = track.name || (track.id ? `曲目 ${track.id}` : "未命名曲目");
            const platform =
              SERVERS.find((server) => server.value === track.server)?.label ??
              track.server;
            // 既没 ID 又没直链的行，保存时会被服务端悄悄丢掉（见 saveMusicConfig）
            const unsaveable = !track.id.trim() && !track.directUrl.trim();

            return (
              <li
                key={track.rowId}
                onDragOver={(event) => {
                  /*
                   * 按**这一行自己的**矩形算插入位，不假定所有行等高 ——
                   * 有的行展开着、有的收着，高度差很多。
                   * 光标过了这行的中线就插到它下面。
                   */
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDropAt(
                    index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0),
                  );
                }}
                className={`relative rounded-tile border border-ink/8 transition-opacity dark:border-white/8 ${
                  dragFrom === index ? "opacity-40" : ""
                }`}
              >
                {/*
                  插入位置指示线。absolute 不占布局，所以出现/消失时下面的行不会跳。
                  每行只画上沿那一条，覆盖插入位 0..n-1；插入位 n（放到最后）
                  没有"下一行"可以借，所以只有最后一行额外补一条下沿的。
                */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-1 -top-1.5 h-0.5 rounded-full bg-jade shadow-[0_0_8px_var(--color-jade)] transition-opacity duration-200 ease-[var(--ease-smooth)] dark:bg-jade-pale ${
                    dropAt === index ? "opacity-100" : "opacity-0"
                  }`}
                />
                {index === active.tracks.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-1 -bottom-1.5 h-0.5 rounded-full bg-jade shadow-[0_0_8px_var(--color-jade)] transition-opacity duration-200 ease-[var(--ease-smooth)] dark:bg-jade-pale ${
                      dropAt === active.tracks.length ? "opacity-100" : "opacity-0"
                    }`}
                  />
                )}

                <div className="flex items-center gap-1.5 p-2">
                  {/*
                    拖拽把手。

                    必须是 span 而不是 button：Firefox / Safari 从 <button> 上起拖
                    不可靠。也正因如此它**不能**加 role="button" —— 那会变成读屏
                    念得出来、却没法操作的东西（HTML5 拖拽本来就不支持键盘）。
                    键盘改顺序的正道是展开后那对上下移按钮。

                    pointer-coarse:hidden：手机上 HTML5 拖拽根本不触发，
                    留着就是个死控件 —— 触屏改顺序同样走那对上下移按钮。
                  */}
                  <span
                    draggable
                    aria-hidden="true"
                    onDragStart={(event) => {
                      // Firefox 不 setData 就压根不起拖
                      event.dataTransfer.setData("text/plain", track.rowId);
                      event.dataTransfer.effectAllowed = "move";
                      // 默认拖影是光标下这个小把手，太小认不出是第几首 —— 换成整行
                      const row = (event.currentTarget as HTMLElement).closest("li");
                      if (row) event.dataTransfer.setDragImage(row, 16, 16);
                      setDragFrom(index);
                    }}
                    onDragEnd={() => {
                      /*
                       * 在列表外松手、或按 Esc 取消，都要清干净。
                       * 事件顺序是 drop 先于 dragend，所以这里不会抢在 onDrop 前面抹掉状态。
                       */
                      setDragFrom(null);
                      setDropAt(null);
                    }}
                    className="pointer-coarse:hidden inline-flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-ink-faint select-none hover:bg-ink/5 active:cursor-grabbing dark:text-slate-500 dark:hover:bg-white/5"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleRow(track.rowId)}
                    aria-expanded={open}
                    aria-controls={bodyId}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded px-1.5 py-1 text-left transition-colors hover:bg-ink/5 dark:hover:bg-white/5"
                  >
                    <span className="index-num shrink-0">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span
                      className={`min-w-0 flex-1 truncate font-sans text-sm ${
                        track.name
                          ? "font-semibold text-ink dark:text-white"
                          : "text-ink-faint dark:text-slate-500"
                      }`}
                    >
                      {title}
                    </span>

                    {track.artist && (
                      <span className="hidden max-w-[10rem] shrink-0 truncate font-sans text-xs text-ink-faint sm:block dark:text-slate-500">
                        {track.artist}
                      </span>
                    )}

                    {unsaveable && (
                      <span
                        title="既没有歌曲 ID 也没有直链，保存时会被丢掉"
                        className="hidden shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 font-sans text-[0.6875rem] font-semibold text-amber-700 sm:block dark:text-amber-400"
                      >
                        待填
                      </span>
                    )}

                    <span className="hidden shrink-0 rounded-full bg-ink/5 px-2 py-0.5 font-sans text-[0.6875rem] text-ink-muted sm:block dark:bg-white/8 dark:text-slate-400">
                      {platform}
                    </span>

                    <ChevronDown
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-300 ease-[var(--ease-spring)] dark:text-slate-500 ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => removeTrack(index)}
                    title="删除"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">删除</span>
                  </button>
                </div>

                {/*
                  展开区**整块挂载 / 卸载**，不做高度动画。

                  不做 max-h 或 grid-rows 过渡是有意的：那要求折叠时也把内容留在
                  DOM 里，17 首就是 17 个 select + 85 个 input 常驻 ——
                  和 ui.tsx 里"隐藏的分区根本不产出 DOM"那条既定做法正好相反。
                  观感上的"展开"交给 .row-open 那个纯透明度动画。
                */}
                {open && (
                  <div
                    id={bodyId}
                    className="row-open border-t border-ink/8 p-4 pt-3 dark:border-white/8"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <div>
                        <label htmlFor={`server-${track.rowId}`} className={labelClass}>
                          平台
                        </label>
                        <select
                          id={`server-${track.rowId}`}
                          value={track.server}
                          onChange={(event) =>
                            updateTrack(index, { server: event.target.value })
                          }
                          className={inputClass}
                        >
                          {SERVERS.map((server) => (
                            <option key={server.value} value={server.value}>
                              {server.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor={`id-${track.rowId}`} className={labelClass}>
                          歌曲 ID 或链接
                        </label>
                        <input
                          id={`id-${track.rowId}`}
                          value={track.id}
                          onChange={(event) =>
                            updateTrack(index, { id: event.target.value })
                          }
                          placeholder="直接粘贴歌曲链接也行"
                          className={`${inputClass} font-mono`}
                        />
                        <p className={hintClass}>
                          去网易云打开那首歌，复制地址栏的链接粘进来就行。
                        </p>
                      </div>

                      <div>
                        <label htmlFor={`name-${track.rowId}`} className={labelClass}>
                          歌名
                        </label>
                        <input
                          id={`name-${track.rowId}`}
                          value={track.name}
                          onChange={(event) =>
                            updateTrack(index, { name: event.target.value })
                          }
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor={`artist-${track.rowId}`} className={labelClass}>
                          歌手
                        </label>
                        <input
                          id={`artist-${track.rowId}`}
                          value={track.artist}
                          onChange={(event) =>
                            updateTrack(index, { artist: event.target.value })
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label htmlFor={`direct-${track.rowId}`} className={labelClass}>
                        音频直链（选填，填了就优先用它，不走音源）
                      </label>
                      <input
                        id={`direct-${track.rowId}`}
                        value={track.directUrl}
                        onChange={(event) =>
                          updateTrack(index, { directUrl: event.target.value })
                        }
                        placeholder="/uploads/song.mp3"
                        className={`${inputClass} font-mono`}
                      />
                      <p className={hintClass}>
                        这里要的是<strong className="font-semibold">音频文件</strong>的地址（以 .mp3 / .m4a 结尾，或你自己传到
                        uploads/ 的路径），不是歌曲的网页地址。
                        网易云的分享链接请填在上面的「歌曲 ID 或链接」里。
                      </p>
                    </div>

                    {/*
                      键盘改顺序的唯一入口。拖拽天生不支持键盘，所以这对按钮
                      不能省 —— 放在展开区里而不是折叠行上，是为了让紧凑行保持干净。
                    */}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className={hintClass}>
                        拖动左侧把手可以调整顺序；键盘上用这里的上下移。
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveTrack(index, -1)}
                          disabled={index === 0}
                          title="上移"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5"
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">上移</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTrack(index, 1)}
                          disabled={index === active.tracks.length - 1}
                          title="下移"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5"
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">下移</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addEmptyTrack}
            className="inline-flex items-center gap-2 rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加曲目
          </button>

          {/*
            一个按钮而不是"展开全部 / 收起全部"两个：allOpen 是派生的，
            所以按钮文字永远是对下一步动作的正确描述。
          */}
          <button
            type="button"
            onClick={toggleAllRows}
            disabled={active.tracks.length === 0}
            className="inline-flex items-center gap-2 rounded-tile border border-ink/12 px-4 py-2 font-sans text-sm font-semibold text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/12 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {allOpen ? (
              <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
            )}
            {allOpen ? "全部收起" : "全部展开"}
          </button>

          {/* 内置音源下可以一键把歌名歌手填好，省得手敲 */}
          {config.source === "builtin" && (
            <button
              type="button"
              onClick={fetchInfo}
              disabled={fetchingInfo || !hasFetchableIds}
              className="inline-flex items-center gap-2 rounded-tile border border-ink/12 px-4 py-2 font-sans text-sm font-semibold text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/12 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {fetchingInfo ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4" aria-hidden="true" />
              )}
              抓取歌曲信息
            </button>
          )}
        </div>

        {fetchNote && (
          <p className="font-sans text-xs text-emerald-600 dark:text-emerald-400">
            {fetchNote}
          </p>
        )}

        <p className={hintClass}>
          歌曲 ID 就是歌曲详情页地址栏里的那串数字，例如
          <code className="mx-1 font-mono">music.163.com/#/song?id=1809646618</code>
          里的 1809646618。
        </p>
      </Section>
    </div>
  );
}
