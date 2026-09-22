"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
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
import type { MusicConfig, Track } from "@/lib/content/music";
import { formatTime } from "@/lib/format-time";
/*
 * 只引类型。`import type` 会在编译期被完全抹掉，不会把 netease.ts 里的
 * 请求逻辑打进浏览器包 —— 那个文件是服务端专用的（同样的原因，
 * track-id.ts 才被单独拆了出去）。
 */
import type { NeteaseSearchHit } from "@/lib/music/netease";

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

export function MusicEditor({ initial }: { initial: MusicConfig }) {
  const router = useRouter();
  const [config, setConfig] = useState<MusicConfig>(initial);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  /** null = 还没搜过，结果区不渲染 */
  const [results, setResults] = useState<NeteaseSearchHit[] | null>(null);
  /** 搜出当前这批结果时用的关键词，只用于"没搜到 xxx"那句提示 */
  const [searchedFor, setSearchedFor] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const dirty = JSON.stringify(config) !== snapshot;

  /** 有 ID 的曲目才值得抓。 */
  const ids = config.tracks
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

      setConfig((previous) => ({
        ...previous,
        tracks: previous.tracks.map((track) => {
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

  /** 搜歌。浏览器只跟自己的后台说话，由服务端去问网易云。 */
  async function runSearch() {
    const keyword = query.trim();
    if (!keyword || searching) return;

    setSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/admin/music/search?q=${encodeURIComponent(keyword)}`,
      );
      const data = (await response.json().catch(() => ({}))) as {
        songs?: NeteaseSearchHit[];
        error?: string;
      };

      if (!response.ok || !data.songs) {
        setSearchError(data.error ?? `搜索失败（HTTP ${response.status}）`);
        setResults(null);
        return;
      }

      setResults(data.songs);
      setSearchedFor(keyword);
    } catch {
      setSearchError("无法连接服务器。");
      setResults(null);
    } finally {
      setSearching(false);
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
    setConfig((previous) =>
      previous.tracks.some((track) => track.id.trim() === hit.id)
        ? previous
        : {
            ...previous,
            tracks: [
              ...previous.tracks,
              {
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

  function updateTrack(index: number, patch: Partial<Track>) {
    setConfig((previous) => ({
      ...previous,
      tracks: previous.tracks.map((track, i) =>
        i === index ? { ...track, ...patch } : track,
      ),
    }));
  }

  function moveTrack(index: number, delta: number) {
    setConfig((previous) => {
      const next = [...previous.tracks];
      const target = index + delta;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...previous, tracks: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/music", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        music?: MusicConfig;
      };

      if (!response.ok || !data.music) {
        setMessage({ kind: "error", text: data.error ?? `保存失败（HTTP ${response.status}）` });
        return;
      }

      setConfig(data.music);
      setSnapshot(JSON.stringify(data.music));
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

        <div>
          <label htmlFor="musicTitle" className={labelClass}>
            歌单标题
          </label>
          <input
            id="musicTitle"
            value={config.title}
            onChange={(event) =>
              setConfig((previous) => ({ ...previous, title: event.target.value }))
            }
            className={inputClass}
          />
        </div>

        <p className={hintClass}>
          无论是哪种方式，把音频放进
          <code className="mx-1 font-mono">content/uploads/</code>
          再在曲目里填「直链」，都能绕开所有外部依赖 —— 也最稳。
        </p>
      </Section>

      <Section
        title="从网易云搜索"
        description="搜到点一下就能加进歌单，歌名和歌手自动填好 —— 不用再去网易云网页复制歌曲 ID。"
      >
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
              placeholder="歌名、歌手、专辑都行"
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

        {results !== null && results.length === 0 && (
          <p className={hintClass}>没搜到「{searchedFor}」，换个关键词试试。</p>
        )}

        {results !== null && results.length > 0 && (
          <ul className="divide-y divide-ink/8 dark:divide-white/8">
            {results.map((hit) => {
              const added = config.tracks.some(
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
        title={`曲目（${config.tracks.length} 首）`}
        description="填平台歌曲 ID 即可，歌名和歌手留空也能播，但填上体验更好。"
      >
        <ul className="space-y-3">
          {config.tracks.map((track, index) => (
            <li
              key={index}
              className="rounded-tile border border-ink/8 p-4 dark:border-white/8"
            >
              <div className="flex items-center justify-between">
                <span className="index-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex items-center gap-1">
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
                    disabled={index === config.tracks.length - 1}
                    title="下移"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">下移</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((previous) => ({
                        ...previous,
                        tracks: previous.tracks.filter((_, i) => i !== index),
                      }))
                    }
                    title="删除"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-tile text-ink-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">删除</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label htmlFor={`server-${index}`} className={labelClass}>
                    平台
                  </label>
                  <select
                    id={`server-${index}`}
                    value={track.server}
                    onChange={(event) => updateTrack(index, { server: event.target.value })}
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
                  <label htmlFor={`id-${index}`} className={labelClass}>
                    歌曲 ID 或链接
                  </label>
                  <input
                    id={`id-${index}`}
                    value={track.id}
                    onChange={(event) => updateTrack(index, { id: event.target.value })}
                    placeholder="直接粘贴歌曲链接也行"
                    className={`${inputClass} font-mono`}
                  />
                  <p className={hintClass}>
                    去网易云打开那首歌，复制地址栏的链接粘进来就行。
                  </p>
                </div>

                <div>
                  <label htmlFor={`name-${index}`} className={labelClass}>
                    歌名
                  </label>
                  <input
                    id={`name-${index}`}
                    value={track.name}
                    onChange={(event) => updateTrack(index, { name: event.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor={`artist-${index}`} className={labelClass}>
                    歌手
                  </label>
                  <input
                    id={`artist-${index}`}
                    value={track.artist}
                    onChange={(event) => updateTrack(index, { artist: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="mt-3">
                <label htmlFor={`direct-${index}`} className={labelClass}>
                  音频直链（选填，填了就优先用它，不走音源）
                </label>
                <input
                  id={`direct-${index}`}
                  value={track.directUrl}
                  onChange={(event) => updateTrack(index, { directUrl: event.target.value })}
                  placeholder="/uploads/song.mp3"
                  className={`${inputClass} font-mono`}
                />
                <p className={hintClass}>
                  这里要的是<strong className="font-semibold">音频文件</strong>的地址（以 .mp3 / .m4a 结尾，或你自己传到
                  uploads/ 的路径），不是歌曲的网页地址。
                  网易云的分享链接请填在上面的「歌曲 ID 或链接」里。
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setConfig((previous) => ({
                ...previous,
                tracks: [
                  ...previous.tracks,
                  { id: "", server: "netease", name: "", artist: "", directUrl: "" },
                ],
              }))
            }
            className="inline-flex items-center gap-2 rounded-tile border border-jade/30 bg-jade/10 px-4 py-2 font-sans text-sm font-semibold text-jade transition-colors hover:bg-jade/20 dark:text-jade-pale"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加曲目
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
