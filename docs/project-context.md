# Project Context

更新日: 2026-11-21 JST

## North star

`LOWPASS: SALVAGE ATLAS` は、低忠実度3D表現の中で、隊員・装備・通信・非致死的機械生態系・継続世界を一貫した状態モデルとして扱うデスクトップブラウザ探索ゲームです。プレイヤーの判断と敵の判断を、各主体が実際に観測・共有できた情報から説明可能にし、帰還精算を通じて次の訪問へ残します。

Fieldは暗い放棄施設だけに限定しません。人が不在でも通常機能と日常建築が残るoffice、building、shopping mall、station、housing、library、hotel、medical center、parking / logistics、school / community campusを正規の探索範囲とします。都市scaleのvisual基準は `docs/concept-art/field-expansion-v1/`、現行浸水marketの局所studyは `docs/concept-art/visual-overhaul-v1/` です。

## Cockpit（2026-07-29正本）

| 項目 | 現在値 |
| --- | --- |
| 軸 | 状態所有、限定知識、プレイヤー判断の整合性 |
| 完了スライス | Phase G canonical reconciliation。`PHASE_G_CANONICAL_RECONCILIATION_GREEN` |
| canonical source | local `d2683ee` lineage adopted |
| preserved baseline | remote `f3ea109`、`GREEN_BUT_NOT_ACCEPTANCE_EQUIVALENT` |
| no-force merge | `65fb21f992d9b2d8f933c343f1b2ab766311bbe2`、両系統を祖先に持つ |
| accepted runtime / evidence tip | `c9c9cdc16268c60995cf82499dc59ca277d4f1ba` |
| canonical refs | live `origin/feat/phase-g-guided-qa-canary-v1` と `origin/project/frontier`。静的SHAよりfetch後readbackを優先 |
| automated acceptance | 34 files / 203 tests、build / external build、Guided Audit 22 / 22、audio 20 / 20、24 A/B、3 lifecycle PASS |
| 人間感覚レビュー | Phase Gのcueは `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING`。2026-11-21に本人が「操作周り・画面がチープ過ぎる」と指摘（[観測と原因](evidence/restart-2026-11-21-feel-visual/README.md)） |
| Canary consumer | `DECLARED` project-scoped rights、LOWPASS production利用承認、外部build同梱可 |
| 次の開発候補 | 「操作・画面品質」（案A操作感・B画面・C HUD）と、Phase H1「契約・証拠・再訪判断の因果深化」。順序は本人判断待ちで、AIの推奨は操作・画面品質が先。どちらも未実装 |
| 受入の正本 | `README.md`、`PROJECT_HANDOFF.md`、本文書、`docs/supervising-ai-report.md`、`docs/decision-log.md` |

local `d2683ee` とremote `f3ea109` の候補選定は完了しました。以降の2026-07-28 candidate比較は履歴であり、remote bounded repairや正本選定を再び停止条件にしません。Exact procedural Canaryのrights/production昇格は2026-08-04に完了しました。Phase H、main merge、deploy、releaseは未実施です。

## 2026-08-04 visual readability slice

- `docs/concept-art/visual-overhaul-v1/` を現行浸水marketへ適用し、浄水フィルター、冷却コイル、任意回収物のリレーコアを色とシルエットの両方で分離した
- 回収物がmission groundにある間だけ、必須目標は4 tick、任意目標は3 tickのgeometry-only markerを表示する。運搬・カート積載・抽出時はmarkerを消し、`ItemLocation`を唯一の所在表現として維持する
- 中央通路の低いamber chevronは抽出地点へ向ける。ブラウザ確認で逆向きを検出したため同一スライス内で修正した
- runtime screenshotでは必須フィルター3個、冷却コイル、カート、味方隊員、抽出ring、退避方向を初期market画角で判別できた。texture countは3のまま、Three.js objectは表示投影だけでgameplay、navigation、collision、Security Cellを変更しない
- concept画像と回収物markerは引き続きCanary以外のproduction asset approval、rights昇格、Phase H承認を意味しない

## 現行アーキテクチャ

- TypeScript / Vite / Three.js / Rapier / DOM UI。ゲームルールは `src/game/` が所有し、Three.js、Rapier、DOMを真実源にしない
- 固定60 Hzシミュレーション。Security Cellは知覚・存在量5 Hz、敵通信・共有3 Hz、task割当2 Hz、事実減衰2.5 Hzへ分離する
- 不変な `ExpeditionManifest`、訪問中の `MissionSession`、訪問間の `PersistedWorldStateV2`、敵セルruntimeを分離する
- `ItemLocation` を装備・資源・カート・Porter搬送・残置装備の唯一の所在表現にする
- `WorldDefinition` は作者定義世界、V2 snapshotはV1全フィールドと永続security summaryだけを安定IDで保存する
- V1→V2は明示migrationする。破損・未来schemaはfail-closed、正常migrationだけ同じIndexedDB world keyへ書き戻す
- `WorldDelta` は純粋適用し、settlementは `expectedRevision` とsettlement IDで競合・重複を防ぐ。確認接触も帰還時だけ永続化する
- `HostileMachineKnowledge` はlocal/pending、敵専用linkは共有到達性、blackboardはshared fact / assignment / reservation / pressure tokenを所有する
- needleは再視認後のinterdict / sabotage、watcherはobserve / overwatchに限定する。共有していない情報や古い共有位置だけで攻撃しない
- 表示、Rapier collider、味方A*、敵A*、通信は同じ保存・シミュレーション状態から順序付きで投影する
- ミッション、探索view、Security Cell、機械audioはdynamic importし、帰還時にRapier world、Three object、geometry、material、DOM購読を破棄する
- 入力はheld physical codeを真実源にし、logical actionを毎sample解決する。keyboardと標準Gamepad APIは同じaction境界へ統合する
- カート操作中はMissionSessionのcart-control stateとPhysicsWorldのcollision-limited kinematic pairを使う。ItemLocation、資源積載、抽出は従来の真実源を維持する
- ThirdPersonCameraはdesired distanceとocclusion後のeffective distanceを分離する
- Pointer Lockに依存しないcanvas右ドラッグはInputControllerがpointer stateを所有し、ThirdPersonCameraへyaw / pitch deltaだけを渡す。modal、Guided QA、editable controlでは入力しない
- Guided QAは既存controllerとQA配置を順序付ける診断adapterで、AI状態を直接PASSへ書き換えない。22段階readbackはruntime stateとrevisionから判定する
- semantic cueと字幕はstate eventの投影で、Security Cell判断を所有しない。常時Porter pulseは使わず、認証・搬送遷移などの意味eventだけをrate-limitして鳴らす
- `AssetPackRegistry` はprimitive / canary-v1を選択し、Canary GLBはmission chunkで遅延loadする。5 visual adapterはsimulation stateを真実源に保ち、失敗時はprimitiveへfallbackする

2026-07-26 playability recovery、2026-07-28 Phase G UX Closure、2026-07-27 snapshotは [`status-history.md`](status-history.md) へ原文のまま移した。

## フェーズ履歴

| Phase | 基準 | 成果 |
| --- | --- | --- |
| B | `c5ae3b9` / `phase-b-expedition-planning` | 船内、ゲート、遠征編成、28U制約 |
| C | `7d775d5` / `phase-c-fixed-expedition` | 固定探索、資源、カート、complete / partial精算 |
| D | `6a6cb6c` / `phase-d-squad-comms` | 分散スポーン、手書きA*、通信、分隊命令、知識 |
| E | `6473c65` / `phase-e-machine-ecology` | 敵対Scout Drone、干渉、relay妨害、友好Porter |
| F | `1e98860` / `phase-f-world-persistence` | revision付き帰還精算、再訪復元、契約、証拠、残置装備 |
| G | `6df8ba0` | V2 migration、routine/watchful、固定2機cell、個体/共有知識、敵link、task/pressure制御 |

`048299b` と `bf4eeb7` はPhase E途中の保全コミットです。履歴をsquash、rebase、force-pushして消さないでください。Phase G branchとPhase F tagはremote portabilityのためpush済みですが、main統合、PR更新、deploy、releaseは別の明示判断です。

## 保存・中断契約

- 保存するのは帰還操作で確定したworld settlementだけ。訪問中の機体位置、task、knowledge、lock、cooldown、未精算deltaは保存しない
- `complete` / `partial` / `aborted` は警戒deltaを精算できる。reload、クラッシュ、強制終了では基底revisionとpostureを維持する
- V2 security summaryはposture、確認接触訪問数、最終接触visit ID、観測戦術tagだけで、通常進行の上限はwatchful / 2機である
- 同じsettlementの再送はduplicate successで、visitCount、revision、接触回数、effectsを増やさない
- 残置装備は同じItemInstance IDを維持し、船内在庫との二重化を許さない
- 世界限定resetはV2初期routineへ戻すが、描画、音、操作設定を変更しない

## 現在の品質基準

現branchでトップレベル依存整合、型検査、全Vitest、production build、diff checkを通すこと。実ブラウザではGuided Audit 22 / 22、audio/caption、primitive / Canary、exact hash、A/B、3 lifecycle、console error 0、resource復帰を確認する。音量・音色・疲労感とphysical Gamepadは自動受入と混同しない。

## Re-entry snapshot

- 最初に `git fetch --prune --tags origin` を行い、live `origin/feat/phase-g-guided-qa-canary-v1` と `origin/project/frontier` のidentityを確認する。両refは本Phase G正本を含む同一commitであることが完了条件で、静的SHAよりlive refを優先する
- canonical ancestryはlocal `d2683ee` とremote `f3ea109` の双方。no-force mergeは `65fb21f`、accepted runtime / evidence tipは `c9c9cdc`
- preflightと競合解決は `artifacts/reconciliation/phase-g-canonical-v2/`、fresh browser evidenceは `docs/evidence/phase-g-closure/` にある
- latest local gateは34 files / 203 tests、typecheck、production build、external build、diff checkがPASS。2026-07-29のDドライブfresh `npm ci` は55 packages、0 vulnerabilities
- Guided Auditは22 / 22、semantic audioは20 / 20、Porter periodic pulse 0。各stepはexpected / actual / tick / duration / revision / result / failure reasonを持つ
- rightsは `DECLARED` / `internalOnly: false` / `distributionApproved: true` / `LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1`。registry / producer manifest / provenance不一致、欠落ではprimitiveへfallbackし、external outputはexact GLBとproject scopeを検証する
- A/Bは6状態 × 4条件 = 24 screenshots。固定seed / posture / camera / 1280×720のreadbackを持つ
- browserはconsole error、unhandled rejection、external request、event duplicationが各0。3 lifecycleのscene 60 / geometry 47 / texture 3 / program 4 / draw calls 66 / DOM 238 / HUD 41は一定
- portableなのはtracked source、tests、Canary copy、registry / manifest、artifacts、evidence、正本文書。`node_modules`、`dist`、`.serena`、IndexedDB、音量設定、Vite / Chrome processは端末ローカル
- human sensory reviewはdeferred / non-blocking。physical Gamepad、remote CI、PR review、main統合、deploy、releaseは未完了またはowner gate。Exact procedural Canaryのrights/production asset gateは完了
- Phase H1はtechnical unlockのみ。完全Promptのowner承認前に実装しない。V2 schema、static / persisted境界、WorldState / ItemLocation / settlement / Security knowledge authorityを維持する
