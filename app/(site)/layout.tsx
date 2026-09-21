import { Navbar } from "@/components/site/navbar";
import { PageTransition } from "@/components/page-transition";
import { Footer } from "@/components/site/footer";
import { MusicProvider } from "@/components/site/music-provider";
import { MusicDock } from "@/components/site/music-dock";
import { StatsBeacon } from "@/components/site/stats-beacon";
import { getSettingsOnce } from "@/lib/content/settings";
import { getMusicConfig, isMusicPlayable } from "@/lib/content/music";

/**
 * 前台外壳：导航 + 内容 + 页脚（+ 音乐播放器）。
 * 后台（/admin）走自己的 layout，不带这套外壳。
 */
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, music] = await Promise.all([
    getSettingsOnce(),
    getMusicConfig(),
  ]);

  // 歌单为空时整个播放器都不挂载 —— 没必要为一个用不到的功能背一份上下文和 audio 元素
  const playable = isMusicPlayable(music);

  return (
    /*
     * Provider **始终挂载**，哪怕歌单是空的。
     * 因为 /music 页面里的组件要调 useMusic()，Provider 不在就会直接抛错。
     * 空歌单的上下文只是一个对象和一个没设 src 的 <audio>，开销可以忽略。
     *
     * 悬浮播放条则按需显示：一首歌都没有时它没有任何意义，不必占着屏幕一角。
     */
    <MusicProvider
      tracks={music.tracks}
      title={music.title}
      source={music.source}
      hasApi={Boolean(music.apiUrl)}
    >
      <Navbar title={settings.title} />

      {/*
        PageTransition 只包住**页面内容**，不能往外扩。
        它是以 pathname 为 key 强制重挂载来重播入场动画的 ——
        如果连播放器一起包进去，每次切页 <audio> 都会被销毁重建，音乐就断了。
        导航栏、页脚同理，都不该参与重挂载。
      */}
      <main className="relative z-10 flex-1">
        <PageTransition>{children}</PageTransition>
      </main>

      <Footer settings={settings} hasDock={playable} />

      {/* 挂在最后，z-index 也最高，不会被内容盖住 */}
      {playable && <MusicDock />}

      {/* 访问上报。不渲染任何东西，只在整个站点外壳里挂一次 ——
          usePathname 变化时自动重发，切页也算一次浏览。 */}
      <StatsBeacon />
    </MusicProvider>
  );
}
