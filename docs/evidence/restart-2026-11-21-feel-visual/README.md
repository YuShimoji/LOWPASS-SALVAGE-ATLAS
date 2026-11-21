# 操作・画面品質の再起動調査（2026-11-21）

次の集中セッションで「操作周り・画面がチープ」を直すための現物観測、原因の所在、進め方です。進め方は2026-11-21に本人が推奨で可とした（下の「本人判断」）。

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

## 2026-11-21 本人判断

> 操作・画面品質を先に。理想的にはコンセプトアートなどデザイン駆動が欲しいですが推奨で良いです。

- 本人が決めたこと: 次の集中セッションは「操作・画面品質」をPhase H1より先にする
- 本人が推奨で可としたこと: 下の「設計の基準」と「進め方」。これはAIの推奨を本人が委任で受け入れたもので、見た目の最終的な採否は実画面を見た本人が決める

## 設計の基準（デザイン駆動）

基準画像は既存の [`visual-overhaul-v1`](../../concept-art/visual-overhaul-v1/README.md) を使い、新しい画像は作らない。[2026-08-04の決定](../../decision-log.md)どおり、暗さは浸水市場のfield固有条件で、全体paletteにはしない。昼光の [`field-expansion-v1`](../../concept-art/field-expansion-v1/README.md) は将来のfield用で今回は対象外。

| 対象 | 基準画像 | 画像から取る要素 |
| --- | --- | --- |
| 浸水市場 | `01-flooded-market-keyframe.png` | 暗い基調、壁の暖色ランプ、奥の青緑の光、赤い警報灯、濡れた床の反射、倒れた棚と浮遊物の密度、手前の隊員の背中越しの画角 |
| 船内デッキ | `02-expedition-deck.png` | 暗い格納庫、暖色の吊りランプ、青緑に光る端末画面、黄黒の床ライン、木箱とケースの積み上げ、奥のゲートの青緑の縁 |
| 状態の見せ方 | `09-security-cell-causality.png` | 監視を橙の光の円錐、ロックを赤いレーザー、安全・味方を青緑の光で示す。文字ラベルより画面内の光で状態を伝える |
| 隊員 | `03-salvage-squad.png` | 役割ごとの配色（黄土・茶・紺）、ヘルメットと胸・膝の青緑の発光点、厚い肩・膝の装甲、背嚢に付く工具やアンテナで役割が分かるシルエット。`createPlayerAvatar.ts` はAと同じファイルなので同じ担当が扱う |

| 聞き取り項目 | 推奨（本人委任で採用） | 理由 |
| --- | --- | --- |
| 見た目の目標 | 上の基準画像。現行の市場と船内だけに適用 | 既存の決定と矛盾せず、すぐ比較できる絵がある |
| PS1風表現 | 既定値（`vertexSnap` on、`lowResolution` off）を変えない | 基準画像は揺れの少ない低ポリで、主因は照明と密度にあるため変数を増やさない |
| 操作の手本 | 指定なし。短い加減速と旋回補間を入れ、本人の手触りで値を決める | 手本が無いので、数値は実機の本人確認で詰める |
| カメラ操作 | 現行の右ドラッグを維持 | Pointer Lock前提に変えると入力系とQAの除外規則全体に波及する |
| HUDの情報量 | 減らし、状態は画面内の光と色で伝える（基準画像09の方式） | 基準画像にHUDが描かれておらず、開発用ラベルの露出が安っぽさの一因 |

HUDは基準画像に無いので、HUDだけは実装前に、実画面のスクリーンショットへ重ねたHTMLのラフで形を決める。画像生成でHUDのコンセプトを作る場合は、枚数と形式を本人が承認してから行う。

## 集中セッションの進め方（推奨・本人委任で採用）

1. **基準と現状の並置**: 基準画像01と同じ構図になる市場のカメラ位置を決め、現状を撮る。以後の比較はこの画角と船内の固定画角で行う
2. **B 画面**: 全体光を下げ、基準画像の光源（暖色ランプ・青緑の機器光・赤い警報）を置く。濡れた床の材質、棚と散乱物を足す。後処理は発光と周辺減光から試す
3. **C HUD**: 文字サイズの下限、書体、開発用ラベルの除去、診断パネルを既定で隠す（F1と `?qa=1` で表示）。実装前にラフを本人へ見せる
4. **A 操作感**: 加速・減速、旋回補間、手続き的な歩行（上下動・傾き・脚の振り）、カメラ追従の再調整。BとCとはファイルが重ならないので並行できる
5. **受入**: 各段で基準画像と同じ画角の前後比較を本人へ出す。手触りは本人が通常のChrome（60fps）で確かめる

| スライス | 主な変更先 | 変えないもの |
| --- | --- | --- |
| A 操作感 | `PhysicsWorld.ts`、`GameSimulation.ts`、`createPlayerAvatar.ts`、`ThirdPersonCamera.ts` | 最高速 `WALK_SPEED` / `SPRINT_SPEED`、衝突、経路 |
| B 画面 | `RenderSystem.ts`、`createFloodedMarket.ts`、`createShipInterior.ts`、`Ps1MaterialFactory.ts` | collider、navigation、`ItemLocation` の表示投影の規則 |
| C HUD | `style.css`、`Hud.ts`、`SemanticCueCatalog.ts` の表示文、`GuidedQaPanel.ts` | Security Cellの判断、字幕の発火条件 |

注意点:

- ゲームルール・Security Cell・保存・`ItemLocation` は変更しない。基準画像09の光の円錐やレーザーは、既存の状態から描く表示だけにする
- Aの加減速は到着時刻をわずかに変える。Security Cellはplayer速度を直接読まない（`src/game/security`・`src/game/threat` に速度参照なし）が、Guided Audit 22段階と既存テストで回帰を確認する
- 見え方と手触りはテストで合格にしない。自動検査で守るのは、描画資源の上限（draw calls・geometry）と3回の出撃・帰還で資源が増えないことまで
- 後処理ライブラリ（three.js addonsのEffectComposer等）の採否は、着手時に現行three.js 0.185の一次資料で確かめる。この調査では未確認

## 未確認

- 未確認: 通常Chrome・60fpsでの操作の手触り、物理Gamepad、音量・音色（いずれも本人の実機確認が必要）
- 未確認: 出撃コンソールの遠征編成パネル（`ExpeditionPanel`）の画面。今回は内蔵ブラウザで開けず、QAの出撃ボタンで代用した
