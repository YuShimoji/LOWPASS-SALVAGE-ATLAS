# 操作・画面品質の再起動調査（2026-11-21）

次の集中セッションで「操作周り・画面がチープ」を直すための現物観測、原因の所在、進め方の案です。ここに書いた案は未採用で、採否は本人が決めます。

## 本人原文

> 現在のLowpass-Salvageについて再起動したいです。次の集中的に取り組むセッションのために事前準備・資料整理をしてください。
> 特に操作周り・画面がチープ過ぎるのが気懸かりです。

## 観測条件

- 版: `project/frontier` = `dfd99e110182783217d40cffbd83b5d15c75c377`（2026-11-16統合。`07bd94b` の画面改善とCanary承認を含む）
- 経路: Claude desktopの内蔵ブラウザ、1280×720。通常起動 `/`（primitive）と `?qa=1&security-posture=watchful&asset-mode=canary-v1`（QAの出撃ボタンで市場へ直行）
- 内蔵ブラウザは12〜26fpsしか出ず、`DROPPED CATCH-UP` が増えた。操作の手触り（加速・止まり方・カメラ追従）はこの環境では判定していない。画面の構成・照明・HUDは判定できる

| 画像 | 状態 |
| --- | --- |
| [01-ship-start-default.jpg](01-ship-start-default.jpg) | 通常起動直後。診断パネルが右下を覆う |
| [02-ship-diagnostics-hidden.jpg](02-ship-diagnostics-hidden.jpg) | F1で診断を消した船内 |
| [03-market-mission-start.jpg](03-market-mission-start.jpg) | 浸水市場の出撃直後（Canary） |
| [04-market-zoomed-out.jpg](04-market-zoomed-out.jpg) | 同、ホイールで引いた画角 |

比較の基準は [`../../concept-art/visual-overhaul-v1/01-flooded-market-keyframe.png`](../../concept-art/visual-overhaul-v1/01-flooded-market-keyframe.png)。ただしconcept画像は `CONCEPT_REFERENCE_ONLY` で、見た目の目標として採用はされていない。

## 「チープ」に見える原因の所在

| 領域 | 現物の症状 | 現在の実装 | 場所 |
| --- | --- | --- | --- |
| 移動 | 押した瞬間に最高速、離した瞬間に停止する | 入力 × `WALK_SPEED 3.2` / `SPRINT_SPEED 5.1` をそのまま移動量にする。加速・減速・慣性なし | [PhysicsWorld.ts:127](../../../src/physics/PhysicsWorld.ts) |
| 向き | 入力方向へ1フレームで向きが変わる | `facingYaw = atan2(...)` を毎tick代入。旋回の補間なし | [GameSimulation.ts:26](../../../src/game/simulation/GameSimulation.ts) |
| キャラの動き | 箱の人形が姿勢を変えずに滑る | `AnimationMixer`・歩行の上下動・腕振り等の実装が `src/render` `src/game` に0件 | [createPlayerAvatar.ts](../../../src/render/objects/createPlayerAvatar.ts) |
| 照明 | 画面全体が均一に明るく、陰影と奥行きが出ない | Ambient 1.05 + Hemisphere 1.55 + Directional 3.1 + 補助Directional 1.4。局所光はPointLight 2個（抽出地点・ゲート） | [RenderSystem.ts:80](../../../src/render/app/RenderSystem.ts) |
| 材質 | 単色の面だけで、汚れ・水面・質感がない | テクスチャ使用0（診断値 `TEX 3` はシステム分）。Canaryもflat material | [Ps1MaterialFactory.ts](../../../src/render/materials/Ps1MaterialFactory.ts) |
| 後処理 | 発光・空気感・周辺減光がない | EffectComposer等の後処理なし。`antialias: false` | [RenderSystem.ts:62](../../../src/render/app/RenderSystem.ts) |
| 環境の密度 | 棚・散乱物・天井が少なく、広い床が空く | 船内はscene objects 105 / 2236 tris | [createFloodedMarket.ts](../../../src/render/objects/createFloodedMarket.ts)、[createShipInterior.ts](../../../src/render/objects/createShipInterior.ts) |
| HUDの文字 | 文字が小さく読みにくい | `font-size` 8px指定9件・9px指定20件。書体は `"Courier New", "Yu Gothic UI", monospace` | [style.css:12](../../../src/style.css) |
| HUDの言葉 | 開発用の英語ラベルがプレイヤー表示に出る | `PHASE G / SECURITY CELL`、`SECURITY CELL DISENGAGING`、`CTRL PLAYER · LEAD PLAYER`、`DRAFT · 18/28U` | [Hud.ts:57](../../../src/ui/Hud.ts)（PHASE G・DRAFT）、[Hud.ts:131](../../../src/ui/Hud.ts)（CTRL・LEAD）、[SemanticCueCatalog.ts](../../../src/render/audio/SemanticCueCatalog.ts)（字幕） |
| 診断表示 | 通常起動で診断パネルが画面の約1/4を覆う | `debugVisible = true` が既定 | [Hud.ts:47](../../../src/ui/Hud.ts) |
| 操作説明 | 下端の1行が小さく英日混在 | `WASD 移動　RIGHT DRAG CAMERA　WHEEL DISTANCE　E 操作　F1 診断` | [Hud.ts:70](../../../src/ui/Hud.ts) |

既存のPS1風設定（`lowResolution` 既定false、`vertexSnap` 既定true、`dithering`、`distanceFog`）は意図した低忠実度表現で、上の症状の主因ではない。concept 01との差は、ポリゴン数よりも照明の明暗差・局所光・水面・散乱物・キャラの姿勢にある。

## 集中セッションの進め方（案・未採用）

1. **方向の確定（本人）**: 下の聞き取り項目のうち、見た目の目標とPS1風表現の扱いを先に決める。照明と材質はこの答えで変わる
2. **ラフ**: 市場の出撃直後の画角1枚について、改善後のラフ（照明・HUD配置・文字サイズ）を実装前に示す
3. **薄い縦切り3本**（ゲームルール・Security Cell・保存・`ItemLocation` は変更しない）

| スライス | 内容 | 主な変更先 | 方向の確定への依存 |
| --- | --- | --- | --- |
| A 操作感 | 加速・減速、旋回の補間、手続き的な歩行（上下動・傾き・脚の振り）、着地と停止の表現、カメラ追従の再調整 | `PhysicsWorld.ts`、`GameSimulation.ts`、`createPlayerAvatar.ts`、`ThirdPersonCamera.ts` | 小さい（手触りの好みだけ） |
| B 画面 | 全体光を下げて局所光と発光体を置く、水面材質、散乱物、後処理（発光・周辺減光・色調）を1画角で試す | `RenderSystem.ts`、`createFloodedMarket.ts`、`Ps1MaterialFactory.ts` | 大きい |
| C HUD | 文字サイズの下限、書体、開発用語をプレイヤー表示から外す、診断パネルを既定で隠す（F1と `?qa=1` で表示） | `style.css`、`Hud.ts`、`SemanticCueCatalog.ts`の表示文、`GuidedQaPanel.ts` | 中（書体と情報量の好み） |

4. **受入**: 本人が通常のChromeで60fpsの状態で触る。内蔵ブラウザの低fpsでは手触りを判定しない。前後比較は同じseed・同じ画角のスクリーンショットで並べる

注意点:

- Aの加減速は到着時刻をわずかに変える。Security Cellはplayer速度を直接読まない（`src/game/security`・`src/game/threat` に速度参照なし）が、Guided Audit 22段階と既存テストで回帰を確認する
- 見え方と手触りはテストで合格にしない。自動検査で守るのは、描画資源の上限（draw calls・geometry）と3回の出撃・帰還で資源が増えないことまで
- 後処理ライブラリ（three.js addonsのEffectComposer等）の採否は、着手時に現行three.js 0.185の一次資料で確かめる。この調査では未確認

## 聞き取り項目（セッション開始時に本人へ）

| 項目 | 選択肢の例 | 答えで変わること |
| --- | --- | --- |
| 見た目の目標 | concept `visual-overhaul-v1/01` の暗い浸水＋局所光 ／ `field-expansion-v1` の昼光の都市 ／ 場所ごとに切替 | Bの照明・色・後処理の方針 |
| PS1風表現 | 残して強める ／ 残して弱める ／ 外す | 材質・解像度・頂点スナップの扱い |
| 操作の手本 | 好きな三人称探索ゲームの手触り（自由記述） | Aの加減速・旋回速度・カメラ距離の初期値 |
| カメラ操作 | 現行の右ドラッグで回す ／ マウス移動で常時回す（Pointer Lock） | 入力系とHUDの操作説明 |
| HUDの情報量 | 減らして状況は画面内の表現で伝える ／ 量はそのまま読みやすくする | Cの範囲と、Security Cell状態の見せ方 |

## 未確認

- 未確認: 通常Chrome・60fpsでの操作の手触り、物理Gamepad、音量・音色（いずれも本人の実機確認が必要）
- 未確認: 出撃コンソールの遠征編成パネル（`ExpeditionPanel`）の画面。今回は内蔵ブラウザで開けず、QAの出撃ボタンで代用した
