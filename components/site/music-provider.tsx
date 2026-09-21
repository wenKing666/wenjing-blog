"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MusicSource, Track } from "@/lib/content/music";
import { extractSongId, looksLikePageUrl } from "@/lib/music/track-id";

/**
 * 全站共用一个 <audio>。
 *
 * 放在 Provider 里而不是播放器组件里，是为了让"底部悬浮条"和「音乐」页面
 * 控制的是同一个播放实例 —— 否则切页音乐就断了，或者两处各放各的。
 *
 * 音源地址走服务端代理（/api/music），原因见 app/api/music/route.ts：
 * 不暴露解析接口地址、绕开跨域与混合内容限制。
 */

/** 从音源抓回来的歌曲信息。按歌曲 ID 存，缺什么补什么。 */
export type TrackMeta = {
  name: string;
  artist: string;
  cover: string;
  lrc: string;
};

type MusicContextValue = {
  tracks: Track[];
  title: string;
  /** 抓回来的歌曲信息。界面上优先用它，配置文件里填的作为兜底 */
  meta: Record<string, TrackMeta>;
  /** 取一首歌最终展示用的信息（抓回来的优先，其次是配置里手填的） */
  infoOf: (track: Track) => TrackMeta;
  currentIndex: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  progress: number;
  duration: number;
  volume: number;
  playAt: (index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (ratio: number) => void;
  setVolume: (value: number) => void;
  /**
   * 取频谱分析节点，给「正在播放」卡片画可视化用。
   *
   * 做成函数而不是直接把节点放进 context：节点是懒创建的（首次播放才建），
   * 放进 context 就得用 state 承载，那会多出一次重渲染，而且消费方还得处理"后到"。
   * 每帧调一次这个函数最省事。返回 null 就画静止基线。
   *
   * **不暴露 <audio> 元素本身** —— 那等于让消费方绕过 playing / error 这些状态
   * 直接去操作播放器，迟早出乱子。
   */
  getAnalyser: () => AnalyserNode | null;
};

const MusicContext = createContext<MusicContextValue | null>(null);

const VOLUME_KEY = "blog-music-volume";

/**
 * 把一首歌解析成 <audio> 能直接用的地址。
 *
 * 注意"直链"字段里很可能是**歌曲的网页地址** —— 人的直觉就是去浏览器
 * 地址栏复制那一串。那玩意儿是 HTML 页面，拿去当音频播只会得到
 * 「格式不支持」。所以这里先判断一下：像网页地址的就当 ID 用，
 * 真正的音频直链才直接用。
 */
export function trackSource(track: Track): string {
  const direct = track.directUrl?.trim() ?? "";
  if (direct && !looksLikePageUrl(direct)) return direct;

  // 网页地址也好、纯 ID 也好，统一抠出 ID
  const id = extractSongId(direct) || extractSongId(track.id);
  const params = new URLSearchParams({
    type: "url",
    id,
    server: track.server || "netease",
  });
  return `/api/music?${params.toString()}`;
}

/**
 * 封面地址。
 *
 * 直链歌曲没有封面；其余走我们自己的代理接口，
 * 由服务端去问音源（内置模式问网易，自定义模式转发给你配的接口）。
 */
export function trackCover(track: Track, canFetch: boolean): string {
  const direct = track.directUrl?.trim() ?? "";
  // 真正的音频直链没有封面可取；网页地址和纯 ID 都能取
  if (!canFetch || (direct && !looksLikePageUrl(direct))) return "";

  const id = extractSongId(direct) || extractSongId(track.id);
  if (!id) return "";

  const params = new URLSearchParams({
    type: "pic",
    id,
    server: track.server || "netease",
  });
  return `/api/music?${params.toString()}`;
}

/* ==================================================================
 * 频谱分析图
 *
 * 给首页「正在播放」卡片用的 AnalyserNode。这张图有几个必须守住的规矩，
 * 破了任意一条都会表现为"音乐莫名其妙没声音"，而且完全不报错：
 *
 *   1. **只接同源音源。** 规范强制：资源是 CORS 跨源时
 *      MediaElementAudioSourceNode 必须输出静音，控制台只有一句警告，
 *      audio 的 paused / currentTime / timeupdate **全部照常** ——
 *      界面上一切正常，就是没声音，也没法诊断。
 *      我们的音源都走 /api/music（同源），只有用户填了跨源直链才会碰上，
 *      那种情况就直接不画频谱，绝不动播放。
 *
 *   2. **建图放在真正的点击回调里、在 audio.play() 之前。** 建图会把元素的声音
 *      改道走图里；播放中途改道在部分浏览器上能听到一声极短的断音。
 *      而且没被激活的文档里 AudioContext 可能起不来，点了才播是最稳的时机。
 *
 *   3. **创建不可逆。** 一个元素只能 createMediaElementSource 一次，
 *      之后 ctx.close() / disconnect() / 丢引用**都解除不了绑定**，
 *      再调一次直接抛 InvalidStateError。所以顺序必须是"先确认 ctx 真在跑，
 *      再绑定"—— 绑到一个跑不起来的 ctx 上就是永久静音。
 *
 *   4. **图存在模块作用域，不在组件 ref 里。** Fast Refresh 重挂组件时 ref 会丢，
 *      但 <audio> 这个 DOM 节点通常被 React 复用 —— 那时若以为"还没建过"，
 *      就会踩到第 3 条抛的那个错。存在模块级 + 记下绑定的是哪个元素，才认得出。
 *
 *   5. **任何失败都静默降级**：getAnalyser() 返回 null，卡片画一条静止基线，
 *      播放路径一行都不受影响。
 * ================================================================== */

type AudioGraph = {
  element: HTMLAudioElement;
  ctx: AudioContext;
  analyser: AnalyserNode;
};

let graph: AudioGraph | null = null;
/** 同一时刻只允许一次建图尝试，避免连点播放时创建出一堆 AudioContext */
let building: Promise<void> | null = null;

/** 文档没有被用户激活时，resume() 可能既不 resolve 也不 reject —— 不能干等它 */
const RESUME_TIMEOUT_MS = 1000;

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * 确保分析图可用。**在点击回调里、play() 之前调**。
 *
 * 失败一律吞掉：分析是锦上添花，不该让任何一首歌播不出来。
 */
function ensureGraph(audio: HTMLAudioElement, src: string): void {
  const existing = graph;
  if (existing && existing.element === audio) {
    /*
     * 已经接过了。Safari 从后台切回来会把 state 变成 "interrupted"
     * （这个值不在规范里），所以这里判的不是 === "suspended"。
     * 漏了这一步的典型症状是：手机上切出去再切回来，进度条在走但没有声音。
     */
    if (existing.ctx.state !== "running") {
      void existing.ctx.resume().catch(() => {});
    }
    return;
  }

  if (building) return;

  /*
   * 元素换了。正常永远换不了（全站就这一个 <audio>），但真换过的话，
   * 旧图已经没人用了 —— 留着会白占一个 AudioContext，还一直往扬声器送信号。
   */
  if (graph && graph.element !== audio) {
    void graph.ctx.close().catch(() => {});
    graph = null;
  }

  // 规矩 1：跨源不接，宁可没有频谱
  if (!isSameOrigin(src)) return;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;

  building = (async () => {
    const ctx = new Ctor();
    try {
      await Promise.race([
        ctx.resume(),
        new Promise((resolve) => window.setTimeout(resolve, RESUME_TIMEOUT_MS)),
      ]);

      // 规矩 3：跑不起来就绝不绑定。绑了 = 永久静音，且救不回来。
      if (ctx.state !== "running") {
        void ctx.close().catch(() => {});
        return;
      }

      const analyser = ctx.createAnalyser();
      /*
       * ★ 这三行要和参考实现**完全一致**，否则 3D 舞台的观感对不上。
       *
       * fftSize 1024（不是 2048）：2048 的窗口是 46ms、1024 是 23ms，
       *   后者对鼓点的响应快一倍。这是"振动频率不够快"的直接原因之一。
       *   代价是最低频段变粗（43Hz/bin），二维频谱卡片的低端要靠插值补。
       *
       * smoothingTimeConstant 0.8：两边一样。
       *
       * **minDecibels / maxDecibels 刻意不动**，用浏览器默认的 -100 / -30。
       *   之前我把它们调成 -90 / -20 是为了让二维卡片的柱子好看，
       *   但那会让同样的声音读数系统性偏低约 14%（少了一档 10dB 的偏移），
       *   而 3D 舞台的亮度是个阈值函数 —— 整体低一成，能越过阈值的方块就少一大片，
       *   画面立刻"瘪"下去。宁可让卡片那边自己补，也不能动 analyser 的公共量程。
       */
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      // 少这一句就真的没声音了 —— analyser 不是终点，信号得送回扬声器
      analyser.connect(ctx.destination);

      graph = { element: audio, ctx, analyser };
    } catch {
      /*
       * 走到这儿基本只有一个原因：这个元素已经绑过一次了
       * （热更新换掉了模块状态，但 React 复用了原来的 DOM 节点）。
       * 绑定不可逆，救不回来 —— 静默放弃，声音照旧从原来那张图里出。
       */
      void ctx.close().catch(() => {});
    }
  })().finally(() => {
    // 必须清空：这是"同时只跑一次"的闸门，不是"只跑一次"的标记。
    // 卡住的话以后每次点击都会被它挡住，图再也建不出来。
    building = null;
  });
}

export function MusicProvider({
  tracks,
  title,
  source,
  hasApi,
  children,
}: {
  tracks: Track[];
  title: string;
  source: MusicSource;
  /** 自定义模式下是否配了解析接口 */
  hasApi: boolean;
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [meta, setMeta] = useState<Record<string, TrackMeta>>({});
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);

  /*
   * 音量记在本地：每次进来都要重调一遍很烦。
   * 读 localStorage 放在 rAF 回调里而不是 effect 体内 —— 后者会在提交阶段
   * 触发一次级联渲染；同时也避免服务端与客户端首帧不一致。
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(VOLUME_KEY);
        /*
         * ★ 必须先判 null，不能直接 Number()。
         *
         * 没存过时 getItem 返回 null，而 **Number(null) 是 0** —— 正好落进
         * 下面的 0~1 合法区间，于是音量被设成 0。
         * 症状极具迷惑性：歌在正常播、进度条在走、歌词在换、什么都不报错，
         * 就是一点声音都没有。而且**只影响第一次来的访客** ——
         * 自己电脑上早就存过值，反而永远复现不了。
         */
        if (raw === null) return;

        const stored = Number(raw);
        if (Number.isFinite(stored) && stored >= 0 && stored <= 1) {
          setVolumeState(stored);
        }
      } catch {
        // 隐私模式下会抛，用默认值即可
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const getAnalyser = useCallback(() => graph?.analyser ?? null, []);

  const playAt = useCallback(
    (index: number) => {
      if (index < 0 || index >= tracks.length) return;
      const audio = audioRef.current;
      // 这里才是真正的用户手势。放在 effect 里就晚了（见 ensureGraph 规矩 2）
      if (audio) ensureGraph(audio, trackSource(tracks[index]));
      setCurrentIndex(index);
      setError(null);
    },
    [tracks],
  );

  /*
   * 当前曲目变化时换源并播放。
   *
   * 所有状态更新都发生在回调里（rAF / Promise），不在 effect 体内同步 setState ——
   * 那样会在提交阶段触发级联渲染。cancelled 标记用来防竞态：
   * 用户连点两首歌时，先发出的那个请求可能后返回。
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || currentIndex < 0) return;

    const track = tracks[currentIndex];
    if (!track) return;

    /*
     * 这首歌能不能播。
     * 内置音源只需要歌曲 ID；自定义音源则必须有解析接口或直链。
     * 判断放在 effect 里算，避免把派生值塞进依赖数组造成多余的重新执行。
     */
    const canPlay =
      source === "builtin"
        ? Boolean(extractSongId(track.id) || extractSongId(track.directUrl ?? ""))
        : Boolean(hasApi || track.directUrl);

    let cancelled = false;

    const frame = requestAnimationFrame(() => {
      if (cancelled) return;

      if (!canPlay) {
        setError(
          source === "builtin"
            ? "这首歌没有填写歌曲 ID，无法播放。"
            : "尚未配置音源接口，无法播放。请在后台「音乐」里填写接口地址，或改用内置音源。",
        );
        setPlaying(false);
        return;
      }

      setLoading(true);
      audio.src = trackSource(track);
      audio.load();

      // play() 返回 Promise：自动播放被拦、或音源失效都会在这里 reject
      audio
        .play()
        .then(() => {
          if (cancelled) return;
          setPlaying(true);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setPlaying(false);
          // 用户主动点了播放却失败，必须说清原因，不能默默什么都不发生
          setError(
            reason instanceof Error && reason.name === "NotAllowedError"
              ? "浏览器拦截了自动播放，请再点一次播放按钮。"
              : source === "builtin"
                ? "这首歌播不了。网易云只允许免费歌曲走外链，VIP / 独家歌曲拿不到音频 —— 换一首，或改用自定义接口试试别的平台。"
                : "这首歌加载失败，可能是音源接口失效或该曲目无版权。",
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [currentIndex, tracks, source, hasApi]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 还没选过曲目：从第一首开始
    if (currentIndex < 0) {
      playAt(0);
      return;
    }

    if (audio.paused) {
      // 恢复播放也要走一遍：Safari 从后台切回来时 ctx 会变成 "interrupted"
      const track = tracks[currentIndex];
      if (track) ensureGraph(audio, trackSource(track));

      audio.play().then(() => setPlaying(true)).catch(() => {
        setError("播放失败，请稍后重试。");
      });
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [currentIndex, tracks, playAt]);

  /*
   * 浏览器会在标签页切到后台时挂起 AudioContext，Safari 尤其积极，
   * 而且它挂起后的 state 是 "interrupted"（不在规范里）。
   * 不主动 resume 的话，切回来就是"进度条在走、但没有声音"。
   */
  useEffect(() => {
    const onVisible = () => {
      const audio = audioRef.current;
      if (document.hidden || !audio || audio.paused) return;
      const g = graph;
      if (g && g.element === audio && g.ctx.state !== "running") {
        void g.ctx.resume().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const next = useCallback(() => {
    if (tracks.length === 0) return;
    playAt((currentIndex + 1) % tracks.length);
  }, [currentIndex, tracks.length, playAt]);

  const prev = useCallback(() => {
    if (tracks.length === 0) return;
    playAt((currentIndex - 1 + tracks.length) % tracks.length);
  }, [currentIndex, tracks.length, playAt]);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      // 忽略：音量记不住而已
    }
  }, []);

  /* 音量应用回 audio 元素 */
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  /*
   * 抓取歌曲信息。
   *
   * 内置音源下，歌单里只存了歌曲 ID —— 歌名、歌手、封面、歌词都在这儿补上。
   * 自定义解析接口的信息由播放器按 Meting 协议另外取，不走这里。
   *
   * 抓不到不影响播放：界面上会退回配置里手填的内容，或者显示"曲目 <ID>"。
   */
  useEffect(() => {
    if (source !== "builtin") return;

    const ids = Array.from(
      new Set(
        tracks
          .map((track) => extractSongId(track.id) || extractSongId(track.directUrl ?? ""))
          .filter(Boolean),
      ),
    );
    if (ids.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/music/info?ids=${ids.join(",")}`);
        if (!response.ok) return;
        const data = (await response.json()) as {
          songs?: { id: string; name: string; artist: string; cover: string; lrc: string }[];
        };
        if (cancelled || !data.songs) return;

        const next: Record<string, TrackMeta> = {};
        for (const song of data.songs) {
          next[song.id] = {
            name: song.name ?? "",
            artist: song.artist ?? "",
            cover: song.cover ?? "",
            lrc: song.lrc ?? "",
          };
        }
        setMeta(next);
      } catch {
        // 抓不到就用手填的信息，不该因此打断播放
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, tracks]);

  /** 抓回来的优先，其次是配置文件里手填的。 */
  const infoOf = useCallback(
    (track: Track): TrackMeta => {
      const fetched = meta[track.id];
      return {
        name: fetched?.name || track.name,
        artist: fetched?.artist || track.artist,
        cover: fetched?.cover || trackCover(track, source === "builtin" || hasApi),
        lrc: fetched?.lrc ?? "",
      };
    },
    [meta, source, hasApi],
  );

  const value = useMemo<MusicContextValue>(
    () => ({
      tracks,
      title,
      meta,
      infoOf,
      currentIndex,
      playing,
      loading,
      error,
      progress,
      duration,
      volume,
      playAt,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      getAnalyser,
    }),
    [
      tracks, title, meta, infoOf, currentIndex, playing, loading, error,
      progress, duration, volume, playAt, toggle, next, prev, seek, setVolume,
      getAnalyser,
    ],
  );

  return (
    <MusicContext.Provider value={value}>
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={next}
        onError={() => {
          setPlaying(false);
          /*
           * 内置音源下最常见的失败原因就是"这首歌要 VIP" ——
           * 网易的外链只对免费歌曲有效。这句提示必须点破，
           * 否则用户会以为是站点坏了，反复点。
           */
          setError(
            source === "builtin"
              ? "这首歌网易云不提供免费外链（多半是 VIP 或独家）。换一首，或在后台改用自定义接口试试其他平台。"
              : "这首歌加载失败。音源接口可能已失效，去后台换一个地址试试。",
          );
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic(): MusicContextValue {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error("useMusic 必须在 MusicProvider 内部使用");
  }
  return context;
}
