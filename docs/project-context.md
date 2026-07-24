# Project Context

更新日: 2026-07-25

## North star

`LOWPASS: SALVAGE ATLAS` は、低忠実度3D表現の中で、隊員・装備・通信・非致死的機械生態系・継続世界を一貫した状態モデルとして扱うデスクトップブラウザ探索ゲームです。プレイヤーの判断と敵の判断を、各主体が実際に観測・共有できた情報から説明可能にし、帰還精算を通じて次の訪問へ残します。

## Cockpit

| 項目 | 現在値 |
| --- | --- |
| 軸 | 状態所有、限定知識、プレイヤー判断の整合性 |
| レーン | 固定世界を反復訪問する非致死的探索垂直スライス |
| 完了スライス | Phase G: 協調する敵対機械Security Cell |
| 作業ブランチ | `feat/phase-g-security-cell` |
| Phase F保全 | tag `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` |
| Phase G分岐元 | `4e3cdc66d357e8054d45e0a42c4f41f166087b20` |
| Phase G実装 | `6df8ba0621baf8976fc56373863cf57565cc12ba`、件名 `feat: coordinate hostile machine security cells` |
| 現HEAD | `71ae93cd43d9b64614404448b97ebf4bf12fe40e`、`6df8ba0` 以後は引継ぎ文書だけ |
| remote状態 | Phase G branchとPhase F tagをpush済み。現branchはorigin/feat/phase-g-security-cellと0 / 0、mainは0 / 0 |
| 次のゲート | Phase Gミュートなし人間受入 → Phase H単一目的の承認 |
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

Phase G implementation `6df8ba0` で型検査、26ファイル151テスト、production build、トップレベル依存整合、diff checkを通すこと。2026-07-25にこれらと開発URLのHTTP 200、server停止 / port解放を再確認した。実ブラウザのV1→V2、routine→watchful、reload、2機上限、link断・復旧、役割分担、存在量5ケース、lock解除、grace、reset、3訪問後resource/DOM復帰は2026-07-23のREADME証跡を正本とする。感覚品質は自動PASSと混同せず、人間のミュートなし受入へ残す。

## Re-entry snapshot

- 2026-07-25に `git fetch --prune --tags origin` と `git pull --ff-only --prune origin feat/phase-g-security-cell` を実施し、`Already up to date` とremote側の未取込commit 0を確認した
- remote `main` はlocalと0 / 0、remote Phase Fは `d25a9c0`。現branchはremote Phase Fより6commit先、local Phase F branch自体は2commit先で、いずれもremote未取込ではなくPhase F後のdocs / Phase G履歴である
- remoteにPhase G branchとPhase F tagが存在し、現branchとのparityは0 / 0。別端末から取得可能
- Node `v24.13.0` / npm `11.6.2` で依存、型検査、151 tests、build、diff、HTTP smoke、server停止 / port解放を再確認した
- V1→V2 browser migrationと3visit resource計測は同じ `6df8ba0` の2026-07-23証跡を参照する
- 実ブラウザ後はworld reset済みのV2 routineを基準とし、保存fixtureやQA artifactをrepositoryへ残さない
- Vite大容量warningとRapier初期化warningは既知・非ブロッキング。警告隠しは行わない
- draft PR #1は2026-07-25時点でOPEN / DRAFT / mergeable、Phase C〜Fのみでchecksは0件
- Phase G branchとPhase F tagのpushは実施済み。PR更新、merge、deploy、releaseは未実施でオーナー所有
- worktreeは本再開引継ぎの4文書だけ変更・未commitで、ゲーム実装、manifest、lockfileに変更はない
- 最短コマンド、残作業のpurpose/effect/requirements/state/owner/nextはルート `PROJECT_HANDOFF.md` を参照する
