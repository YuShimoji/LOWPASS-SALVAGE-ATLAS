# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-07-28

## 現在地

- 現行branch: `feat/phase-g-guided-qa-canary-v1`
- fetch時HEAD: `d2683eeec43dc1befad406508f7d8b52f2a43a27`
- 作業base: `52f0cf9db9f563963243e4954e48de9c448ec487`
- upstream: 未設定。同名remote `origin/feat/phase-g-guided-qa-canary-v1` は存在するが、現在はlocal unique 2 / remote unique 3で分岐している。local 2件は実装 `d2683ee` と本文書commit
- playability recovery実装基準: `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`、件名 `fix: restore playable movement camera and cart controls`
- Phase G実装commit: `6df8ba0621baf8976fc56373863cf57565cc12ba`
- Phase F保全tag: `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a`
- Phase G到達点: `PHASE_G_AUTOMATED_ACCEPTANCE_GREEN`
- 感覚評価: `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING`
- Canary到達点: `LOWPASS_CANARY_CONSUMER_READY_INTERNAL_ONLY`
- playability到達点: keyboard alias、Arrow左右、Gamepad API、wheel zoom、右ドラッグcamera orbit、決定論的push-cart、F1診断、UI resource解放
- Guided QA: 意味・順序・before / expected / actualを表示するdrawer、raw操作の折り畳み、22 / 22のone-click audit
- semantic audio: 17種類の生成cue、AudioContext状態、単独試聴、rate-limit、mute、字幕fallback。音響の美的完成は未主張
- 人間確認済み: movement、wheel zoom、cart、Watcher / Needle外観はPASS
- remote Phase G branch: `origin/feat/phase-g-security-cell` としてpush済み
- remote Phase F tag: `phase-f-world-persistence` としてpush済み
- 次の共有開発gate: local `d2683ee` と同名remote `f3ea109` のどちらを正本または統合基準にするかをオーナーが決める。判断前にmerge / rebase / pushを行わない
- 次の開発候補: 分岐解消後のPhase H1「契約・証拠・再訪判断の因果深化」。未実装で、オーナー承認前には開始しない
- PR更新、main統合、deploy、release: 未実施
- 保護した契約: SecurityBlackboard、HostileMachineKnowledgeと共有知識、WorldState V2 / migration、settlement冪等性、ItemLocation、Presence基本重み、共有delay、scan距離、lock、pressure budget、contract進捗
- portable境界: tracked source、import済みCanary、consumer metadata、fixture、テスト、証拠、正本文書。`node_modules`、`dist`、`.serena`、IndexedDB、音量設定、実行中Viteは端末ローカル
- ブラウザQAでlocal IndexedDBのvisitは6まで進んだが、save dataと個人設定はcommit対象外
- CGAW供給元: `feat/lowpass-asset-canary-v1`、契約commit `c893374ab0edd7329bd1482dbd6b99960acbbb68`、GLB SHA-256 `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102`
- rights: `NOASSERTION` / internal only / distribution未承認。UV、texture、Blender headless、rights declaration、production asset approvalは未完了

監修役AIは最初に [`docs/supervising-ai-report.md`](docs/supervising-ai-report.md) の2026-07-28節と [`docs/evidence/phase-g-closure/`](docs/evidence/phase-g-closure/) を読んでください。2026-07-27以前のGate表記は履歴証拠で、現在の停止条件ではありません。

## 2026-07-28 remote sync / restart audit

| 項目 | ライブ確認値 | 判定 |
| --- | --- | --- |
| branch / HEAD | `feat/phase-g-guided-qa-canary-v1` / `d2683eeec43dc1befad406508f7d8b52f2a43a27` | 通常checkout、detachedではない |
| origin | `https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git` | `git fetch --prune origin` PASS |
| upstream | 未設定 | 自動追従先なし |
| same-name remote | `f3ea109` | fetch時local 1 / remote 3。本文書commit後の現在値はlocal 2 / remote 3 |
| merge base | `52f0cf9db9f563963243e4954e48de9c448ec487` | local / remote共通基点 |
| tree identity | local `f8632871` / remote `faf4d58f` | 不一致。fast-forward対象ではない |
| range comparison | local `d2683ee` に対しremote `42c8b8a`、`e1207b2`、merge `f3ea109` | Guided QA、Canary、音、証拠の別実装系統。自動統合しない |
| fetch前worktree | staged 0、unstaged 0、untracked 0、進行中Git operation 0 | clean |
| tracked review成果物 | `docs/evidence/phase-g-closure/` 34 files | 保持。生成物として削除しない |
| ignored / local-only | `.playwright-mcp/`、`.serena/`、`dist/`、`node_modules/`、IndexedDB、音量設定、Vite process | commit / remote証拠に含めない |
| minimal health | `npm ls --depth=0`、`npm run typecheck`、`git diff --check` | PASS |
| runtime listener | `127.0.0.1:5173` | 現在は接続拒否。Vite未起動という端末ローカル状態 |

behind-onlyでもfast-forward可能でもないため、pullは実施していません。reset、restore、stash、clean、rebase、merge、branch切替、upstream設定、pushも実施していません。local checkoutは依存整合と型検査が通り、既存の34 files / 199 tests、production build、ブラウザ証拠は `d2683ee` に束縛された既存証拠として利用できます。一方、remote unique 3 commitsはこのcheckoutで未実行・未受入であり、local greenやPhase G人間受入と混同しません。

共有開発の現在のbottleneckは、2系統の正本選定です。オーナーまたは監修役は `git range-diff 52f0cf9..d2683ee 52f0cf9..f3ea109` と両系統のcontract / evidenceを比較し、local採用、remote採用、または専用reconciliation sliceのいずれかを明示してください。その判断まではPhase H1、push、PR更新、merge、deploy、releaseへ進みません。

## 2026-07-28 Phase G Closure再現

```powershell
npm run dev -- --host 127.0.0.1
```

- Primitive: `http://127.0.0.1:5173/?qa=1&security-posture=watchful&asset-mode=primitive`
- Canary: `http://127.0.0.1:5173/?qa=1&security-posture=watchful&asset-mode=canary-v1`
- Guided QAを開き、`Run full guided audit` で22段階の結果とJSONを確認する
- Advanced / Raw Controlsで17 cueのAudio Test、asset pack、fallback reasonを確認する
- canvas右ドラッグでyaw / pitch、wheelでdistance、通常入力とcartを回帰確認する
- 証拠: [`docs/evidence/phase-g-closure/phase-g-guided-audit.json`](docs/evidence/phase-g-closure/phase-g-guided-audit.json)、[`phase-g-audio-audit.json`](docs/evidence/phase-g-closure/phase-g-audio-audit.json)、[`primitive-canary-contact-sheet.png`](docs/evidence/phase-g-closure/primitive-canary-contact-sheet.png)

Canaryはmission chunkとともに遅延ロードし、帰還時にscene、material、GLTF resourceを破棄します。実ブラウザの3回のship→mission→shipでは、帰還後のscene 60、geometry 47、texture 3、program 4が一定でした。console error 0、unhandled rejection 0、event duplicate 0です。既知のRapier初期化非推奨warningは残ります。physical Gamepadは接続していないため実機確認済みではありません。

最終local gateは `npm ls --depth=0`、typecheck、34 files / 199 tests、production build、diff checkがPASSです。buildは79 modules、MachineFeedbackAudio 3.33 kB、CanaryMissionAssetPack 46.72 kBの遅延chunkを出力し、既知の500 kB warningだけを残します。local greenはremote CI、human sensory PASS、rights承認、main統合、production、公開完了を意味しません。

## 2026-07-27 sync / restart audit（履歴）

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

## 2026-07-27以前のremote状態（履歴）

| ref | remote値 | localとの関係 |
| --- | --- | --- |
| `origin/fix/phase-g-playability-recovery` | `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`（同期監査時） | 現branchと0 / 0。recoveryのremote基準 |
| `origin/main` | `c5ae3b9a168eb81c41886aab93699980be4c90df` | local `main` と0 / 0 |
| `origin/feat/phase-f-world-persistence` | `d25a9c04c277d5d4728904a11429f45413599a83` | 現branchが8commit先行、local Phase F branchが2commit先行 |
| `origin/feat/phase-g-security-cell` | `71ae93cd43d9b64614404448b97ebf4bf12fe40e` | 現branchが2commit先行 |
| remote `phase-f-world-persistence` tag | `1e98860597ac940ff8d47505a5b00736d852c43a` | local tagと同一 |

2026-07-25に再確認したdraft PR [#1](https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS/pull/1) はOPEN / DRAFT / mergeableで、Phase C〜Fを `main` へ向けています。headは `d25a9c0`、checksは0件で、Phase Gは含みません。

## 2026-07-27 recoveryの最短再開（履歴）

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
| Phase G人間感覚レビュー | 音量・音色・疲労感と最終game feelを製品判断する | ミュートなしdesktop、観察メモ | deferred / non-blocking | human game design / UX | 問題が見つかった場合だけG-TUNE候補を起票 |
| 同名branch正本選定 | 2系統のPhase G Closureを破壊せず共有開発基準を1つにする | local / remote contract・証拠比較、採用方針、rollback方針 | 現在local 2 / remote 3で分岐。localの追加1件は本文書commit。自動同期不可 | owner / supervising AI | local採用、remote採用、専用reconciliationのいずれかを明示 |
| Phase H1選定 | 契約・証拠・再訪判断の因果を1つのsliceへ固定する | branch正本選定後、最終報告のPrompt、目的、受入、非対象、停止条件の承認 | 未実装・正本選定待ち | owner / supervising AI | branch判断後にPhase H1 Promptを明示承認 |
| draft PR #1 | Phase C〜Fをreview可能にする | human review、CI方針、merge / rollback | OPEN / DRAFT / mergeable | owner / reviewer | G-A後に維持・更新・分離を判断 |
| CI | local gateをPR上で再現する | typecheck/test/build workflow | 未設定 | repo owner | merge方針時に導入判断 |
| device performance | Vite warningの実影響を判断する | cold/warm/revisit、frame、memory実測 | warningのみ・非ブロッキング | performance | 問題端末で計測 |
| Rapier warning | 既知warningを安全に解消する | dependency/API互換、物理回帰 | 非ブロッキング | dependency maintenance | 更新専用sliceで扱う |
| rights / assets | Canaryを製品assetへ昇格できる条件を揃える | UV、low-resolution texture、Blender headless、rights declaration、production approval | internal-only / `NOASSERTION` | owner / art / tech art | CGAW側の制作・権利gateを別途承認 |
| deploy / release | 外部配布する | review、rights、quality、target、rollback承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIの開始順

1. 本文書、`docs/supervising-ai-report.md` の2026-07-28節、`docs/project-context.md`、READMEのPhase G UX Closure節を読む。
2. `feat/phase-g-guided-qa-canary-v1` のclean state、実装基準 `d2683ee`、upstream未設定、同名remote `f3ea109`、現在local 2 / remote 3の分岐を確認する。
3. 証拠indexとconsumer readbackから22段階監査、音響監査、exact hash、A/B、3 cycleを確認する。
4. Phase Gの人間感覚レビューは任意とし、観測事実なしにG-TUNEしない。
5. branch正本を選定するまではmerge / rebase / pushとPhase H1を保留する。選定後にPhase H1を開始する場合は、最終報告の完全Promptを1つの承認済みsliceとして使い、Phase G契約を変更しない。
6. push、PR、merge、tag、deploy、release、public visibilityはそれぞれ個別の明示権限を確認する。

直近の判断質問は、「local `d2683ee` とremote `f3ea109` のどちらを正本または統合基準にするか」です。その後の設計質問は、「帰還済みの契約・証拠を、WorldState migrationなしで次訪問のrouteまたはsupport選択へどう結び付けるか」です。Phase H1は未実装です。
