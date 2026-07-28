# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-07-28

## 現在地 — 2026-07-28 正本

- canonical remote ref: `origin/project/frontier`
- 製品branch: `feat/phase-g-guided-qa-canary-v1`
- 実装起点: `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`
- Authority Guard: ready PR #3 `docs: prevent stale-main development restarts`。baseはmain、未merge
- 重複Phase C PR #2: CLOSED / 未merge。unique commitを機械監査し、`.playwright-cli/` ignoreだけを正しい製品branchへ再実装。remote branchは保持
- PR #1: 未変更
- Phase G Guided QA: 18/18 automated PASS。JSON / HTML / screenshots / contact sheetを保存
- local gate: 31 test files / 187 tests、typecheck、production build、diff check PASS
- semantic audio: generated Web Audio cue 17種、caption、mute、resume、rate limit、audit readback
- CGAW Canary: exact source commit `c893374ab0edd7329bd1482dbd6b99960acbbb68`、GLB SHA-256 `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102`
- asset modes: `primitive` / `canary-v1`。unknown / invalid / load failureはstructured primitive fallback
- authority: `ExpeditionManifest`、gate evaluator、`ItemLocation`、MissionSession、Rapier、Security Cellを変更せず、Canaryはvisual consumerに限定
- rights: `NOASSERTION`、internal review only。配布・公開判断は行っていない
- Phase H: 未開始

現在の技術分類は `PHASE_G_AUTOMATED_ACCEPTANCE_GREEN` と `CANARY_CONSUMER_INTEGRATION_READY` です。音量・可読性・tempoの人間判断は `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING` として分離し、自動gateを巻き戻しません。

## 再現と証拠

```powershell
npm ci
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
git diff --check
npm run dev -- --host 127.0.0.1
```

QA URLは `http://127.0.0.1:5173/?qa=1&audio=muted&asset-mode=canary-v1&ps1=on&security-posture=routine` です。パネルの `Run all 18` 後、JSON / HTMLをダウンロードできます。音の確認だけは `audio=muted` を外します。

| 証拠 | 内容 | 判定に使う値 |
| --- | --- | --- |
| `artifacts/reconciliation/pr2-unique-diff-readback.json` | PR #2 unique commitの分類 | `DO_NOT_CHERRY_PICK`、ignoreのみ再実装 |
| `artifacts/canary-v1/import-readback.json` | exact CGAW source / hash / semantic contract | 5 assets、50 nodes、9 anchors、5 collision proxies |
| `output/playwright/phase-g-guided-qa/phase-g-guided-audit.json` | 18-step controller readback | 18 / 18 PASS |
| `artifacts/phase-g-guided-qa/browser-verification-readback.json` | drag、move、wheel、cart、audio、fallback、3 cycles | console/unhandled/external 0、resource増加なし |
| `output/playwright/phase-g-guided-qa/contact-sheet.png` | primitive/canary × PS1 off/on | Canary +8 calls / +96 tris、texture/program delta 0 |

## 残る人間判断

Canaryはgeometry / flat material / semantic anchorのinternal canaryで、production UV / texture / LOD / distribution rightsを主張しません。音ありdesktopでの役割識別、音量、tempo、watchful時の圧力は人間が任意に確認できますが、技術greenを阻害しません。Phase Hへ進む場合も、この判断を捏造せず、未評価のまま明記します。

## 2026-07-26以前の履歴

- 現行branch: `fix/phase-g-playability-recovery`
- 分岐元: `756e54b0e54a7b4b6fee7da2a0d5bed47f01a5a3`
- playability recovery実装基準: `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`、件名 `fix: restore playable movement camera and cart controls`
- Phase G実装commit: `6df8ba0621baf8976fc56373863cf57565cc12ba`
- Phase F保全tag: `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a`
- Phase G到達点: Security Cellの技術実装は維持。感覚受入はplayability baselineで中断され、未受入
- playability到達点: keyboard alias、Arrow左右、Gamepad API、wheel zoom、決定論的push-cart、F1診断、UI resource解放
- 2026-07-27再検証: 依存、型、28ファイル176テスト、build、diffをPASS。同一runtime基準のscene描画、固定60 Hz、console error 0を確認
- upstream: `origin/fix/phase-g-playability-recovery`。同期監査時HEAD `a3b5e73` と0 / 0で、remoteから取り込むcommitなし
- remote Phase G branch: `origin/feat/phase-g-security-cell` としてpush済み
- remote Phase F tag: `phase-f-world-persistence` としてpush済み
- 次の必須gate: `GATE_G_A_RETEST_REQUIRED`。Phase Gミュートなし人間受入を最初から再実施
- recovery branch、Phase G branch、Phase F tag: remote取得可能
- PR更新、main統合、deploy、release: 未実施
- Security Cellの距離、共有delay、scan、音、文言: 変更なし
- Phase H: 未開始
- portable境界: tracked source / lockfile / authority docs / remote refs。`node_modules`、`dist`、`.serena`、IndexedDB、実行中Viteは端末ローカル
- worktree: 2026-07-27同期監査開始時clean。ゲームコード、manifest、lockfile、untracked、review成果物の差分なし

監修役AIは最初に [`docs/supervising-ai-report.md`](docs/supervising-ai-report.md) の2026-07-27節を読み、playability technical PASSとPhase G human acceptance未実施を分離してください。2026-07-26以前の節は履歴証拠です。

## 2026-07-27 sync / restart audit

- `git fetch --prune --tags origin`: PASS
- branch / upstream: `fix/phase-g-playability-recovery` / `origin/fix/phase-g-playability-recovery`
- fetch時HEAD / upstream: `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90` / 同一
- ahead / behind: `0 / 0`。behind-onlyではなく取り込み対象0件だったためpullは実行していない
- fetch前state: staged 0、unstaged 0、untracked 0、進行中Git operation 0
- ignored / local-only: `node_modules`、build後の`dist`、`.serena`、browser IndexedDB、ユーザー起動中のVite process
- `npm ls --depth=0`: PASS
- `npm run typecheck`: PASS
- `npm test -- --run`: PASS、28 files / 176 tests
- `npm run build`: PASS、Vite 8.1.5 / 69 modules。既知のlarge chunk warningのみ
- `git diff --check`: PASS
- browser runtime: `http://localhost:5173/?qa=1&security-posture=watchful` でscene描画、固定60 Hz、console error 0。既知のRapier warningのみ

plain `npm run dev` はこのWindows端末では `[::1]:5173` にbindしました。その状態で `127.0.0.1` を開くと接続できず、黒画面または到達不能に見えます。再現時は `npm run dev -- --host 127.0.0.1` を使い、`http://127.0.0.1:5173/` を開いてください。plain起動済みなら `http://localhost:5173/` で同じsceneを確認できます。これは端末ローカルのlistener境界であり、Vite設定やゲームコードは変更していません。

## 2026-07-26 recoveryの再現

```powershell
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
git diff --check
npm run dev -- --host 127.0.0.1
```

QA URLは `http://127.0.0.1:5173/?qa=1&audio=muted` です。F1を開き、held codes、actions、raw/world movement、focus、modal、pointer lock、displacement、device、pads、camera、cartを確認します。実移動を先に確認し、積載・抽出の短縮だけ `QA CART→COIL` / `QA CART→EXTRACT` を使います。人間Gate G-Aでは `audio=muted` を外し、既存watchful手順を最初から実行してください。

物理Gamepadは未接続でした。mock testはPASSですが、物理controllerの操作感と完全menu navigationは未受入です。

## remote状態

| ref | remote値 | localとの関係 |
| --- | --- | --- |
| `origin/fix/phase-g-playability-recovery` | `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`（同期監査時） | 現branchと0 / 0。recoveryのremote基準 |
| `origin/main` | `c5ae3b9a168eb81c41886aab93699980be4c90df` | local `main` と0 / 0 |
| `origin/feat/phase-f-world-persistence` | `d25a9c04c277d5d4728904a11429f45413599a83` | 現branchが8commit先行、local Phase F branchが2commit先行 |
| `origin/feat/phase-g-security-cell` | `71ae93cd43d9b64614404448b97ebf4bf12fe40e` | 現branchが2commit先行 |
| remote `phase-f-world-persistence` tag | `1e98860597ac940ff8d47505a5b00736d852c43a` | local tagと同一 |

2026-07-25に再確認したdraft PR [#1](https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS/pull/1) はOPEN / DRAFT / mergeableで、Phase C〜Fを `main` へ向けています。headは `d25a9c0`、checksは0件で、Phase Gは含みません。

## 最短再開

```powershell
git status -sb
git rev-parse HEAD
git show-ref --verify refs/tags/phase-f-world-persistence
git fetch --prune --tags origin
git rev-list --left-right --count HEAD...origin/fix/phase-g-playability-recovery
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
git diff --check
npm run dev -- --host 127.0.0.1
```

期待値:

- branch: `fix/phase-g-playability-recovery`
- gameplay/runtime基準: `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`
- implementation ancestor: `6df8ba0621baf8976fc56373863cf57565cc12ba`
- divergence: 現branchと同名upstreamは0 / 0
- tests: 28 files / 176 tests
- build: initial 2,914.05 kB / gzip 1,022.12 kB
- Security Cell dynamic chunk: 44.38 kB / gzip 11.89 kB

QA URLは `http://127.0.0.1:5173/?qa=1&audio=muted` です。訪問限定構成は `&security-posture=routine` / `watchful` を使えます。音の人間評価では `audio=muted` を外します。npm操作は直列で実行します。

## 2026-07-25 historical live verification

- `git fetch --prune --tags origin`: PASS
- `git pull --ff-only --prune origin feat/phase-g-security-cell`: PASS、`Already up to date`
- 現branch vs remote Phase G: `0 / 0`
- local `main` vs `origin/main`: `0 / 0`
- local Phase F branch vs remote Phase F: `2 / 0`
- 現branch vs remote Phase F: `6 / 0`
- GitHub repository: public / default `main` / archived=false
- Node `v24.13.0`
- npm `11.6.2`
- `npm ls --depth=0`: PASS
- `npm run typecheck`: PASS
- `npm test -- --run`: PASS、26 files / 151 tests
- `npm run build`: PASS、69 modules
- `git diff --check`: PASS
- `http://127.0.0.1:5173/?qa=1&audio=muted`: HTTP 200
- HTML title / module entry: PASS
- smoke後server停止 / 5173番port解放: PASS

今回browser gameplayは再実施していません。V1→V2、routine→watchful、敵cell分業、presence、grace、`partial → complete → aborted`、resource / DOM復帰は、同じPhase G implementation commitを使用したREADMEの2026-07-23証跡を正本とします。`6df8ba0..HEAD` の3commitは引継ぎ文書だけで、ゲーム実装差分はありません。

## Phase Gの実装境界

- V2はV1全fieldと永続security summaryだけを保存する
- runtime位置、task、lock、cooldown、local/shared knowledgeを保存しない
- routineはneedle 1機、watchfulはneedle + watcherの固定2機
- 確認contactは帰還settlementだけで永続化する
- enemyは直接観測または敵linkで共有済みのfactだけを使う
- watcherはobserve / overwatch、needleは再視認後interdict / sabotage
- simultaneous lock / interdict / relay sabotageは各1、interference後graceは4秒
- cautiousは新規攻撃保留、outnumberedは全攻撃解除・共通退避
- `ItemLocation`、revision、settlement冪等性、dynamic import、disposeを維持する
- HP、死亡、射撃、無制限敵、偽通信、音声模倣を導入しない

## 残作業

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase G感覚評価 | watcher、chirp、圧力、退避を製品判断する | ミュートなしdesktop、5観点、accepted/tuning/blocking | 技術検証済み・人間待ち | human game design / UX | Gate G-Aを1回実施 |
| Phase H選定 | 次sliceを最大gapへ集中する | G-A結果、目的1文、受入、非対象、停止条件 | 未承認 | owner / supervising AI | 4候補から1案だけ承認 |
| recovery remote portability | 別端末で操作復旧済み基準を取得可能にする | 同名branch、upstream、fetch/readback | 実装branchはremote取得可能。handoff更新は本作業で同期 | current operator | docs commit後にnormal pushし0 / 0をreadback |
| draft PR #1 | Phase C〜Fをreview可能にする | human review、CI方針、merge / rollback | OPEN / DRAFT / mergeable | owner / reviewer | G-A後に維持・更新・分離を判断 |
| CI | local gateをPR上で再現する | typecheck/test/build workflow | 未設定 | repo owner | merge方針時に導入判断 |
| device performance | Vite warningの実影響を判断する | cold/warm/revisit、frame、memory実測 | warningのみ・非ブロッキング | performance | 問題端末で計測 |
| Rapier warning | 既知warningを安全に解消する | dependency/API互換、物理回帰 | 非ブロッキング | dependency maintenance | 更新専用sliceで扱う |
| rights / assets | 製品assetを合法・予算内で導入する | provenance、license、budget、collision proxy | primitive段階 | owner / art | major loop凍結後に審査 |
| deploy / release | 外部配布する | review、rights、quality、target、rollback承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIの開始順

1. 本文書、`docs/supervising-ai-report.md`、`docs/project-context.md`、README Phase G節を読む。
2. `fix/phase-g-playability-recovery` のclean state、HEAD、同名upstream、Phase F tag、remote divergenceを確認する。
3. 人間のGate G-Aメモを探す。
4. メモがなければ音量、scan、距離、delayを最終調整しない。
5. blockingならPhase Gだけを修正する。acceptedならPhase Hを1目的だけ仕様化する。
6. 追加push、PR、merge、deploy、releaseは個別の明示権限を確認する。今回のbranch/tag pushは完了済み。

未解決の設計質問は、「Phase Gの人間評価で観測された最大gapを、次の1スライスでどのプレイヤー判断へ変えるか」です。現時点の第一候補は、契約・証拠・再訪判断の因果深化です。
