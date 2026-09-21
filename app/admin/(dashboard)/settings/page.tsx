import type { Metadata } from "next";
import { getSettings } from "@/lib/content/settings";
import { listFrames } from "@/lib/content/frames";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = {
  title: "站点设置",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  // 头像框库在服务端读好再传进表单 —— 表单是客户端组件，不能自己读文件
  const [settings, frames] = await Promise.all([getSettings(), listFrames()]);
  return <SettingsForm initial={settings} frames={frames} />;
}
