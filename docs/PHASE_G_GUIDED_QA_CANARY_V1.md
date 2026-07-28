# Phase G Guided QA / Canary v1

更新日: 2026-07-28

## 目的と境界

このsliceは、Phase Gの技術挙動を再現可能な18-step reviewへまとめ、CGAW readability Canaryを既存simulationのvisual consumerとして接続します。`ExpeditionManifest`、gate evaluator、`ItemLocation`、MissionSession、Rapier、Security Cell、Porter controllerの権威は変更しません。

## Guided scenario

カテゴリはSetup、Contact sequence、Relay、Flare、Audio test、Resultsです。Setupは28U draftを通常のplannerで確定し、固定seed `phase-g-guided-audit-v1` で通常のreservation / mission launchへ渡します。接触、relay、flare、Porterは既存controller APIを使い、結果ステップはdebug readbackだけを取得します。

パネルはnative `details` / `summary`、14px本文、40px以上のbutton、focus-visible、live statusを持ちます。開いている間はworld inputを止め、Escapeはcapture phaseでパネルだけを閉じます。raw teleport / stagingとcue単体buttonはAdvancedに隔離します。

## Audio vocabulary

Web Audioで17 cueをprocedural生成します。sample fileや外部requestはありません。各cueはcaption、minimum interval、played / muted / rate-limited / context-unavailable auditを持ちます。`audio=muted` はAudioContextを生成せず、自動試験の結果にはmuted outcomeを残します。

## Canary contract

| Identity | 固定値 |
| --- | --- |
| source repository | `YuShimoji/CodexGameAssetWorkbench` |
| source commit | `c893374ab0edd7329bd1482dbd6b99960acbbb68` |
| pack | `lowpass-readability-canary-v1` |
| GLB bytes | 70,892 |
| GLB SHA-256 | `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102` |
| schema | `lowpass-runtime-asset-pack-1.0.0` |
| rights | `NOASSERTION` / internal review only |

import scriptはcommit、GLB magic / bytes / hash、schema、5 asset key、50 stable node、9 anchor、5 collision proxy、参照解決、local path非混入をfail closedで確認してから決定論的copyします。runtime loaderもhashとGLB nodeを再検証します。

## Feature switchとfallback

`asset-mode=primitive` が安全な既定値、`asset-mode=canary-v1` がCanaryです。未知mode、HTTP、hash、manifest、GLB parse、semantic nodeのどれかが失敗するとprimitiveへ戻り、requested / active mode、status、reason、load durationをreadbackに残します。

Canary sceneはmission開始時だけlazy loadし、mission viewのdisposeでcloneとsource sceneを解放します。3回のfresh mission cycleでgeometries 59、textures 3、programs 3、scene objects 110、DOM nodes 297が一定でした。

## A/B判定

4条件の固定captureは [`../output/playwright/phase-g-guided-qa/index.html`](../output/playwright/phase-g-guided-qa/index.html) にまとめています。Canaryの技術costは同じ時間窓で +8 draw calls / +96 triangles、texture / program delta 0でした。この数字は採用判断を補助しますが、人間の役割識別、音量、tempo、rights判断を代替しません。
