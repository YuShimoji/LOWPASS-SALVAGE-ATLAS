# 監修役AI向け現状報告

更新日: 2026-07-28 JST

## 2026-07-28 優先監修結論

この節が現在の正本です。2026-07-27以前のGate・recovery・Phase G証跡は履歴として下に残します。

現在の分類は次です。

- `PHASE_G_AUTOMATED_ACCEPTANCE_GREEN`
- `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING`
- `LOWPASS_CANARY_CONSUMER_READY_INTERNAL_ONLY`

人間レビュー済みのmovement、wheel zoom、cart、Watcher / Needle外観はPASSです。以前の `GATE_G_A_RETEST_REQUIRED` は、camera orbit、raw QA、意味イベント音の不足が判明する前の停止表現で、現在の必須停止条件ではありません。右ドラッグcamera、Guided QA、one-click 22段階監査、17 semantic cuesと字幕を追加し、Security Cellの状態所有、個体知識と共有知識、WorldState V2 / migration、settlement、ItemLocation、Presence基本重み、共有delay、scan距離、lock判定、pressure budget、contract進捗は変更していません。Phase Hは未実装です。

### 2026-07-28 remote同期監査

`git fetch --prune origin` 後、現行branch `feat/phase-g-guided-qa-canary-v1` の実装基準は `d2683eeec43dc1befad406508f7d8b52f2a43a27`、同名remoteは `f3ea109` です。upstreamは未設定で、共通基点 `52f0cf9db9f563963243e4954e48de9c448ec487` からfetch時local unique 1 / remote unique 3へ分岐していました。本文書commit後の現在値はlocal 2 / remote 3で、localの追加1件はdocs-onlyです。実装tree `f8632871` とremote tree `faf4d58f` も異なり、`range-diff` ではlocal `d2683ee` とremoteの `42c8b8a` / `e1207b2` に直接対応するpatchはありません。remote `f3ea109` はこの別系統をbaseへ整列したmerge commitです。

fetch前はstaged 0、unstaged 0、untracked 0、進行中Git operation 0でした。trackedのreview成果物 `docs/evidence/phase-g-closure/` 34 filesを保持し、ignoredの `.playwright-mcp/`、`.serena/`、`dist/`、`node_modules/` を変更していません。dirty差分、ユーザー差分、ゲームコード、manifest、lockfileはありませんでした。

behind-only / fast-forward条件を満たさないためpullは実行していません。reset、restore、stash、clean、rebase、merge、branch切替、upstream設定、pushも行っていません。`npm ls --depth=0`、`npm run typecheck`、`git diff --check` はPASSです。`127.0.0.1:5173` は接続拒否で、現在Vite processは起動していません。これは端末ローカルの実行状態で、既存のゲーム実装・ブラウザ証拠の失敗を意味しません。

local checkoutは開発・再現可能ですが、共有branchの正本は未決です。remote unique commitsはこのcheckoutで未実行・未受入です。次の具体手は、オーナーまたは監修役がlocal `d2683ee` とremote `f3ea109` のcontract / evidenceを比較し、local採用、remote採用、または専用reconciliation sliceを明示することです。この判断前にPhase H1、push、PR更新、mergeへ進めません。

### 自動・ブラウザ受入

| Gate | 結果 | 証拠 |
| --- | --- | --- |
| Camera | PASS | 右drag yaw / pitch、4px threshold、clamp、modal / QA / editable除外、Pointer Lock fallback、wheel / Gamepad回帰 |
| Guided QA | PASS | 360〜420px drawer、14px本文、40px主要操作、raw折り畳み、Esc、world input exclusion、明示的な孤立復帰文言 |
| Guided Audit | PASS | 22 / 22、timeout 0、duplicate 0、structured resultとrevision |
| Semantic Audio | PASS | 17 cue、non-silent、peak非clip、duration、distinct fingerprint、rate-limit、mute、context resume、字幕 |
| Browser console | PASS | error 0、unhandled rejection 0。既知のRapier初期化非推奨warning 1種類 |
| Canary contract | PASS | 5 assets、50 nodes、44 meshes、1,068 triangles、10 material objects、9 anchors、5 collision proxies |
| A/B evidence | PASS | 6状態 × primitive / Canary × PS1 OFF / ON = 24枚、contact sheetとreadback |
| lifecycle | PASS | 3回のship→mission→ship、帰還後scene 60 / geometry 47 / texture 3 / program 4で単調増加なし |
| dependencies / typecheck | PASS | 6 direct dependencies、TypeScript error 0 |
| Vitest | PASS | 34 files / 199 tests |
| production build | PASS | Vite 8.1.5、79 modules、MachineFeedbackAudio 3.33 kB、CanaryMissionAssetPack 46.72 kBの遅延chunk。既知の500 kB warningのみ |
| diff check | PASS | whitespace error 0 |

Guided Audit JSON / HTML、audio audit、QA panel、A/B screenshots、console、performanceは [`docs/evidence/phase-g-closure/`](evidence/phase-g-closure/) にあります。camera右dragはDOM PointerEventとcameraテストで固定しました。physical Gamepadは接続しておらず、実機確認済みとは報告しません。音量・音色・疲労感、最終game feelは人間感覚レビューへ残しますが、製品進行を止めるgateではありません。

### CGAW Canary consumer

- source branch: `feat/lowpass-asset-canary-v1`
- contract commit: `c893374ab0edd7329bd1482dbd6b99960acbbb68`
- source HEAD確認時: `ba689ff`。contract commitは祖先で、以後は文書差分のみ
- exact GLB SHA-256: `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102`
- import: manifest / hash / schema / stable node / material / anchor / collision proxy / boundsを検証し、絶対pathを除去して決定論的copyとregistry / readbackを生成
- runtime: `asset-mode=primitive` / `canary-v1`、既定primitive、mission chunk遅延load、5 visual adapters、primitive fallback、構造化warning
- authority: simulation stateが真実源。GLB node transformとcollision proxyをgameplay authorityへ使わない
- rights: `NOASSERTION`、`internalOnly: true`、`distributionApproved: false`、`INTERNAL REVIEW ONLY`
- source repo: clean確認済み、変更・commitなし

UV、low-resolution texture、Blender headless validation、rights declaration、production asset approvalは残っています。Canaryは内部review専用で、配布・公開・製品採用を意味しません。

### 変更管理

| contract | before | after | compatibility | migration / user impact | evidence |
| --- | --- | --- | --- | --- | --- |
| camera orbit | Pointer Lock mouse / Gamepad right stick | canvas右dragを同じyaw / pitchへ追加 | Pointer Lock、wheel、Gamepad、desired / effective distance、occlusion維持 | save migrationなし。初回hint追加 | InputController / ThirdPersonCamera tests |
| QA surface | 小さいraw button列、`QA WITHDRAW` | Guided drawer、意味・順序・before / expected / actual、raw折り畳み | `?qa=1`限定、既存controller再利用 | 通常プレイ影響なし | QA tests、panel screenshot |
| Phase G audit | 手動の段階再現 | 一操作22段階structured audit | AI stateを直接PASSへ変更しない | save schema変更なし | guided audit JSON / HTML |
| machine audio | 連続機械音と一部状態音 | 17 semantic event cue + caption | 既存mute尊重、外部音源なし | 設定migrationなし | audio audit |
| asset selection | primitiveのみ | registryでprimitive / canary-v1、失敗時fallback | 既定primitive、simulation authority維持 | save migrationなし、query選択だけ | consumer readback、runtime tests |
| runtime visuals | primitive projection | 5 Canary visual adapters | gameplay state / ItemLocation / collision authority維持 | internal-only visual差 | A/B 24枚、3 lifecycle |

### 開発可能性と次の一手

現行branchは `feat/phase-g-guided-qa-canary-v1`、実装基準は `d2683eeec43dc1befad406508f7d8b52f2a43a27`、作業baseは `52f0cf9db9f563963243e4954e48de9c448ec487`、upstreamは未設定です。本文書commitを含む現在のbranchは同名remote `f3ea109` とlocal 2 / remote 3で分岐しているため、正本選定前にpull、merge、rebase、push、PR、tag、deploy、release、public visibility変更を行いません。

portableな状態はtracked source、import済みCanary、consumer metadata / fixture、テスト、証拠、正本文書です。`node_modules`、`dist`、`.serena`、ブラウザIndexedDB、音量設定、実行中Viteは端末ローカルです。ブラウザQAでlocal visitは6まで進みましたが、save dataをcommitしません。

次の具体手は、まずオーナーがlocal / remoteのPhase G Closure正本を選定することです。その後、Phase H1「契約・証拠・再訪判断の因果深化」の完全Promptを承認します。目的は、既存のstatic definition / persisted state境界を保ち、帰還済みevidenceから次訪問のrouteまたはsupport差を説明可能にすることです。WorldState migrationを避ける設計を優先し、両方の承認前には実装しません。

## 2026-07-27 優先監修結論（履歴）

この節は2026-07-27時点の正本でした。2026-07-26以前のrecovery・Phase G証跡は履歴として下に残します。

Gate G-AはPASS、G-TUNE、FAILのどれにも分類していません。playability recoveryの技術基準は `fix/phase-g-playability-recovery` の `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90` で、同名upstreamへ取得可能です。2026-07-27のfetch時にlocal HEADと `origin/fix/phase-g-playability-recovery` は0 / 0、remoteから取り込むcommitはありませんでした。recovery branchのremote portabilityは成立していますが、PR更新、main統合、deploy、release、人間受入を意味しません。

playability recoveryは技術的にPASSです。次の状態は `GATE_G_A_RETEST_REQUIRED` です。ミュートなしの人間評価を最初からやり直すまで、Phase Gをacceptedと記録せず、距離、共有delay、scan、音、文言を変更せず、Phase Hを開始しないでください。

### 2026-07-27同期・開発可能性

| 項目 | ライブ確認値 | 判定 |
| --- | --- | --- |
| branch / upstream | `fix/phase-g-playability-recovery` / `origin/fix/phase-g-playability-recovery` | 一致 |
| fetch時HEAD / upstream | `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90` / 同一 | 0 / 0 |
| fetch | `git fetch --prune --tags origin` | PASS。取り込み対象0件、pull不要 |
| 事前worktree | staged 0、unstaged 0、untracked 0、進行中Git operation 0 | 安全 |
| game / manifest / lockfile | 差分0 | 保全 |
| `npm ls --depth=0` | direct dependencies整合 | PASS |
| `npm run typecheck` | TypeScript error 0 | PASS |
| `npm test -- --run` | 28 files / 176 tests | PASS |
| `npm run build` | Vite 8.1.5 / 69 modules | PASS。既知のlarge chunk warningのみ |
| `git diff --check` | whitespace error 0 | PASS |
| browser runtime | scene描画、fixed 60 Hz、console error 0 | PASS。既知のRapier warningのみ |

現branchは `origin/feat/phase-g-security-cell` より2commit、`origin/main` より16commit先です。この差はPhase G後の引継ぎとplayability recoveryであり、main統合済みという意味ではありません。remote CIはなく、physical Gamepad、ミュートなしGate G-A、rights、PR review、main integration、deployment、releaseは未検証または未承認です。

portableな成果はtracked source、lockfile、正本文書、remote branchです。`node_modules`、build後の`dist`、`.serena`、browser IndexedDB、実行中Vite processはignoredまたは端末ローカルで、remote再開証拠に含めません。ユーザー起動中のplain `npm run dev` は今回 `[::1]:5173` だけをlistenしていたため、`127.0.0.1` ではなく `http://localhost:5173/?qa=1&security-posture=watchful` で正常sceneを確認しました。再現可能な標準起動は `npm run dev -- --host 127.0.0.1` です。ゲームコードとVite設定は変更していません。

現在の唯一の製品判断bottleneckはGate G-Aです。次の具体手は、コードを変更せず、desktop・音あり・watchfulでwatcher識別、共有chirp、孤立圧力、援軍によるlock解除、cautious / outnumbered / disengageを人間が1回評価し、`PASS` / `G-TUNE` / `FAIL` のどれかを返すことです。

## 2026-07-26 playability recovery証跡（履歴）

Gate G-Aは感覚評価中の実機報告により `GATE_G_A_BLOCKED_BY_PLAYABILITY_BASELINE` で停止し、`756e54b0e54a7b4b6fee7da2a0d5bed47f01a5a3` からlocal branch `fix/phase-g-playability-recovery` を作成しました。この時点ではPhase H、Security Cell tuning、push、PR、merge、deployを実施していませんでした。

playability recoveryは技術的にPASSです。次の状態を `GATE_G_A_RETEST_REQUIRED` としました。

### 原因と修正

- 旧入力はheld stateをlogical `InputAction`のSetで保持していたため、WとArrowUpのようなaliasを同時保持した後、片方のkeyupでforward全体を解除できました。ArrowLeft / ArrowRightもmappingから欠落していました。
- 実機報告時のW単独不反応を旧buildで完全再捕捉できていないため、原因をaliasだけへ断定していません。held physical codes、resolved actions、raw/world movement、focus、modal、pointer lock、actual displacement、active device、connected padsをF1へ追加し、再発時に観測可能にしました。
- 入力はphysical codeを保持し、毎sample時にlogical actionへ解決します。blur、visibility、modal、control switch、editable targetの境界でclearします。
- 標準Gamepad APIをdeadzone 0.18、正規化stick、D-pad、A/B/L3/Start/LB/RBで統合しました。物理Gamepadは0台だったため、実機確認ではなくmock testのPASSです。完全なDOM menu navigationは未実装です。
- カメラはdesired distance 2.3〜6.5 mをwheelとLB / RBで変更し、occlusionによるeffective distanceと分離しました。
- カートは前方追従を廃止し、handle後方のoperatorとcartを固定60 Hzで解くcollision-limited kinematic pairへ変更しました。前進、低速後退、旋回、有界加減速、E/B解放、干渉時解放を提供します。
- 帰還時は非表示の遠征・結果・分隊UIをclearし、イベント参照とDOMを船内基準へ戻します。

### 自動検証

| Gate | 結果 | 実測 |
| --- | --- | --- |
| `npm ls --depth=0` | PASS | 既存6 direct dependencies、manifest / lockfile変更なし |
| `npm run typecheck` | PASS | TypeScript error 0 |
| `npm test -- --run` | PASS | 28ファイル176テスト |
| `npm run build` | PASS | Vite production build。既知の500 kB warningのみ |
| `git diff --check` | PASS | whitespace error 0 |
| protected system diff | PASS | Security Cell、threat、machine audio、manifest、lockfile変更なし |

### 実ブラウザ検証

`http://127.0.0.1:5173/?qa=1&audio=muted` で確認しました。

- W単独5秒で0.909 m移動。短い同一pulse条件でW 0.161 m、A 0.212 m、S 0.373 m、D 0.161 m、ArrowUp 0.161 m、ArrowLeft 1.284 m、ArrowDown 0.424 m、ArrowRight 0.324 mを観測
- W+D斜行0.702 m、walk pulse 0.212 m、Shift+W 0.597 m
- W+ArrowUpの同時forwardを実ブラウザで観測。片方keyup後の継続は自動テストで全alias群を固定
- Pause / expedition modal中はWとwheelがworldへ入らず、close後にWが復帰。pointer lockがFREEでもkeyboard移動
- wheelはdesired 4.10→2.30→6.30 m。modal中は6.30 mを保持。cart中も4.10→2.90 m
- 船内遮蔽でOCC YES、探索中OCC NOを観測し、desired distanceは遮蔽で変化しない
- 実入力でcart attach、forward、reverse、left/right turn、releaseを確認。逆方向はforwardより低速で、横滑りではなくyawが変化
- 重量超過拒否→`QA CART→COIL`で積載位置だけstage→Eで冷却コイル積載→`QA CART→EXTRACT`で抽出位置だけstage→PARTIAL→船内帰還。QA stageは実移動試験の代替にしていない
- console error 0、unhandled rejection 0。各E操作の結果とresult modalは1回だけ発火
- 帰還後: Rapier collider 12、scene object 60、GPU geometry 47 / texture 3 / program 4、DOM 122、HUD 69、modal 0、FX 0

ブラウザQA中のlocal IndexedDB world visitは3まで進みました。Gitにはsave、生成物、秘密情報を含めません。これは人間Gate G-Aの受入結果ではありません。

### 変更管理

| contract | before | after | compatibility | migration / user impact |
| --- | --- | --- | --- | --- |
| keyboard held state | logical action単位Set | physical code保持→sample時action解決 | public key mappingを拡張 | save migrationなし。alias keyupのstuck/解除競合を解消 |
| Gamepad input | 未実装 | 標準APIを既存actionへ統合 | keyboard経路を維持 | dependency追加なし。実機感覚は未評価 |
| camera distance | 固定値とocclusion結果 | desired / effectiveを分離、wheel / LB / RB | 既存camera lookとocclusion維持 | saveしない。world / control switchで不要resetなし |
| cart movement | player前方を割合追従 | handle後方operator + kinematic pair | ItemLocation / load / extraction維持 | 操作文言を「押す / 離す」へ統一 |
| UI lifecycle | hidden DOMが内容とlistenerを保持 | hide時に子DOMを解放 | visible時に毎回再構築 | 帰還後resource counterを基準へ復帰 |
| QA staging | player teleportのみ | cart-to-coil / cart-to-extractを追加 | `?qa=1`限定 | actual movementの検証後だけ使用 |

### 残る人間判断

ミュートなしdesktopでGate G-Aを最初から実施し、結果をPASS / G-TUNE / FAILのいずれかで返してください。物理Gamepadが利用できる場合は、左stick、右stick、A/B/L3/Start/LB/RBの操作感も別記してください。結果前に距離、共有delay、scan、音、文言を変更せず、Phase Hを開始しません。

## 2026-07-25同期結論（履歴）

`LOWPASS: SALVAGE ATLAS` は、remoteにもpush済みの `feat/phase-g-security-cell` の現HEAD `71ae93cd43d9b64614404448b97ebf4bf12fe40e` から開発再開可能です。Phase G実装基準は祖先commit `6df8ba0621baf8976fc56373863cf57565cc12ba` です。2026-07-25に `git fetch --prune --tags origin` と `git pull --ff-only --prune origin feat/phase-g-security-cell` を実施し、pull結果が `Already up to date`、現branchとupstreamが0 / 0であることを確認しました。その後、依存整合、型検査、26ファイル151テスト、production build、diff check、開発URLのHTTP 200、smoke用server停止までライブ再確認しました。

remoteにはPhase G branchとPhase F tagが存在します。現branchと `origin/feat/phase-g-security-cell` はremote unique 0 / local unique 0です。現branchは `origin/feat/phase-f-world-persistence` より6commit先、ローカルの `feat/phase-f-world-persistence` branch自体はremote Phase Fより2commit先です。この差はPhase F後の引継ぎ文書、Phase G実装、Phase G引継ぎ文書であり、remote側の未取込commitではありません。今回もmerge、rebase、branch切替、履歴書換えは不要でした。

技術的なrestart blockerはありません。ただし、Phase Gを製品としてacceptedとする前に、人間がミュートなしでwatcherの識別性、共有chirp、孤立時の圧力、援軍時のlock解除・退避を評価するGate G-Aが残っています。branch/tag pushは以前の明示依頼で実施済みですが、PR更新、main統合、deploy、releaseは実施していません。

## 2026-07-25にライブ確認した事実

### Git・remote

| 項目 | 2026-07-25確認値 | 判定 |
| --- | --- | --- |
| repository | `YuShimoji/LOWPASS-SALVAGE-ATLAS` | public / archived=false |
| origin | `https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git` | fetch成功 |
| default branch | `main` | GitHubとlocalで一致 |
| local branch | `feat/phase-g-security-cell` | 同期・gate開始時clean。現在は本報告を含むdocs 4件だけ変更 |
| current HEAD | `71ae93cd43d9b64614404448b97ebf4bf12fe40e` | remote Phase Gと同一 |
| Phase G implementation | `6df8ba0621baf8976fc56373863cf57565cc12ba` | 現branchの実装基準 |
| remote Phase G branch | `origin/feat/phase-g-security-cell` | localと0 / 0 |
| remote Phase F branch | `d25a9c04c277d5d4728904a11429f45413599a83` | remote最新 |
| local Phase F branch | `4e3cdc66d357e8054d45e0a42c4f41f166087b20` | remote Phase Fより2 / 0 |
| current Phase G vs remote Phase F | remote unique 0 / local unique 6 | Phase F後のdocs + Phase G、remote未取込なし |
| local `main` vs `origin/main` | 0 / 0 | parity PASS |
| remote Phase F tag | `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` | local tagと同一 |
| local Phase F tag | `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` | 保全済み |
| draft PR #1 | OPEN / DRAFT / mergeable | Phase C〜Fのみ、Phase G未反映 |
| PR #1 checks | 0件 | CI証跡なし |

GitHub上のremote branchは `main`、Phase C〜G、およびPhase E途中branchです。`git pull --ff-only` は `Already up to date` で、取り込むべきremote差分はありませんでした。Phase G branchとPhase F tagは以前の明示依頼でpush済みです。PR更新、main統合、deploy、release、rights、rollbackは別gateであり、同期完了から推論しません。

### 開発環境

| Gate | 結果 | 実測 |
| --- | --- | --- |
| Node | PASS | `v24.13.0` |
| npm | PASS | `11.6.2` |
| `npm ls --depth=0` | PASS | top-level 6依存整合 |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm test -- --run` | PASS | 26 files / 151 tests |
| `npm run build` | PASS | Vite 8.1.5 / 69 modules |
| `git diff --check` | PASS | whitespace error 0 |
| dev server | PASS | Vite ready / `127.0.0.1:5173` |
| QA URL HTTP | PASS | status 200 |
| HTML entry | PASS | title一致、module entryあり |
| server stop | PASS | smoke後に停止、5173番port解放 |

`node_modules` は再インストール不要と判断しました。`npm ls` と実gateがすべて正常で、package manifest / lockにremote差分もないためです。smoke前に5173番ポートが未使用であることを確認し、この作業で起動したViteだけを停止、停止後に同portが解放されたことも確認しました。

### production build

| chunk | minified | gzip |
| --- | ---: | ---: |
| initial `index` | 2,904.36 kB | 1,019.06 kB |
| `SecurityCellController` | 44.38 kB | 11.89 kB |
| `MachineFeedbackAudio` | 1.75 kB | 0.80 kB |
| `MissionSession` | 7.88 kB | 2.90 kB |
| `PorterAndroidController` | 9.18 kB | 3.25 kB |
| `floodedMarket` | 9.80 kB | 2.68 kB |
| `createFloodedMarket` | 9.81 kB | 3.54 kB |

Security Cell、機械audio、mission logic、固定map、探索viewのdynamic import境界は維持されています。Viteの500 kB warningは継続していますが、build errorではありません。warningを隠すための閾値変更はしていません。Rapier初期化warningはブラウザ実行時の既知dependency warningであり、今回HTTP smokeではブラウザruntimeを再操作していません。

## 現在の完成状態

### Phase Gで実装済み

- `PersistedWorldStateV2` とV1→V2明示migration
- 契約、Porter関係、traversal、残置relay、evidence、applied settlement ID、visitCount、revisionの維持
- 永続 `routine` / `watchful` と固定1機 / 2機上限
- needle `machine:security:needle-01` とwatcher `machine:security:watcher-01`
- 個体 `HostileMachineKnowledge`、pending broadcast、confidence / uncertainty / TTL
- player通信から独立した `HostileMachineLinkGraph`
- 遅延共有、link断中のlocal保持、再接続時TTL内flush
- `SecurityBlackboard`、決定論的task allocation、target / relay reservation
- 同時lock、interdiction、relay sabotage各1、干渉後4秒grace
- cautious時の新規攻撃保留、outnumbered時の全攻撃解除と共通退避
- opened traversalの敵A*反映と、render / Rapier / 味方A*との状態一致
- watcherの別silhouette、高高度、広角scan、共有chirp、初回mesh通知、F1診断
- `complete` / `partial` / `aborted` 帰還settlementでだけsecurity deltaを永続化
- world-only resetでV2 routineへ復帰

### 現在の主要不変条件

1. `ExpeditionManifest` は不変で、`MissionSession` を敵AI全責務へ肥大化させない。
2. `ItemLocation` はitem所在の唯一の真実源である。
3. Three.js UUID、Rapier handle、配列index、runtime task / knowledgeをsaveへ書かない。
4. 帰還settlementだけを永続化し、未精算visitを確定WorldStateへ混ぜない。
5. settlement revision / IDによる原子性と冪等性を維持する。
6. 敵は直接観測または敵linkで共有済みの情報だけを使い、古い共有位置だけではlockしない。
7. 通常敵数はroutine 1 / watchful 2を上限とする。
8. HP、死亡、射撃、Porter破壊、偽通信、音声模倣を追加しない。
9. render、physics、味方A*、敵A*、communicationは同じsimulation stateの投影である。
10. dynamic importと帰還時disposeを維持する。

## 既存のPhase Gブラウザ証跡

以下はPhase G実装commitを作成した2026-07-23の正本証跡です。今回の2026-07-25再開検証ではbrowser gameplayを再実施せず、現HEADが同じ実装commit `6df8ba0` の子孫で、以後の差分が引継ぎ文書だけであることと全自動gateを再確認しました。

- V1 fixtureからV2へ移行し、契約、Porter、opened traversal、relay、evidence、revisionを維持
- routineでneedle 1機、確認接触後の帰還でwatchfulへ移行
- reload後もwatchfulを維持し、needle + watcherの2機上限
- hostile link 0.782、遅延共有、link断中の非共有、復旧後のTTL内共有
- 視線喪失後1.6秒でshared fact confidence `0.964 → 0.820`、uncertainty `0.168 → 0.840`
- needleのrelay sabotageとwatcherのoverwatchを並行実行
- agent 1=`predatory`、agent 1+Porter / agent 2=`cautious`、agent 2+Porter / agent 3=`outnumbered`
- reinforcement到着でlockとpressure tokenを解除
- interference後4秒grace中の再lock禁止
- `partial → complete → aborted` の3visitでrevision / visit `1 → 2 → 3`
- world reset後にV2 routine / revision 0 / visit 0
- console error、page error、未処理例外0

3visit帰還後の通常reload値:

| 項目 | 値 |
| --- | ---: |
| Rapier bodies / colliders / contacts | 1 / 12 / 1 |
| Scene objects | 60 |
| WebGL calls / triangles | 60 / 1,416 |
| geometry / texture / program | 43 / 3 / 4 |
| DOM total / HUD / modal / transient / history | 119 / 67 / 0 / 0 / 0 |

詳細な手順と場面別結果はREADMEの「フェーズG Security Cellの検証結果 — 2026-07-23」を正本とします。

## 受入監査

| 区分 | 判定 |
| --- | --- |
| must-fix before development restart | なし |
| 今回verified | remote fetch、同名upstream parity、clean / Git operation、依存、型、176 tests、build、diff、browser scene / 60 Hz / console |
| 既存証跡を再利用 | V1→V2 browser migration、3visit、敵cell分業、presence、grace、resource復帰 |
| acceptable debt | Vite大chunk warning、Rapier既知warning、PR CI未設定、production device性能未計測 |
| human-owned | watcher識別、chirp、lock/interference音量、圧力tempo、退避の自然さ |
| owner-only | PR方針、merge、deploy、release、rights、rollback |

## 完成度の目安

これは工数予測ではなく、証拠gateの充足度です。

| 対象 | 目安 | 根拠 |
| --- | --- | --- |
| Phase G technical slice | `██████████ 100%` | 実装、176 tests、build、browser証跡、save migration、resource復帰 |
| Phase G product acceptance | `████████░░ 80%` | 技術gate済み、ミュートなし人間評価待ち |
| development restart readiness | `██████████ 100%` | recovery upstream未取込0、clean、依存・自動gate・browser runtime PASS |
| remote portability | `██████████ 100%` | recovery branch、Phase G branch、Phase F tagをremote取得可能。同名recovery upstreamと0 / 0 |
| major vertical loop | `███████░░░ 約70%` | 編成、探索、分隊、機械生態系、継続世界、敵協調が成立 |
| release readiness | `████░░░░░░ 約40%` | device matrix、accessibility、rights、CI/review、配布・rollback未完了 |

長期の百分率は予定消化率ではなく、現在の証拠から見たgate充足度です。Phase H以降は承認済み計画ではなく、前段の観察結果で再評価する条件付き提案です。

## 推奨する次の開発目標

### Gate G-A — Phase G人間受入

最優先です。ミュートなしdesktopで次を1回通し、各項目を `accepted` / `tuning` / `blocking` に分類します。

- routineとwatchfulでneedle / watcherを即時識別できるか
- 共有chirpが「敵同士の情報共有」として理解でき、音量が疲労を生まないか
- 孤立時のlock圧力に判断時間があり、理不尽な連続interferenceにならないか
- reinforcement / Porterでcautious、outnumberedへの変化を視覚・音・動きから理解できるか
- watcherのoverwatchとneedleのsabotageが役割分担として読めるか

blockingがあればPhase Hへ進まずPhase Gを修正します。tuningなら距離、delay、scan、chirp、UI文言だけを限定変更し、状態所有変更は別sliceへ送ります。

### Phase H候補 — 人間評価後に1つだけ選択

推奨順は次のとおりです。

| 候補 | 目的 | 強くなるもの | 主なtradeoff | 選ぶ条件 |
| --- | --- | --- | --- | --- |
| H1 契約・証拠の因果深化 | 1visitの選択が次visitの目的・経路・支援を変える | 継続世界と再訪判断 | content追加だけになりやすい | Phase Gがacceptedで、再訪動機が次の主要gap |
| H2 第2作者定義世界 | `WorldDefinition` とSecurity Cell再利用を実証する | content幅、抽象の実証 | contentと基盤変更が膨らむ | 固定world反復が主要な退屈要因 |
| H3 ミッション途中再開 | 長いvisitの中断負担を下げる | accessibility、生活適合 | runtime snapshotとsettlement混同 | 実測visit時間と中断負担が主要問題 |
| H4 実機hardening先行 | load、frame、input、audioの端末差を閉じる | production readiness | gameplay前進が止まる | 実機でcold startやframeがblocking |

現時点の第一提案はH1です。Phase Fの継続世界とPhase Gの敵警戒を、次visitの優先順位へ結び付けられるためです。ただしGate G-Aの観察が別の主要問題を示した場合は、その証拠を優先します。

## 条件付き長期ロードマップ

確度は3段階に分けます。Gate G-Aと必要時のG-Tuneは現在の必須近距離、Phase Hは受入後に1目的だけ承認する次距離、Phase I以降は依存条件が成立した場合だけ具体化する長距離です。後段を先に実装して前段の人間gateを迂回しません。

| 確度 | 段階 | 目標 | プレイヤー / 製品への効果 | 完了条件 | 依存・停止条件 | 主担当 |
| --- | --- | --- | --- | --- | --- | --- |
| 必須近距離 | Gate G-A | Phase G感覚受入 | 敵協調を理不尽さではなく読める判断へする | 5観点をaccepted / tuning / blocking分類 | blockingならG修正 | game design / UX |
| 必須近距離 | G-Tune | 観察根拠のある限定調整 | 識別、chirp、圧力、退避の感覚gapを閉じる | 値・音・表示だけ変更し全gate維持 | architecture変更は別slice | gameplay tuning |
| 次距離 | Phase H | 再訪判断の因果 | 選択が次visitの目的・経路・支援を変える | summary、save、次visit提示が同じ因果を示す | 1目的だけ、G-A accepted | design + world state |
| 条件付き長距離 | Phase I | 第2作者定義world | 固定世界反復に幅を与え、既存抽象を実証する | stable ID、safe anchor、contract、Security Cell、disposeを再利用 | Hの再訪動機accepted | content + projection |
| 条件付き長距離 | Phase J | 中断耐性 | 長いvisitを生活時間に合わせて安全に再開できる | temporary visit snapshotをsettlementと分離し、二重精算なくresume / discard | visit時間が実測問題 | save + lifecycle |
| 条件付き長距離 | Phase K | save compatibility hardening | 継続プレイ資産を更新・破損から守る | V2 fixture corpus、backup/export、破損診断、必要時のみV3 migration | 具体的V3 field必須 | persistence |
| 条件付き長距離 | Phase L | 制約付きvariation | 再訪に差異を作りつつ説明可能性を維持する | semantic ID、reachability、safe anchorを守るseeded variation | 2つ以上の作者worldで抽象実証 | generation + QA |
| 製品化距離 | Beta hardening | 実機品質 | 対象端末で安定して遊べる | cold/warm/revisit、frame、keyboard、pointer lock、audio、save recoveryに数値budget | major loop凍結 | performance / accessibility / QA |
| 製品化距離 | Content / asset pass | 製品表現 | primitive表現を権利確認済みの一貫した体験へ上げる | provenance、license、GLB/glTF budget、collision proxy、audio mixを承認 | rights不明なら導入しない | art / tech art / owner |
| 配布距離 | Release candidate | 配布候補 | review可能で巻き戻せる候補を作る | CI、human review、save互換、known issues、rollback、rights承認 | push/PR/merge別承認 | owner / reviewer / QA |
| 配布距離 | Launch gate | 外部配布判断 | 対象と責任範囲を明確にして公開する | 配布先、version、privacy、support、rollbackを明示承認 | 技術PASSから自動承認しない | owner only |
| 運用距離 | Post-launch stabilization | 初回運用の安定化 | crash / save破損を早期検出し、既存プレイヤー資産を守る | triage SLA、fixture、release note、rollback基準、hotfix手順 | 公開された場合だけ | owner / maintenance |
| 運用距離 | Evidence-led expansion | 次のcontent / system拡張判断 | 実際の遊ばれ方に基づき次の価値を選ぶ | human observation、support傾向、performance値から目的を1つ選定 | telemetry導入はprivacy承認がある場合だけ | owner / design / research |

### 停止条件

- 1 Phaseでworld settlement、ItemLocation、communication、navigationの2つ以上を同時再設計し始めたら分割する
- 人間評価の最大問題とPhase目的が一致しなければ着手しない
- enemyが未共有player stateを読む、watchful 2機を超える、HP・射撃へ軸を変える場合は停止する
- schema変更に具体的保存fieldとfixtureがなければV2を維持する
- procedural variationがstable ID、reachability、safe anchorを保証できなければ作者定義worldへ戻す
- Vite warningだけで性能作業を始めず、cold / warm / revisitの実機値を先に測る
- technical PASSをrights、public release、production approvalとして扱わない

## 残作業台帳

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase G人間感覚レビュー | 音量・音色・疲労感、最終game feelを製品判断できる | ミュートなしdesktop、観察メモ | deferred / non-blocking | human game design / UX | 問題が観測された場合だけG-TUNE候補を作る |
| 同名branch正本選定 | 2系統のPhase G Closureを破壊せず共有開発基準を1つにする | local / remote contract・証拠比較、採用方針、rollback方針 | 現在local 2 / remote 3で分岐。localの追加1件は本文書commit。自動同期不可 | owner / supervising AI | local採用、remote採用、専用reconciliationのいずれかを明示 |
| Phase H1選定 | 契約・証拠・再訪判断の因果へ次sliceを限定する | branch正本選定後、完全Prompt、目的、受入、非対象、停止条件の承認 | 未実装・正本選定待ち | owner / supervising AI | branch判断後にPhase H1 Promptを明示承認 |
| draft PR #1 | Phase C〜Fをreview可能にする | human review、CI方針、merge/rollback | OPEN / DRAFT / mergeable | owner / reviewer | G-A後にPR維持・更新・分離を判断 |
| CI | local gateをPRで再現する | typecheck/test/build workflow | 未設定 | repo owner | merge方針決定時に導入判断 |
| device performance | chunk warningの実影響を判断する | cold/warm/revisit、frame、memoryの実機値 | 未計測・非ブロッキング | performance | 問題端末で計測 |
| Rapier warning | 既知warningを安全に解消する | dependency/API互換と物理回帰 | 非ブロッキング | dependency maintenance | 更新専用sliceで扱う |
| rights / assets | 製品assetを合法・予算内で導入する | provenance、license、budget、collision proxy | primitive段階 | owner / art | gameplay loop凍結後に審査 |
| deploy / release | 外部配布する | review、rights、quality、target、rollbackの明示承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIが最初に行うこと

1. `PROJECT_HANDOFF.md`、本文書の2026-07-28節、`docs/project-context.md`、READMEのPhase G UX Closure節を読む。
2. `feat/phase-g-guided-qa-canary-v1`、実装基準 `d2683ee`、同名remote `f3ea109`、現在local 2 / remote 3、clean worktree、upstream未設定を確認する。
3. evidence index、guided / audio / consumer readback、A/B contact sheet、3 lifecycleを確認する。
4. Phase G人間感覚レビューは任意とし、観測事実なしにG-TUNEしない。
5. branch正本を選定するまではmerge / rebase / pushとPhase H1を保留する。選定後、最終報告の完全Promptをオーナーが明示承認した場合だけ1目的を実装する。
6. push、PR、merge、tag、deploy、release、public visibilityはそれぞれ明示権限を確認する。

## 監修役AIへの判断依頼

現時点の即時判断は、local `d2683ee` とremote `f3ea109` のどちらを正本または統合基準にするかです。これを選定した後の次開発判断は次です。

**帰還済みの契約・証拠を、WorldState migrationなしで次訪問のrouteまたはsupport差へどう結び付け、プレイヤーが因果を説明できるようにするか。**

Phase H1は「契約・証拠・再訪判断の因果深化」に限定して提案します。この提案に実装、push、PR更新、merge、deploy、releaseの許可は含みません。
