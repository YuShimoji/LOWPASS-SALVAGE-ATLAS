# Project Context

更新日: 2026-07-27

## North star

`LOWPASS: SALVAGE ATLAS` は、低忠実度3D表現の中で、隊員・装備・通信・非致死的機械生態系・継続世界を一貫した状態モデルとして扱うデスクトップブラウザ探索ゲームです。プレイヤーの判断と敵の判断を、各主体が実際に観測・共有できた情報から説明可能にし、帰還精算を通じて次の訪問へ残します。

## Cockpit

| 項目 | 現在値 |
| --- | --- |
| 軸 | 状態所有、限定知識、プレイヤー判断の整合性 |
| レーン | 固定世界を反復訪問する非致死的探索垂直スライス |
| 完了スライス | Phase G technical implementation。human sensory acceptanceは未完了 |
| 作業ブランチ | `fix/phase-g-playability-recovery` |
| Phase F保全 | tag `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` |
| Phase G分岐元 | `4e3cdc66d357e8054d45e0a42c4f41f166087b20` |
| Phase G実装 | `6df8ba0621baf8976fc56373863cf57565cc12ba`、件名 `feat: coordinate hostile machine security cells` |
| recovery分岐元 | `756e54b0e54a7b4b6fee7da2a0d5bed47f01a5a3` |
| recovery実装 | `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`、件名 `fix: restore playable movement camera and cart controls` |
| remote状態 | `origin/fix/phase-g-playability-recovery` と0 / 0。PR、merge、deploy、release未実施 |
| 次のゲート | `GATE_G_A_RETEST_REQUIRED`。Phase Gミュートなし人間受入を最初から再実施 |
| 受入の正本 | `README.md` のPhase G検証結果、`PROJECT_HANDOFF.md`、`docs/supervising-ai-report.md` |

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

## 2026-07-26 playability recovery

Gate G-Aは `GATE_G_A_BLOCKED_BY_PLAYABILITY_BASELINE` で中断されました。確認した構造的欠陥は、ArrowLeft / ArrowRightの欠落と、aliasをlogical action単位のSetで保持していたため片方のkeyupが残る物理キーのactionを解除し得ることです。実機報告時のW不反応そのものを旧buildで再捕捉できていないため、推測で単一原因へ断定せず、F1診断と物理key stateへの変更で観測可能性と正しさを同時に回復しました。

現在はWASD、矢印、alias混用、Shift、blur / visibility / modal / editable target clear、pointer lock拒否時のkeyboard移動、Gamepad標準mapping、wheel zoom、push-cart、積載・抽出、UI resource解放が自動・ブラウザ証拠を持ちます。Security Cellの状態所有、WorldState V2、migration、settlement、ItemLocation、敵知識、圧力予算と感覚調整値は変更していません。

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

Recovery branchで型検査、28ファイル176テスト、production build、トップレベル依存整合、diff checkを通すこと。実ブラウザでは単独・alias keyboard入力、zoom、push-cart、partial抽出、帰還、console error 0、Rapier / scene / GPU / DOM復帰を確認する。Security Cellの感覚品質はこのtechnical PASSと混同せず、人間のミュートなし受入へ残す。

## Re-entry snapshot

- 2026-07-27に `git fetch --prune --tags origin` を実施した。現branch `fix/phase-g-playability-recovery` のHEADとupstreamはともに `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`、ahead / behindは0 / 0で、取り込むremote commitがないためpullは不要だった
- fetch前のworktreeはcleanで、staged / unstaged / untrackedは0件、進行中のmerge / rebase / cherry-pick等もなかった。ゲーム実装、manifest、lockfile、保持中のreview成果物に差分はない
- 現branchは `origin/feat/phase-g-security-cell` より2commit先、`origin/main` より16commit先である。これは現在のrecovery履歴であり、main統合やPhase G受入を意味しない
- Node `v24.13.0` / npm `11.6.2` で `npm ls --depth=0`、型検査、28ファイル176テスト、production build、`git diff --check` を再確認した
- 同一HEADを既存Vite serverで `http://localhost:5173/?qa=1&security-posture=watchful` から開き、scene描画、固定60 Hz、console error 0を確認した。既知のRapier警告だけが残る
- Windows上のplain `npm run dev` は今回 `[::1]:5173` にbindし、`127.0.0.1` では接続できなかった。再現可能な正規コマンドは `npm run dev -- --host 127.0.0.1` とする。これは端末の名前解決・listener境界で、ゲーム描画障害ではない
- portableな状態はtracked source、lockfile、正本文書、remote branchである。`node_modules`、`dist`、`.serena`、IndexedDB、実行中Vite processはignoredまたは端末ローカルで、commit対象・remote証拠にしない
- V1→V2 browser migrationと3visit resource計測は同じ `6df8ba0` の2026-07-23証跡を参照する。物理GamepadとミュートなしGate G-Aは未検証のまま
- Vite大容量warningとRapier初期化warningは既知・非ブロッキング。警告隠しは行わない
- PR更新、main統合、deploy、release、rights判断は未実施でオーナー所有。現在のbottleneckは `GATE_G_A_RETEST_REQUIRED` だけで、次の具体手はコードを変えずミュートなし人間評価を最初から1回行うこと
- 最短コマンド、残作業のpurpose / effect / requirements / state / owner / nextはルート `PROJECT_HANDOFF.md` を参照する
