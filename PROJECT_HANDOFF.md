# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-11-21 JST

## 現在地

Phase G（2026-07-29）の分類と、2026-08-04のCanary承認を引き継ぎます。

- `PHASE_G_CANONICAL_RECONCILIATION_GREEN`。`LOCAL_CANDIDATE_LINEAGE_ADOPTED`。`REMOTE_GREEN_BASELINE_SUPERSEDED`。
- `CANARY_RIGHTS_FAIL_CLOSED`。`LOWPASS_CANARY_PROJECT_SCOPED_PRODUCTION_APPROVED`。
- `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING`。`PHASE_H1_IMPLEMENTATION_UNLOCKED`。
- 2026-11-21: 本人が「特に操作周り・画面がチープ過ぎるのが気懸かり」と指摘し、同日「操作・画面品質を先に」と決めた。見た目の基準は既存concept（[決定](docs/decision-log.md)）、現物観測・原因・進め方は [`docs/evidence/restart-2026-11-21-feel-visual/`](docs/evidence/restart-2026-11-21-feel-visual/README.md)。

`PHASE_H1_IMPLEMENTATION_UNLOCKED` は技術的な開始可能性だけを示し、実装承認ではありません。Exact procedural Canaryのproject-scoped rights/production利用は承認済みです。Phase H、main merge、deploy、releaseは未実施です。
### Canonical identity
| 項目 | 確定値 | 意味 |
| --- | --- | --- |
| implementation source | local `d2683ee` lineage | Phase G Closureの意味論を採用した系統 |
| preserved remote baseline | `f3ea10949a908236adad1d2106ff0634804fc4bd` | build可能なgreen baselineだがacceptance-equivalentではない |
| no-force merge | `65fb21f992d9b2d8f933c343f1b2ab766311bbe2` | local / remote両方を親に持つ `merge: reconcile canonical Phase G candidate` |
| corrective runtime/evidence tip | `c9c9cdc16268c60995cf82499dc59ca277d4f1ba` | script末尾正規化とfresh importer portability修正を含む |
| canonical local checkout | `project/frontier` | `origin/project/frontier` を追跡する |
| canonical development refs | `origin/feat/phase-g-guided-qa-canary-v1`、`origin/project/frontier` | 本文書を含む最終commitへ通常fast-forwardし、live ref readbackを正とする |
| Phase F保全 | `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` | 既存tagを変更しない |
| exact Canary source | CGAW `5d33ba89f141303072e2bc782c8f54302c6fd572` | declared-rights supply contract |
| exact GLB SHA-256 | `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102` | import / registry / fresh acceptanceで一致 |
| exact manifest SHA-256 | `9b2e9b87805456f72ca66fd0e4915bff1b23c1c4f4f4c6e7052fdfb4c8ee9f05` | rights/source identityを含むproducer manifest |
| rights | `LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1` | LOWPASS game development/build/distribution only |
### 統合した成果と検証

- Canaryは`DECLARED`、`internalOnly: false`、`distributionApproved: true`へ移行した。importerはproducer manifest byte identityとrights readbackを追加検証する。external buildはCanaryを同梱し、GLB hashとproject-scoped rightsをbuild後に検証する。
- ビジュアル改善とCanaryの2026-08-04承認を `07bd94b` から取り込み、Phase Cの `ceaadd9` から抽出地点のRaw QA補助を現行実装へ移植。2026-11-16に `npm ci`、34 files / 203 tests、typecheck、通常・外部向けbuildを確認した。ChromeでGuided Audit 22/22、24条件の画面、3回の出撃・帰還、外部向けCanary選択を確認し、console error・unhandled rejection・外部通信はいずれも0件。
- UV / texture / Blender headlessと独立human rubricは未完了だが、ownerはこのexact procedural packのproduction利用を承認した。standalone再配布、一般第三者再利用、PR/main、release/deploy/publicationはこの判断に含まない。

merge前監査は [`artifacts/reconciliation/phase-g-canonical-v2/`](artifacts/reconciliation/phase-g-canonical-v2/) にあり、merge base、両側commit、range-diff、file分類、4 gap、競合12件のfile-specific resolutionを保存しています。repository全体のours / theirs、force push、rebase、resetは使っていません。
2026-07-29に閉じた4 acceptance gapとFresh acceptanceの表は [`docs/status-history.md`](docs/status-history.md) へ原文のまま移した。

ローカル技術greenはhuman sensory、remote CI、PR review、main統合、rights承認、production、公開完了を意味しません。
### 再現

```powershell
npm ci
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
npm run build:external
npm run evidence:phase-g -- node_modules/.cache/lowpass-frontier-verification
npm run dev -- --host 127.0.0.1
```

- primitive: `http://127.0.0.1:5173/?qa=1&security-posture=watchful&asset-mode=primitive` ／ Canary: `http://127.0.0.1:5173/?qa=1&security-posture=watchful&asset-mode=canary-v1`
- `Run full guided audit` で22段階、`Advanced / Raw Controls` で20 cue、asset selection、fallback reasonを確認する。 plain `npm run dev` が `[::1]` のみにbindした場合は `localhost` を使うか、上の明示hostコマンドで再起動する。

portableなのはtracked source、tests、import済みCanary、registry / manifest、reconciliation artifacts、closure evidence、正本文書です。`node_modules`、`dist`、`.serena`、IndexedDB save、音量設定、実行中Vite、Chrome profileは端末ローカルで、remote受入証拠にしません。

## Phase Gの実装境界

- V2はV1全fieldと永続security summaryだけを保存する。runtime位置、task、lock、cooldown、local/shared knowledgeを保存しない。
- routineはneedle 1機、watchfulはneedle + watcherの固定2機。確認contactは帰還settlementだけで永続化する。
- enemyは直接観測または敵linkで共有済みのfactだけを使う。watcherはobserve / overwatch、needleは再視認後interdict / sabotage。
- simultaneous lock / interdict / relay sabotageは各1、interference後graceは4秒。cautiousは新規攻撃保留、outnumberedは全攻撃解除・共通退避。
- `ItemLocation`、revision、settlement冪等性、dynamic import、disposeを維持する。HP、死亡、射撃、無制限敵、偽通信、音声模倣を導入しない。

## 残作業
| 目的 | 効果 | 必要条件 | 現在状態 | owner | 次の動き |
| --- | --- | --- | --- | --- | --- |
| Phase G人間感覚レビュー | cueの音量・音色・疲労感と最終game feelを製品判断できる | ミュートなしdesktop、観察メモ | deferred / non-blocking。自動受入を止めない | human game design / UX | 問題が実観測された場合だけG-TUNE sliceを提案する |
| 操作・画面品質 | 移動・向き・キャラの動き、照明・材質・HUDの安っぽさを解消する | 基準画像 `visual-overhaul-v1` 01・02・03・09、通常Chrome 60fpsでの本人確認 | B画面・C HUD・A操作感を実装し `project/frontier` へpush済み。自動検査は通過、見た目と手触りは本人の採否待ち（[記録と確認手順](docs/evidence/feel-visual-2026-11-21/README.md)） | 本人（見た目と手触りの採否）／実装担当 | 本人が通常Chromeで確認し、違和感を操作ごとに返す。返却があれば調整sliceを切る |
| Draft PR #4 review | canonical Phase Gをmain統合前に人間レビューできる | remote checks、review方針、rollback判断 | Draft維持。ready / mergeは未許可 | owner / reviewer | reviewを行い、ready化・mergeは別承認する |
| Authority Guard PR #3 | live frontierと静的snapshotの優先関係を維持する | `origin/project/frontier` readback、docs-only guard | readyのまま維持、merge未許可 | owner / reviewer | frontier drift時だけCURRENT_FRONTIERを更新する |
| Phase H1開始判断 | 契約・証拠・再訪判断の因果を1 sliceへ限定する | accepted canonical base、完全Prompt、目的・受入・非対象・停止条件の明示承認 | technical unlock、実装未開始 | owner / supervising AI | 本報告の次Promptを明示承認してから開始する |
| Canary texture / independent rubric | 承認済みprocedural packのvisual depthを上げる | UV / texture tool、performance budget、比較rubric | rights / production利用承認済み、flat material / texture 0 | asset / art owner | 1 assetだけでtexture/LOD thin sliceを切る |
| device / performance | physical Gamepadと大容量warningの実影響を判断する | 実機、cold / warm / revisit計測 | mock controller green、物理Gamepad未確認、warning非ブロッキング | QA / performance | 問題端末がある場合だけ専用計測sliceを作る |
| deploy / release | 製品を外部配布する | review、rights、品質、target、rollbackの明示承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIが最初に行うこと

1. `git fetch --prune --tags origin` 後、`origin/feat/phase-g-guided-qa-canary-v1` と `origin/project/frontier` が同一commitであることを確認する。
2. そのlive HEADが `d2683ee` と `f3ea109` の双方を祖先に持ち、`65fb21f`、`bf6341b`、`c9c9cdc` を含むことを確認する。
3. [`docs/evidence/phase-g-closure/`](docs/evidence/phase-g-closure/) で2026-07-29のguided / audio / browser / rights readback、24条件contact sheet、3 lifecycleを読む。
4. code変更を始める前に `npm ls --depth=0`、typecheck、全Vitest、build、diff checkを再実行する。fresh acceptanceは上記SHA-bound証拠として扱う。
5. Phase Gの距離、delay、scan、lock、pressure、音量・文言を観測なしに調整しない。Phase Hは完全Promptのowner承認前に開始しない。 PR ready化、merge、tag、deploy、release、access / public visibility、rights昇格はそれぞれ別gateとする。
6. 操作・画面品質は実装済みで本人の採否待ち。[記録と確認手順](docs/evidence/feel-visual-2026-11-21/README.md)の前後比較と本人の返却を読んでから調整する。手触りはClaude desktopの内蔵ブラウザ（12〜26fps）で判定しない。ソフトウェア描画では軽い描画（`renderTier: reduced`）に自動で切り替わる。

## 次の開発判断

Phase G canonical reconciliationの技術blockerはありません。2026-11-21に本人が「操作・画面品質」をPhase H1より先にすると決め、同日にB画面・C HUD・A操作感を実装しました（[記録](docs/evidence/feel-visual-2026-11-21/README.md)）。見た目と手触りの本人確認が次の判断点で、Phase H1はその後の候補です。

Phase H1「契約・証拠・再訪判断の因果深化」の条件は次のとおりです。既存V2 schemaとstatic definition / persisted state境界を維持し、帰還済みevidenceを次訪問のrouteまたはsupport差へ1つだけ結び付け、ブラウザで因果を説明できることを受入条件にします。第2world、途中再開、敵追加、WorldState migration、契約大量追加を同時に行いません。
