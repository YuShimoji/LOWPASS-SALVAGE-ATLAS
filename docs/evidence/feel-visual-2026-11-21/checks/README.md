# 段ごとの検査結果（操作・画面品質スライス 2026-11-21）

各フォルダは `npm run evidence:phase-g` が書き出す readback の写し。Phase G の締め証跡（`docs/evidence/phase-g-closure/`）は履歴として上書きしない。

| 段 | commit | Guided Audit | 3周の資源増加 | コンソールエラー | 実行経路 |
| --- | --- | --- | --- | --- | --- |
| stage-b | 182ac54 | 22/22 PASS | なし（accumulationDelta 全0） | 0 | 正式スクリプトそのまま |
| stage-c | eae3a28 | 22/22 PASS | なし（accumulationDelta 全0） | 0 | 下の注記 |
| stage-a | 47bf6f0 | 22/22 PASS | なし（accumulationDelta 全0） | 0 | stage-c と同じ（読み込み最長 28秒） |
| stage-a-direction | 移動方向の補間の commit（このファイルと同じ commit） | 22/22 PASS | なし（accumulationDelta 全0） | 0 | stage-c と同じ。正式スクリプトは後始末の `EBUSY` で止まり、元の例外は隠れて未確認（写しでの読み込み最長 33秒） |

## stage-c・stage-a の実行経路

正式スクリプトは 3回とも、2回目のページ読み込みで `CDP_EVENT_TIMEOUT // Page.loadEventFired`（上限20秒）になり、後始末の `EBUSY` がその例外を隠した。同じ時間帯に stage-b の commit を別 worktree で同じスクリプトにかけても完走しなかった（以前は完走した commit）。単独で 10回読み込みを測ると 0.3〜3秒で、遅いのは一部の回だけだった。

そのため stage-c の値は、正式スクリプトの写しで **ページ読み込み待ちの上限だけを 180秒に延ばし**、元の例外を表示するようにしたもので取った。ゲームの操作・判定・各段の上限時間は変えていない。この写しでの読み込み時間は 0.4〜17秒だった。

A段でも正式スクリプトは同じ箇所で止まった。疑い（未検証）: このスクリプトは同じ root に通常と `mode: "external"` の2つの Vite サーバーを同時に立てるため、依存の事前バンドル（`node_modules/.vite`）を取り合い、読み込みが遅くなる。

検査の仕組み（上限時間・キャッシュの分離・GPU の有無）を変えるかは、この作業の範囲外として親セッションへ返している。
