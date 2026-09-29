"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { AvatarStyle } from "@/lib/site";
import { computeFrameFit } from "@/lib/frame-fit";
import { SiteAvatar } from "@/components/site/site-avatar";
import { ImageField } from "./image-field";
import { RangeField, labelClass } from "./ui";

/**
 * 「头像调整」模块：**一块地方把头像是怎么回事全调完**。
 *
 * 以前头像的控件散在四处 —— 图片字段、外观二选一、框库、微调滑块，
 * 差不多每块都带个自己的预览，调一个参数还得抬头看另一处对不对。
 * 现在合成一块：
 *
 *   左    唯一的预览，所有滑块调的都是它
 *   右上  头像图片（链接 / 上传 / 最近用过）
 *   右中  外观模式（圆形无框 / 方形带框）
 *   右下  四个滑块：头像圆角、头像大小、框大小、框圆角
 *   底部  children —— 「挑哪张框」的框库塞在这儿
 *
 * 分工：**框库管挑哪张框，这里管怎么摆**。
 */

/**
 * 「跟随模式」时圆角滑块停在哪。
 *
 * 这只是**滑块的位置**，不是真正写进设置的值 —— 那种情况下存的是 null，
 * 由 SiteAvatar 按外观模式决定（圆形整圆 / 方形 10px 圆角）。
 * 10px 换算到 80px 见方的头像上大约是 12%。
 */
const FRAME_DEFAULT_RADIUS = 12;

export function AvatarTuning({
  avatar,
  author,
  style,
  frameUrl,
  frameThumb,
  frameScale,
  frameRadius,
  radius,
  size,
  history,
  onAvatar,
  onStyle,
  onFrameScale,
  onFrameRadius,
  onRadius,
  onSize,
  children,
}: {
  avatar: string;
  author: string;
  style: AvatarStyle;
  /** 当前选中的框地址。空表示还没选框 */
  frameUrl: string;
  /** 当前这张框的静态缩略图。有就用它来量，省一次动图解码 */
  frameThumb?: string;
  frameScale: number;
  frameRadius: number;
  radius: number | null;
  size: number;
  /** 最近用过的头像，最新在前 */
  history: string[];
  onAvatar: (url: string) => void;
  onStyle: (style: AvatarStyle) => void;
  onFrameScale: (value: number) => void;
  onFrameRadius: (value: number) => void;
  onRadius: (value: number | null) => void;
  onSize: (value: number) => void;
  /** 框库之类的附加内容，塞在模块底部 */
  children?: ReactNode;
}) {
  /** 「自动贴合」正在读像素。量完自己灭掉 */
  const [measuring, setMeasuring] = useState(false);

  const hasFrame = style === "frame" && Boolean(frameUrl);

  async function fit() {
    if (!frameUrl) return;
    setMeasuring(true);
    const value = await computeFrameFit(frameThumb || frameUrl);
    setMeasuring(false);
    onFrameScale(value);
  }

  return (
    <section className="rounded-tile border border-ink/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-start gap-6">
        {/*
          唯一的预览。

          头像按 80px 摆（和「关于」页的名片一致，看着才像真实观感），
          外面留 176px 见方的位置 —— 余量是给头像框放大用的。框按倍数往外撑，
          撑过 2.2 倍会被这里裁掉：框本来就该溢出头像，不裁的话会盖住右边的滑块文字。
        */}
        <div className="flex w-44 shrink-0 flex-col items-center gap-2">
          <div className="flex h-44 w-44 items-center justify-center overflow-hidden">
            <SiteAvatar
              src={avatar}
              name={author}
              frame={frameUrl}
              scale={frameScale}
              frameRadius={frameRadius}
              radius={radius}
              size={size}
              style={style}
              className="h-20 w-20"
            />
          </div>
          <span className="font-sans text-[0.625rem] text-ink-faint dark:text-slate-500">
            预览
          </span>
        </div>

        <div className="min-w-[18rem] flex-1 space-y-5">
          <ImageField
            id="avatar"
            label="头像"
            value={avatar}
            onChange={onAvatar}
            shape={style === "frame" ? "square" : "circle"}
            history={history}
            showPreview={false}
            hint="开屏动画和个人名片用的就是它。留空则显示名字首字。换过之后，上一张会留在下面，点一下就能换回来。"
          />

          {/*
            头像外观二选一。
            做成"两种形态"而不是"是否显示框"，是因为连头像本身的裁切都不一样
            （圆形 vs 方形），不只是多叠一层图。
          */}
          <div>
            <span className={labelClass}>头像外观</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  { key: "circle", label: "圆形 · 无框" },
                  { key: "frame", label: "方形 · 带头像框" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onStyle(option.key)}
                  aria-pressed={style === option.key}
                  className={`rounded-tile border px-3 py-1.5 font-sans text-sm font-semibold transition-colors ${
                    style === option.key
                      ? "border-jade bg-jade text-white"
                      : "border-ink/15 text-ink-soft hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300 dark:hover:text-jade-pale"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1 font-sans text-xs text-ink-faint dark:text-slate-500">
              选「带头像框」之后，头像会从圆形变成方形，并在上面叠一层框。
            </p>
          </div>

          <div className="space-y-4 border-t border-ink/10 pt-4 dark:border-white/10">
            <RangeField
              id="avatarRadius"
              label="头像圆角"
              value={radius ?? (style === "frame" ? FRAME_DEFAULT_RADIUS : 50)}
              min={0}
              max={50}
              display={radius == null ? "跟随模式" : `${radius}%`}
              hint="按头像边长的百分比算：0% 是直角，50% 是正圆。默认「跟随模式」—— 圆形整圆、方形 10px 圆角。"
              onChange={onRadius}
            >
              {radius != null && (
                <button
                  type="button"
                  onClick={() => onRadius(null)}
                  className="mt-1.5 rounded-tile border border-ink/15 px-2.5 py-0.5 font-sans text-xs font-semibold text-ink-soft transition-colors hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300"
                >
                  跟随外观模式
                </button>
              )}
            </RangeField>

            <RangeField
              id="avatarSize"
              label="头像大小"
              value={size}
              min={50}
              max={150}
              display={`${size}%`}
              hint="整个头像块（连同头像框）的尺寸。100% 是各处原本的大小，改这一项三处一起变。"
              onChange={onSize}
            />

            {hasFrame && (
              <RangeField
                id="avatarFrameScale"
                label="框大小"
                value={Math.round(frameScale * 100)}
                min={50}
                max={250}
                display={`${Math.round(frameScale * 100)}%`}
                hint="只放大缩小框本身，头像不动。选中框时会自动量一次，不合意再手动拖。"
                onChange={(value) => onFrameScale(value / 100)}
              >
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fit()}
                    disabled={measuring}
                    className="inline-flex items-center gap-1.5 rounded-tile border border-jade/30 bg-jade/10 px-2.5 py-1 font-sans text-xs font-semibold text-jade transition-colors hover:bg-jade/20 disabled:opacity-60 dark:text-jade-pale"
                  >
                    {measuring && (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    )}
                    {measuring ? "量取中…" : "自动贴合"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onFrameScale(1)}
                    className="rounded-tile border border-ink/15 px-2.5 py-1 font-sans text-xs font-semibold text-ink-soft transition-colors hover:border-jade/40 hover:text-jade dark:border-white/15 dark:text-slate-300"
                  >
                    重置
                  </button>
                </div>
              </RangeField>
            )}

            {hasFrame && (
              <RangeField
                id="avatarFrameRadius"
                label="框圆角"
                value={frameRadius}
                min={0}
                max={50}
                display={`${frameRadius}%`}
                hint="只切框的四个角，头像不动。四角本就填满的框（整幅覆盖型）改这一项看不出区别。"
                onChange={onFrameRadius}
              />
            )}
          </div>
        </div>
      </div>

      {children && (
        <div className="mt-5 border-t border-ink/10 pt-5 dark:border-white/10">
          {children}
        </div>
      )}
    </section>
  );
}