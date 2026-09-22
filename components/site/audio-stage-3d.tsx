"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { AudioFeatureReader } from "@/lib/audio-features";

/**
 * 3D 音乐舞台：一片跟着音乐起伏的发光**方块**阵列。
 *
 * 这一版是照着参考实现（Mineradio 那套视觉）**逐行对齐**重写的。
 * 所有数字和公式都是从它的产物里量出来的，别凭手感改 —— 之前凭手感写的
 * 那几版全都跑偏了，原因写在下面。
 *
 * ── 三个曾经写错、也是这套视觉最关键的地方 ──
 *
 * **① 频段不是整片统一抬，每个频段有自己的空间分布。**
 *
 * 我第一版把频段值乘个系数直接加到整片高度上，结果是"整片一起明、一起暗"，
 * 完全没有结构。参考实现是每个频段各有各的落点：
 *
 *   超低音  只在圆心 20 单位内的圆形区域
 *   低音    30→5 的环形区域，而且**半径被一层噪声推来推去**
 *   低中音  整片一层缓慢漂移的噪声
 *   中音    一条流动的"河"（sin + 噪声扰动）
 *   高中音  **只有 20% 的方块**吃得到，高度还是随机的
 *   总能量  **只有 1% 的方块**吃得到
 *
 * 所以画面是"大片黑色 + 零星的尖"，不是一整片起伏。这才是"不规则凸起"的来源。
 *
 * **② 哪些方块长得高是【固定】的。**
 *
 * `rnd = random(pos2D)` 是按方块位置算的哈希，不随时间变。所以
 * `fract(rnd * 13.3) > 0.8` 筛出来的那 20% 永远是同一批方块 ——
 * 换成每帧随机的话画面会变成噪点闪烁，而不是稳定的地形。
 *
 * **③ 平的方块是近黑的，只有凸起来才上封面色。**
 *
 * 片元着色器里 `mix(cBase2, currentGlow, topIntensity)`，
 * 而 `topIntensity = smoothstep(0.0, 0.4, vElevation / 6.0)` ——
 * 抬升不到 2.4 就基本是底色（#0a0f1a，近黑）。
 * 一旦把 mix 的两端写反（底色直接用强调色），整片会变成一层彩色的膜。
 *
 * ── 涟漪 ──
 *
 * 10 个槽位，两种类型：
 *   普通  速度 15、波宽 3、按扩散半径衰减 15、高度 3
 *   强调  速度 20、波宽 1、按扩散半径衰减 8、 高度 1   ← 点击时用，又细又快
 *
 * 衰减是 `exp(-波前半径 / 衰减距离)` —— 按**扩散了多远**算，不是按时间。
 */

/** 每边的方块数 */
const GRID = 128;
/** 方块间距。和方块尺寸 0.9 之间的 0.15 就是那道缝 */
const SPACING = 1.05;
/** 方块本体的边长 */
const BOX_SIZE = 0.9;
/** 阵列半宽 */
const HALF = (GRID * SPACING) / 2;

/** 涟漪槽位数。必须和着色器里的循环上界一致 */
const RIPPLE_SLOTS = 10;

/** 相机默认机位与视场角，和参考实现一致 */
const CAMERA_POS = new THREE.Vector3(0, 32, 52);
const CAMERA_FOV = 60;

/** 场景底色。方块的"平"状态、以及远处的雾都归到这个颜色 */
const SCENE_BG = "#05070c";

export default function AudioStage3D({
  getAnalyser,
  playing,
  accent,
  motionOn,
  onReady,
}: {
  /** 取频谱分析节点。返回 null 时画面静止，不影响任何别的东西 */
  getAnalyser: () => AnalyserNode | null;
  playing: boolean;
  /** 强调色，一般是封面提出来那个 */
  accent: string;
  /** 减少动效时为 false —— 只渲染一帧静态画面，不跑循环 */
  motionOn: boolean;
  onReady?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  /*
   * 这几个值被 rAF 循环每帧读取，但**不能进 effect 的依赖数组** ——
   * 进了的话每次播放/暂停、每换一首歌都要拆掉整个 WebGL 场景重建，
   * 既卡顿又会很快把浏览器的 WebGL 上下文配额耗光。
   *
   * ★ 只能在 effect 里写 ref，渲染期写会和并发渲染打架
   *   （React 可能渲染了又丢弃，ref 却已经被改掉）。
   */
  const playingRef = useRef(playing);
  const accentRef = useRef(accent);
  const onReadyRef = useRef(onReady);
  const motionRef = useRef(motionOn);

  /*
   * ★ 动效开关的"启停把手"。
   *
   * 建场景那个 effect 依赖数组是空的，**不再因为 motionOn 变化而重建** ——
   * 重建的代价是一整块 WebGL 上下文，而且中间还要 forceContextLoss()。
   *
   * 原来的写法是 effect 依赖 [motionOn]，而 useMotionAllowed 的初值是 true、
   * 真实值要等 effect 才知道，于是开了「减少动效」的访客每次进 /music 都会：
   *   建第一个上下文 → 起 rAF → 被翻成 false → dispose + 丢上下文 → 再建第二个
   * 反复进出很容易撞上浏览器的 WebGL 上下文配额（通常只有十几个），
   * 表现就是"场景整个变黑"。
   *
   * 现在建场景时把启停函数挂在这里，另一个只依赖 motionOn 的 effect 去调它。
   */
  const loopControlRef = useRef<((on: boolean) => void) | null>(null);

  useEffect(() => {
    playingRef.current = playing;
    accentRef.current = accent;
    onReadyRef.current = onReady;
    motionRef.current = motionOn;
  }, [playing, accent, onReady, motionOn]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    // 触屏上拖动是旋转视角，不要让浏览器顺手滚页面
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
    camera.position.copy(CAMERA_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    // 平移关掉：这是个圆形阵列，挪偏了构图就散了
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 80;
    // 不让镜头钻到地面以下，也不让升到正上方 —— 那两个角度都看不出起伏
    controls.minPolarAngle = Math.PI * 0.1;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.update();

    /* ── 几何体 ── */
    const geometry = new THREE.BoxGeometry(BOX_SIZE, 1, BOX_SIZE);

    const uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },

      // 音频：整片共用一组标量，各频段的空间分布由着色器决定
      uSubBass: { value: 0 },
      uBass: { value: 0 },
      uLowMid: { value: 0 },
      uMid: { value: 0 },
      uHighMid: { value: 0 },
      uEnergy: { value: 0 },

      /*
       * ★ 这几个是**实时算出来的**，不是常量。
       * 我之前把它们写死成 0 和 0.2，结果就是"振幅不够"——
       * 尤其是 uDensity：它决定有多少方块能吃到低频，写死 0 等于只有一半方块会动。
       */
      uSmoothness: { value: 0.2 },
      uDensity: { value: 0.5 },
      uWarmth: { value: 0 },
      uBrightness: { value: 0 },
      uSharpness: { value: 0 },

      // 各频段对高度的贡献。参考实现的默认值，别改
      uHeightIdle: { value: 0.6 },
      uHeightSubBass: { value: 4 },
      uHeightBass: { value: 3 },
      uHeightLowMid: { value: 2 },
      uHeightMid: { value: 2.5 },
      uHeightHighMid: { value: 2 },
      uHeightEnergy: { value: 4 },
      uHeightRipple: { value: 3 },
      uHeightRippleAccent: { value: 1 },

      // 涟漪
      uRipples: {
        value: Array.from({ length: RIPPLE_SLOTS }, () => new THREE.Vector4(0, 0, -999, 0)),
      },
      uRippleAccent: { value: new Float32Array(RIPPLE_SLOTS) },

      // 颜色。强调色那几档由 applyAccent 在运行时推出来
      uBaseColor1: { value: new THREE.Color("#050810") },
      uBaseColor2: { value: new THREE.Color("#0a0f1a") },
      uCoolCore: { value: new THREE.Color("#3366cc") },
      uCoolEdge: { value: new THREE.Color("#6699dd") },
      uWarmCore: { value: new THREE.Color("#2244cc") },
      uWarmEdge: { value: new THREE.Color("#4477dd") },
      uRippleColor: { value: new THREE.Color("#33bbdd") },
      uGlowIntensity: { value: 1.2 },
      uFogColor: { value: new THREE.Color(SCENE_BG) },
    };

    const VERTEX_SHADER = /* glsl */ `
      uniform float uTime;
      uniform float uSubBass;
      uniform float uBass;
      uniform float uLowMid;
      uniform float uMid;
      uniform float uHighMid;
      uniform float uEnergy;
      uniform float uSmoothness;
      uniform float uDensity;
      uniform float uHeightIdle;
      uniform float uHeightSubBass;
      uniform float uHeightBass;
      uniform float uHeightLowMid;
      uniform float uHeightMid;
      uniform float uHeightHighMid;
      uniform float uHeightEnergy;
      uniform float uHeightRipple;
      uniform float uHeightRippleAccent;
      uniform vec4 uRipples[${RIPPLE_SLOTS}];
      uniform float uRippleAccent[${RIPPLE_SLOTS}];

      varying vec2 vUv;
      varying float vElevation;
      varying float vRelativeY;
      varying vec3 vNormal;
      varying float vDistance;
      varying vec2 vInstancePos;
      varying vec2 vRippleAnim;
      varying float vFogDepth;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

      // 二维 simplex 噪声。整套起伏的"不规则"全靠它
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                            -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
        m = m * m; m = m * m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      /*
       * 按位置取的固定随机数。**不随时间变** ——
       * 所以"哪些方块吃得到高中音"是定死的。
       * 换成每帧随机的话，画面会变成噪点闪烁而不是稳定的地形。
       */
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        vUv = uv;
        vNormal = normal;

        vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 pos2D = instancePos.xz;
        vInstancePos = pos2D;

        float centerDist = length(pos2D);
        vDistance = centerDist;
        float rnd = random(pos2D);

        // 外圈整体衰减。超过 25 就开始收，50 以外全没
        float globalFalloff = smoothstep(50.0, 25.0, centerDist);

        /* ── 空闲起伏 ── */
        vec2 movingPos = pos2D * 0.05 + vec2(uTime * 0.1, uTime * 0.05);
        float baseNoise = (snoise(movingPos) + 1.0) * 0.5;
        float wave = sin(pos2D.x * 0.15 + pos2D.y * 0.1 - uTime * 0.6) * 0.5 + 0.5;
        float idleElevation = mix(baseNoise, wave, uSmoothness * 0.5 + 0.2) * uHeightIdle * globalFalloff;

        /* ── 音频：每个频段各有各的空间分布 ── */

        // 超低音：圆心 20 单位内的一个圆形区域
        float subRegion = smoothstep(20.0, 0.0, centerDist);
        float subLift = uSubBass * subRegion * uHeightSubBass;

        // 低音：环形区域，半径被一层噪声推着走（所以边界是活的、不规则）
        // 再乘一道随机门限 —— 只有大约一半的方块吃得到
        float bassNoise = snoise(pos2D * 0.1 - vec2(0.0, uTime * 0.2));
        float bassRegion = smoothstep(30.0, 5.0, centerDist + bassNoise * 5.0);
        // uDensity 越高，越多的方块能吃到低频 —— 编曲越满，画面越"涨"
        float bassLift =
          uBass * bassRegion * smoothstep(0.0, 1.0, rnd + uDensity * 0.5) * uHeightBass;

        // 低中音：整片一层缓慢漂移的噪声，负责"底噪"那层起伏
        float lowMidNoise = snoise(pos2D * 0.05 + vec2(uTime * 0.1, 0.0));
        float lowMidLift = uLowMid * (lowMidNoise * 0.5 + 0.5) * uHeightLowMid;

        // 中音：一条流动的"河"。max(0, …) 只取波峰，所以是一条一条的脊
        float riverFlow = sin(pos2D.x * 0.2 + pos2D.y * 0.2 + snoise(pos2D * 0.1) * 2.0 - uTime * 2.0);
        float midLift = uMid * max(0.0, riverFlow) * uHeightMid;

        // 高中音：只有 20% 的方块，而且高度随机
        float highMidRegion = smoothstep(10.0, 35.0, centerDist);
        float highMidLift = 0.0;
        if (fract(rnd * 13.3) > 0.8) {
          highMidLift = uHighMid * highMidRegion * fract(rnd * 7.7) * uHeightHighMid;
        }

        float audioElevation = subLift + bassLift + lowMidLift + midLift + highMidLift;
        // 总能量只给 1% 的方块 —— 那些是画面里最高的几根尖
        if (rnd > 0.99) {
          audioElevation += uEnergy * uHeightEnergy;
        }
        audioElevation *= globalFalloff;

        float elevation = idleElevation + audioElevation;

        /* ── 涟漪 ── */
        float rippleElevation = 0.0;
        float rippleNormal = 0.0;
        float rippleAccentSum = 0.0;

        for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
          vec4 slot = uRipples[i];
          if (slot.w <= 0.0) continue;

          float timeSince = uTime - slot.z;
          if (timeSince < 0.0) continue;

          bool isAccent = uRippleAccent[i] > 0.5;
          float speed = isAccent ? 20.0 : 15.0;
          float width = isAccent ? 1.0 : 3.0;
          float fadeDist = isAccent ? 8.0 : 15.0;
          float heightScale = isAccent ? uHeightRippleAccent : uHeightRipple;

          float waveRadius = timeSince * speed;
          float d = length(pos2D - slot.xy) - waveRadius;
          float ring = exp(-d * d / width);
          // 按**扩散了多远**衰减，不是按时间 —— 走得快也不会提前消失
          float fade = exp(-waveRadius / fadeDist);
          float pulse = ring * fade * slot.w;

          rippleElevation += pulse * heightScale;
          if (isAccent) rippleAccentSum += pulse;
          else rippleNormal += pulse;
        }

        elevation += rippleElevation;

        vRippleAnim = vec2(clamp(rippleNormal, 0.0, 1.0), clamp(rippleAccentSum, 0.0, 1.0));
        vElevation = elevation;

        /* ── 方块从底面往上长 ──
           yPos 是 0~1，乘上总高度之后把底面挪回 -0.5；
           instanceMatrix 再把整个方块抬 0.5，底面最终落在 y=0。 */
        float yPos = position.y + 0.5;
        vRelativeY = yPos;
        float totalHeight = 1.0 + max(0.0, elevation);

        vec3 displaced = position;
        displaced.y = -0.5 + yPos * totalHeight;

        vec4 mvPosition = viewMatrix * instanceMatrix * vec4(displaced, 1.0);
        // 雾要用**相机深度**，不是到原点的距离 —— 这才是 three.js 的 Fog 在算的东西
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const FRAGMENT_SHADER = /* glsl */ `
      uniform vec3 uBaseColor1;
      uniform vec3 uBaseColor2;
      uniform vec3 uCoolCore;
      uniform vec3 uCoolEdge;
      uniform vec3 uWarmCore;
      uniform vec3 uWarmEdge;
      uniform vec3 uRippleColor;
      uniform vec3 uFogColor;
      uniform float uGlowIntensity;
      uniform float uOpacity;
      uniform float uWarmth;
      uniform float uBrightness;
      uniform float uSharpness;

      varying vec2 vUv;
      varying float vElevation;
      varying float vRelativeY;
      varying vec3 vNormal;
      varying float vDistance;
      varying vec2 vInstancePos;
      varying vec2 vRippleAnim;
      varying float vFogDepth;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        // 盒子的面法线是轴对齐的，判 y 分量就分得出顶面和侧面
        bool isTop = vNormal.y > 0.5;
        float distFromTop = 1.0 - vRelativeY;

        float rnd = random(vInstancePos);
        float centerDist = length(vInstancePos);

        /*
         * ★ 高度归一化。除以 6 是因为抬升量程差不多就这么大，
         *   而 topIntensity 的阈值 0.4 意味着**抬升到 2.4 才算全亮**。
         *   大部分方块抬不到这个数，所以画面主体是黑的。
         */
        float normElevation = clamp(vElevation / 6.0, 0.0, 1.0);

        /*
         * 冷暖分区：靠近圆心偏暖、外圈偏冷（0.5 - centerDist/70 从 0.5 降到负）。
         * 每个方块再按自己的随机数在"核色"和"边色"之间取一个，
         * 全用同一个颜色会像一层均匀的塑料。
         */
        float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist / 70.0));
        vec3 zoneCore = mix(uCoolCore, uWarmCore, warmBlend);
        vec3 zoneEdge = mix(uCoolEdge, uWarmEdge, warmBlend);
        vec3 targetGlow = mix(zoneCore, zoneEdge, fract(rnd * 11.0));
        // 音色越亮，整体越往冷青偏一点（高频多的时候画面偏冷）
        targetGlow = mix(targetGlow, vec3(0.4, 0.8, 1.0), uBrightness * 0.5);

        float distFade = 1.0 - smoothstep(30.0, 65.0, centerDist);
        vec3 currentGlow = mix(uBaseColor2, targetGlow, normElevation) * uGlowIntensity * distFade;

        // 涟漪染色：普通涟漪偏涟漪色，强调涟漪泛白
        currentGlow = mix(currentGlow, uRippleColor, vRippleAnim.x);
        currentGlow = mix(currentGlow, vec3(1.0), vRippleAnim.y);

        vec3 bodyColor = mix(uBaseColor1, uBaseColor2, vRelativeY * distFade);

        vec3 color;
        if (isTop) {
          /*
           * ★★ 整个观感的关键 ★★
           * 顶面从**近黑底色**出发，抬升够了才把发光色混进来。
           * 写反（底色用强调色）的话整片会变成一层彩色的膜，
           * "黑色海面泛起彩色浪尖"就没了。
           */
          float topIntensity = smoothstep(0.0, 0.4, normElevation);
          color = mix(uBaseColor2, currentGlow, topIntensity);

          // 顶面四周描一道边，密集排列时才看得出"一格一格"
          float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
          float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
          float edge = min(edgeX + edgeY, 1.0);
          color += currentGlow * edge * 0.6 * (topIntensity + 0.3);
        } else {
          // 侧面：光从上面来，立面自然该暗，只有靠近顶端的部分透出来。
          // uSharpness 越高，这道侧光收得越紧、方块越"硬"
          float verticalFalloff = mix(1.0, 3.0, uSharpness);
          float sideGlow = smoothstep(0.5 / verticalFalloff, 0.0, distFromTop) * normElevation;
          if (normElevation < 0.02) sideGlow = 0.0;
          color = mix(bodyColor, currentGlow, sideGlow * 1.2);

          float rimGlow = smoothstep(0.03, 0.0, distFromTop) * normElevation;
          color += currentGlow * rimGlow;
        }

        color += uRippleColor * vRippleAnim.x * 0.5;
        color += vec3(1.0) * vRippleAnim.y;

        /*
         * 两层"远处淡出"，和参考实现一一对应：
         *
         *   空气透视  按到**原点**的距离（smoothstep 25→55，混 40%）
         *   线性雾    按到**相机**的深度（等价于 scene.fog = new THREE.Fog(c, 25, 80)）
         *
         * 都混向背景色而不是降 alpha —— 不用管半透明排序，边缘也不会透出后面的东西。
         */
        vec3 atmospheric = mix(uBaseColor1, uBaseColor2, 0.4);
        color = mix(color, atmospheric, smoothstep(25.0, 55.0, vDistance) * 0.4);

        float fogFactor = clamp((vFogDepth - 25.0) / (80.0 - 25.0), 0.0, 1.0);
        color = mix(color, uFogColor, fogFactor);

        gl_FragColor = vec4(color * uOpacity, uOpacity);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      // 和参考实现一致。方块的底面朝下，双面渲染顺带兜住俯视角压到地平线以下的情况
      side: THREE.DoubleSide,
      /*
       * 深度**要写**。方块是实心的，靠深度缓冲才能正确遮挡；
       * 关掉的话远处方块会盖住近处（同一个 InstancedMesh 内部不排序），
       * 一眼就看出是错的。
       */
      depthWrite: true,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, GRID * GRID);
    // 着色器会改顶点位置，包围球是按原始方块算的 —— 不关掉会被误剔除而整片消失
    mesh.frustumCulled = false;

    // 实例矩阵只写一次。y 给 0.5：几何体高 1 且居中，抬 0.5 之后底面正好落在 y=0
    const matrix = new THREE.Matrix4();
    let instance = 0;
    for (let row = 0; row < GRID; row += 1) {
      for (let column = 0; column < GRID; column += 1) {
        matrix.makeTranslation(column * SPACING - HALF, 0.5, row * SPACING - HALF);
        mesh.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);

    /* ── 涟漪池 ── */
    const ripples = Array.from({ length: RIPPLE_SLOTS }, () => ({
      x: 0,
      z: 0,
      start: -999,
      strength: 0,
      accent: false,
    }));
    let rippleCursor = 0;

    /** @param accent 强调涟漪：更细更快、高度更低。点击时用 */
    const spawnRipple = (x: number, z: number, strength: number, accent: boolean) => {
      const slot = ripples[rippleCursor];
      slot.x = x;
      slot.z = z;
      slot.start = elapsed;
      slot.strength = strength;
      slot.accent = accent;
      rippleCursor = (rippleCursor + 1) % RIPPLE_SLOTS;
    };

    /* ── 点击生成强调涟漪 ── */
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointer = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();
    let downAt = 0;
    let downX = 0;
    let downY = 0;

    const onPointerDown = (event: PointerEvent) => {
      downAt = performance.now();
      downX = event.clientX;
      downY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      /*
       * 区分"点击"和"拖动旋转"：按下去再抬起来，中间位移不超过 6px
       * 且总时长不到 400ms 才算点击。否则用户每次转视角都会甩出一圈涟漪。
       */
      if (event.button !== 0) return;
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (moved > 6 || performance.now() - downAt > 400) return;

      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // 射线打到 y=0 的地面平面上，落点就是涟漪的圆心
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        spawnRipple(hitPoint.x, hitPoint.z, 1.8, true);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    /* ── 尺寸 ── */
    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    /* ── 特征读取器 ── */
    let reader: AudioFeatureReader | null = null;
    let boundAnalyser: AnalyserNode | null = null;

    /** 第一次拿到 analyser 时才建 —— 采样率由设备决定，不能写死 44100 */
    const ensureReader = (analyser: AnalyserNode) => {
      if (analyser === boundAnalyser && reader) return;
      reader = new AudioFeatureReader(analyser.context.sampleRate, analyser.fftSize);
      boundAnalyser = analyser;
    };

    /*
     * 强调色变了只改 uniform，不重建场景。
     *
     * 配色是从强调色推出来的一整组：主色、亮边、偏色相的暖色两档、以及涟漪色。
     * 亮的那几档直接乘系数推到 1 以上（three 的色彩管理会在线性空间里处理），
     * 这样浪尖才真的"发光"而不是一片灰。
     */
    let currentAccent = accentRef.current;
    const applyAccent = (value: string) => {
      const theme = new THREE.Color(value || "#3366cc");
      uniforms.uCoolCore.value.copy(theme);
      uniforms.uCoolEdge.value.copy(theme).multiplyScalar(1.4);
      uniforms.uWarmCore.value.copy(theme).offsetHSL(0.08, 0, -0.1).multiplyScalar(0.85);
      uniforms.uWarmEdge.value.copy(theme).offsetHSL(0.08, 0, 0.1);
      uniforms.uRippleColor.value.copy(theme).multiplyScalar(1.6);
    };
    applyAccent(currentAccent);

    /* ── 主循环 ── */
    let frame = 0;
    let elapsed = 0;
    let last = performance.now();
    /** 播放时持续生成涟漪用的累加器，攒够 1 就放一个 */
    let rippleBudget = 0;
    /** 上一帧的节拍强度，用来识别"新的一下"（上升沿） */
    let lastBeatValue = 0;
    let announced = false;

    const announce = () => {
      if (announced) return;
      announced = true;
      onReadyRef.current?.();
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);

      // 夹住 dt：标签页切回来时它可能是好几秒，直接用画面会猛地跳一下
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      elapsed += dt;

      const analyser = getAnalyser();
      if (analyser) {
        ensureReader(analyser);
        const features = reader?.read(analyser, playingRef.current, now);
        if (features) {
          /*
           * 7 个原始频段并成 5 档。频段是**标量** ——
           * 空间分布那一步在顶点着色器里做（见上面①）。
           */
          uniforms.uSubBass.value = features.subBass;
          uniforms.uBass.value = features.bass;
          uniforms.uLowMid.value = features.lowMid;
          uniforms.uMid.value = features.mid;
          uniforms.uHighMid.value = features.highMid;
          uniforms.uEnergy.value = features.energy;

          /*
           * ★ 这几个不是常量，是分析器每帧算出来的。
           * uDensity 尤其关键 —— 它是"有多少个频段超过平均能量×1.5"，
           * 直接当 bassLift 的随机门限偏移，决定画面涨不涨得起来。
           */
          uniforms.uSmoothness.value = features.smoothness;
          uniforms.uDensity.value = features.density;
          uniforms.uWarmth.value = features.warmth;
          uniforms.uBrightness.value = features.brightness;
          uniforms.uSharpness.value = features.sharpness;

          if (playingRef.current) {
            /*
             * ★ 节拍涟漪：强度**直接用分析器给的值**（低频正向通量 ×3，上限 4）。
             * 参考实现就是把这个数当强度传下去的。
             *
             * 之前我按 0~1 的脉冲写、最大才 1.6，再乘 uHeightRipple(3) 得到抬升 4.8；
             * 而它最大是 4 × 3 = 12 —— 差了三四倍，所以"振幅不够高"。
             *
             * 用上升沿判断"是不是新的一下"：分析器内部有 20 帧冷却，
             * 这里只要看它有没有突然跳起来就行。
             */
            if (features.beat > lastBeatValue + 0.3) {
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.sqrt(Math.random()) * HALF * 0.5;
              spawnRipple(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                features.beat,
                false,
              );
            }

            /*
             * 再补一层低强度的持续涟漪。参考实现只在节拍和"流星"上放，
             * 但在安静段落（民谣、纯人声）节拍很稀疏，整片会显得死；
             * 补这一层让画面一直有东西在动，强度压得很低，不会盖过节拍。
             */
            rippleBudget += dt * (0.4 + features.energy * 1.6);
            while (rippleBudget >= 1) {
              rippleBudget -= 1;
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.sqrt(Math.random()) * HALF * 0.55;
              spawnRipple(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                0.45 + features.energy * 0.5,
                false,
              );
            }
          } else {
            rippleBudget = 0;
          }

          lastBeatValue = features.beat;
        }
      }

      // 换歌时封面色会变，只改 uniform，不重建场景
      if (accentRef.current !== currentAccent) {
        currentAccent = accentRef.current;
        applyAccent(currentAccent);
      }

      // 把涟漪池同步进 uniform。普通涟漪跑 15/秒、衰减距离 15，约 3 秒走完
      for (let i = 0; i < RIPPLE_SLOTS; i += 1) {
        const slot = ripples[i];
        const age = elapsed - slot.start;
        const alive = age >= 0 && age <= 4;
        uniforms.uRipples.value[i].set(slot.x, slot.z, slot.start, alive ? slot.strength : 0);
        uniforms.uRippleAccent.value[i] = slot.accent ? 1 : 0;
      }

      uniforms.uTime.value = elapsed;
      uniforms.uOpacity.value += (1 - uniforms.uOpacity.value) * Math.min(1, dt * 1.5);

      controls.update();
      renderer.render(scene, camera);
      announce();
    };

    /** 减少动效时只画一帧：把场景摆好、渲染一次，不启动循环 */
    const renderStill = () => {
      uniforms.uOpacity.value = 1;
      camera.position.copy(CAMERA_POS);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      announce();
    };

    /* ── 循环的启停。建场景时不自动开跑，交给下面那个 effect ── */
    const startLoop = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    /** 关掉动效时只渲染一帧静态画面，别让画布空着 */
    const applyMotion = (on: boolean) => {
      if (on) startLoop();
      else {
        stopLoop();
        renderStill();
      }
    };
    loopControlRef.current = applyMotion;

    /*
     * 标签页切到后台就停掉循环 —— 看不见的画面没必要占着 GPU。
     * 回来时重置 last，不会因为停了很久而跳帧。
     */
    const onVisibility = () => {
      if (!motionRef.current) return;
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      loopControlRef.current = null;
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      resizeObserver.disconnect();

      /*
       * 必须彻底释放。浏览器同时能持有的 WebGL 上下文数量很有限（通常十几个），
       * 反复进出这个页面而不释放的话，很快就会出现"场景整个变黑"——
       * 那时浏览器已经不给你新的上下文了。
       */
      controls.dispose();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };

    /*
     * ★ 依赖数组是**空的** —— 场景只建一次，到卸载才拆。
     *
     * playing / accent / onReady / motionOn 全都走上面的 ref。
     * 它们任何一个进了依赖数组，都会导致整块 WebGL 上下文被重建，
     * 而上下文配额只有十几个 —— 切几首歌就没了。
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * 动效开关单独管：只调启停函数，不碰场景。
   *
   * 这个 effect 声明在建场景那个**之后**，所以挂载时的顺序是：
   * 先建好场景（此时循环还没跑）→ 这里再按真实值启动或画静态帧。
   * 于是 useMotionAllowed 那个"初值 true、随后翻 false"的抖动
   * 不会再触发一次重建。
   */
  useEffect(() => {
    loopControlRef.current?.(motionOn);
  }, [motionOn]);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />;
}
