import type { Metadata } from "next";
import { getMusicConfig, isMusicPlayable } from "@/lib/content/music";
import { MusicLibrary, MusicNotice } from "@/components/site/music-library";
import { getSettingsOnce } from "@/lib/content/settings";
import { MusicStage } from "@/components/site/music-stage";

export const metadata: Metadata = {
  title: "音乐",
  description: "在听的歌。",
};

export default async function MusicPage() {
  const [config, settings] = await Promise.all([
    getMusicConfig(),
    getSettingsOnce(),
  ]);
  const hasApi = Boolean(config.apiUrl);
  const playable = isMusicPlayable(config);

  /*
   * 舞台模式：整屏 3D。
   *
   * 这里只渲染一块**深色底**，真正的舞台由客户端 Portal 挂上去 ——
   * 底色和舞台背景取同一个色值（#05070c），所以挂载那一刻不会闪白。
   *
   * 歌单为空时即使是 stage 模式也走下面的列表分支：
   * 一个没有歌的舞台没有任何意义，还不如让站长看到"尚未配置音源"的提示。
   */
  if (settings.musicMode === "stage" && playable) {
    return (
      <div className="min-h-screen bg-[#05070c]">
        <MusicStage siteTitle={settings.title} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-[92%] max-w-3xl pt-28 pb-10 sm:pt-32">
      <header className="reveal">
        <p className="rule-label">
          <span>Music</span>
        </p>
        <h1 className="display mt-5 text-4xl text-ink sm:text-5xl dark:text-white">
          {config.title}
        </h1>
        <p className="mt-4 font-mono text-xs tracking-wider text-ink-faint dark:text-slate-500">
          {config.tracks.length} 首
          {isMusicPlayable(config) ? " · 点任意一列播放" : " · 尚未配置音源"}
        </p>
      </header>

      <MusicNotice hasApi={hasApi} />
      <MusicLibrary />
    </div>
  );
}
