# 監修役AI向け現状報告

更新日時: 2026-07-22 21:57 JST

## 監修結論

`feat/phase-f-world-persistence` は、リモート同期、依存整合、型検査、全自動テスト、production build、開発サーバーHTTP smokeの範囲で開発再開可能です。Phase F「訪問間世界永続化」の実装基準は `1e98860597ac940ff8d47505a5b00736d852c43a`、今回リモートから同期した文書込みの基準は `d25a9c04c277d5d4728904a11429f45413599a83` です。

ただし、これは `main` への統合、公開リリース、Phase G着手の承認ではありません。次の必須ゲートは、ミュートなしの3訪問を人間が評価し、その観察結果を受けてPhase Gの目的を1つだけ選ぶことです。

現時点の推奨Phase Gは「契約・証拠・再訪判断の因果を深める単一スライス」です。既存の通信、物流、継続世界を利用しながら、次の訪問を考える理由を強くでき、複数敵・途中再開・生成世界より状態境界を増やしにくいためです。この推奨は未承認であり、人間評価が別の主要問題を示した場合は条件分岐に従って再選定します。

## 権限と正本

- プロジェクトの現在地: `docs/project-context.md`
- 確定済み設計判断: `docs/decision-log.md`
- 未採用候補とPhase G比較材料: `docs/idea-ledger.md`
- 実装仕様とフェーズ別検証証跡: `README.md`
- 別端末・別AI向け再開手順: `PROJECT_HANDOFF.md`
- 本文書: 監修判断用の時点報告と条件付きロードマップ。確定仕様ではない

`README.md` に残る2026-07-21のブラウザ証跡はPhase F実装時の受入証跡です。今回の2026-07-22再開検証は自動ゲートとHTTP smokeまでであり、3訪問の手動ブラウザ操作や音の主観評価を再実施したものではありません。

## Git・リモート状態

| 項目 | 2026-07-22確認値 | 判定 |
| --- | --- | --- |
| origin | `https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git` | 取得可能 |
| 作業ブランチ | `feat/phase-f-world-persistence` | 正本再開ブランチ |
| 同期基準 | `d25a9c04c277d5d4728904a11429f45413599a83` | `origin/feat/phase-f-world-persistence` と同期 |
| 同期直後のfeature branch parity | ahead 0 / behind 0 | PASS |
| `main` parity | ahead 0 / behind 0 | PASS |
| `origin/main` | `c5ae3b9a168eb81c41886aab93699980be4c90df` | Phase B統合基準のまま |
| draft PR | [#1](https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS/pull/1), OPEN / DRAFT / MERGEABLE | 人間レビュー待ち |
| PR checks | status check 0件 | CI証跡なし。ローカル検証で代替した状態 |

実行した同期操作は `git fetch --prune --tags origin` と `git pull --ff-only origin feat/phase-f-world-persistence` です。結果は `Already up to date` で、rebase、force-push、履歴書換え、`main` の暗黙統合は行っていません。上表の0 / 0は監修文書を作る直前の同期値であり、この文書のローカルcommitはoriginへpushしません。

Phase C〜Fは `main` より8コミット先の直列履歴です。ローカル専用の `.serena/`、`node_modules/`、`dist/` は無視状態のまま保持し、削除・追跡・共有していません。

## 今回の再開検証

| 検証 | 結果 | 実測・注記 |
| --- | --- | --- |
| Node / npm | PASS | Node `v24.13.0`、npm `11.6.2` |
| 重複package process | PASS | 対象checkoutに紐づくNode/npm processなし |
| `npm ls --depth=0` | PASS | top-level 6依存が整合 |
| `npm run typecheck` | PASS | TypeScript `tsc --noEmit` |
| `npm test` | PASS | 24ファイル / 122テスト |
| `npm run build` | PASS | Vite 8.1.5、63 modules transformed |
| `git diff --check` | PASS | 同期基準のソース差分に空白エラーなし |
| 開発URL | PASS | `http://127.0.0.1:5173/?qa=1&audio=muted` がHTTP 200 |
| HTML entry | PASS | title `LOWPASS: SALVAGE ATLAS`、module entrypointあり |
| サーバー停止 | PASS | smoke後に停止、port 5173 listenerなし |

production buildはPhase F既知値と同じ初期チャンク2,900.15 kB（gzip 1,017.94 kB）を生成しました。500 kB超のVite warningは継続していますが、build失敗ではありません。警告を隠すための閾値変更や、警告だけを理由にしたThree.js / Rapier分割は行っていません。

## 受入監査

| 区分 | 判定 |
| --- | --- |
| must-fix before restart-ready | なし。同期、依存、自動ゲート、HTTP entrypoint、停止状態を確認済み |
| acceptable debt | Vite大容量warning、Rapier既知warning、PR CI未設定、今回の3訪問ブラウザ再実施なし |
| docs debt | 既知なし。READMEの再開手順をlockfile基準の`npm ci`へ統一し、監修報告への導線を追加 |
| next-slice seeds | 契約・証拠の因果深化、条件付きの複数敵協調、途中再開、第2作者定義世界、計測後のbundle分割 |

人間の感覚評価とPhase G選定は、開発環境のrestart-readyを否定する不具合ではありません。ただし次スライス着手を止める製品判断ゲートです。

## 現在できていること

- 船内編成、28U制約、不変な `ExpeditionManifest`、予約済み装備を使って固定探索へ遷移できる
- 分散スポーン、手書きnavigation、局所知識、通信グラフ、分隊命令を固定周波数で処理できる
- 敵対Scout Droneが非致死的なlock-on、通信干渉、資源落下、relay妨害を行う
- 友好Porterを認証し、端末条件付きの搬送支援と訪問間の関係復元を行える
- `ItemLocation` を装備・資源・カート・Porter搬送・世界残置の唯一の所在表現として維持できる
- `complete` / `partial` / `aborted` の帰還時だけ `WorldDelta` をrevision付きsettlementとして確定できる
- 破損・未知・未来schemaをsafe modeへ送り、正常値として推測上書きしない
- 扉、chain、navigation、collider、Porter、契約、証拠、残置relayを安定IDから再訪復元できる
- 帰還時に探索固有のThree.js、Rapier、DOM購読を破棄し、再訪時の増殖を防げる

## 検証済み・未検証・人間所有の分離

### 今回確認済み

- リモート取得と現ブランチのfast-forward安全性
- branch / mainのtracking parity
- 依存整合、型検査、122テスト、production build
- 開発サーバー起動とQA URLのHTTP entrypoint
- draft PR #1がOPEN / DRAFT / MERGEABLEであること

### 既存証跡を参照し、今回再実施していないもの

- 3訪問でのpartial累積、reload復元、第1・第2契約完了
- Porter友好状態、開放経路、証拠一回通知、残置relay回収
- Rapier 1 / 12 / 1、Scene 60、DOM 117などの3訪問後リソース復帰
- ブラウザconsole error 0、未処理例外0

これらは `README.md` の「フェーズF 訪問間世界永続化の検証結果 — 2026-07-21」を正本とします。

### 未完了・人間所有

- 復元要約の情報密度、契約テンポ、脅威圧、視認性、搬送速度、音量と音の識別性
- Phase G単一目的の最終選定
- draft PR #1のレビュー、Ready化、merge
- 公開リリース、deployment、配布条件、制作アセット導入判断

## 主要な設計不変条件

次スライスは少なくとも以下を壊してはいけません。

1. ゲームルールは `src/game/` が所有し、Three.js / Rapier / DOMを真実源にしない。
2. `ExpeditionManifest` は不変、`MissionSession` は訪問中の可変状態として分離する。
3. `ItemLocation` を同一ItemInstanceの所在の唯一の表現にする。
4. 永続化は帰還settlementだけ。未精算訪問を確定world stateに混ぜない。
5. `WorldDefinition` と `PersistedWorldStateV1` を分離し、runtime IDを保存しない。
6. `WorldDelta` の適用を純粋・原子的・冪等に保ち、revision競合をfail-closedにする。
7. 表示、collider、navigation、communicationは同じゲーム状態から投影する。
8. ミッション境界でdynamic importと明示disposeを維持する。
9. 非致死的な情報・物流妨害という軸を、HP・死亡・銃撃へすり替えない。
10. 1 Phaseに複数の大機構を同時投入しない。

## Phase G選定提案

### 推奨: 契約・証拠・再訪判断の因果を深める

目的は「帰還時の選択が、次の訪問で何を優先するかを明確に変える」ことです。単純に契約数を増やすのではなく、同じ固定世界で少なくとも1つの相互排他的または順序依存の選択を作り、船内要約と次訪問の状態変化を因果で読めるようにします。

想定効果:

- Phase Fで作った継続世界が、技術デモではなくプレイヤーの計画理由になる
- 通信、物流、Porter、relay、契約、証拠を新しい所有モデルなしで再利用できる
- 人間評価で最も判断しやすい「次にもう一度行きたいか」を測れる

着手条件:

- 人間が `partial → reload → complete → 第2契約` をミュートなしで完走する
- 復元要約、契約テンポ、脅威圧、視認性、搬送速度について短い観察メモを残す
- Phase Gのプレイヤー判断を1文、受入条件を5項目以内、非対象を明記する

最小受入像:

- 1訪問目の選択が、2訪問目の目的・経路・支援の少なくとも1つを変える
- 帰還要約から「何をしたため何が変わったか」を読み取れる
- reload後も選択結果が重複せず、同じsettlement再送が一回分として扱われる
- 既存122テストを回帰し、新規pure logicを自動テストで固定する
- 3訪問後にRapier / Scene / DOMの増殖がない

非対象:

- 複数敵協調
- ミッション途中再開
- プロシージャル生成
- schema v2を必要条件なしに先行実装すること
- 制作アセットへの全面置換

### 条件付き代替

| 人間評価で支配的だった問題 | 選ぶ候補 | 選ばないもの | 理由 |
| --- | --- | --- | --- |
| 単体ドローンでは孤立・通信判断が成立しない | 複数敵協調の最小スライス | 契約追加、生成世界 | 脅威圧を直接検証できる |
| 中断負担が大きく、長い訪問を完走できない | ミッション途中再開の契約設計 | 新敵、新世界 | settlementと別の一時snapshot境界を先に解く必要がある |
| 固定世界の反復そのものが主要な退屈要因 | まず第2の作者定義世界 | 直ちにプロシージャル生成 | `WorldDefinition` 抽象を実コンテンツで検証できる |
| 初回ロードが実機で明確な離脱要因 | 計測主導のbundle分割 | 体感根拠のない警告消し | 性能問題を数値で閉じられる |

## 条件付き長期ロードマップ

これは承認済み計画ではなく、前段ゲートを通った場合だけ次段へ進む提案です。

| 段階 | 目標 | 完了条件 | 依存ゲート | 主担当 |
| --- | --- | --- | --- | --- |
| Gate F-A | Phase F感覚受入 | 3訪問の音・視認性・テンポ評価と、blocking / tuning / accepted判定 | 現在 | 人間ゲームデザイン / UX |
| Phase G | 再訪判断の因果 | 1訪問の選択が次訪問の目的・経路・支援を変え、要約と保存が一致 | Gate F-A | ゲームデザイン + 状態モデル |
| Phase H | 非致死的な圧力の深化 | 複数接触または役割差が通信・孤立・物流判断を増やし、存在量を無制限化しない | Phase Gの体験評価 | AI / communication / threat |
| Phase I | 作者定義世界の拡張 | 第2世界が `WorldDefinition`、安定ID、safe anchor、契約、復元、dispose契約を再利用 | G/Hで継続動機が成立 | content + world projection |
| Phase J | 中断耐性 | 訪問中一時snapshotを帰還settlementと分離し、二重精算なしで復元・破棄できる | 訪問時間の実測 | save / mission lifecycle |
| Phase K | schema進化 | 実要件に基づくv2とv1 fixture migration、未来schema fail-closedを両立 | v2データ要求発生 | persistence |
| Phase L | 制約付き再訪変化 | 到達性検証、安定semantic ID、safe anchorを持つseeded variationを導入 | 2つ以上の作者定義世界で抽象が実証済み | world generation / QA |
| Beta hardening | 実機品質 | 起動時間、bundle、フレーム、入力、音、キーボード操作、save recoveryに数値予算 | 主要ゲームループ凍結 | performance / accessibility / QA |
| Release candidate | 配布候補 | rights、制作アセット、回帰、save compatibility、PR review、rollback手順を人間承認 | Beta受入 | オーナー / release |

### 長期ロードマップの停止条件

- あるPhaseが既存の `ItemLocation`、settlement、communication、navigationの2つ以上を同時に再設計し始めた場合は分割する
- 人間評価の主要問題と選択したPhaseの目的が一致しない場合は着手しない
- schema変更理由が具体的な保存データとして説明できない場合はv1を維持する
- プロシージャル生成が安定ID・到達性・safe anchorを保証できない場合は作者定義世界へ戻す
- bundle warningだけで性能作業を開始せず、実機の起動・キャッシュ・再訪時間を先に計測する

## 残作業台帳

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase F人間評価 | 自動検証できない感覚品質を確定する | ミュートなし3訪問、観察メモ、blocking/tuning判定 | 待ち | 人間ゲームデザイン / UX | QA URLから通しプレイし、6観点を記録する |
| Phase G選定 | 次スライスを一目的に固定する | 人間観察、idea ledger比較、受入条件、非対象 | 未承認 | オーナー / 監修役AI | 推奨案または条件付き代替を1つ承認する |
| Phase G仕様 | 実装の境界と完了判定を先に固定する | プレイヤー判断1文、不変条件、5件以内の受入、テスト計画 | 未着手 | ゲームデザイン + 実装AI | Phase F先端から専用branchを作る前に仕様を書く |
| draft PR #1 | Phase C〜Fをmainへ統合可能にする | 人間レビュー、必要ならCI、merge方針 | OPEN / DRAFT / MERGEABLE | オーナー / reviewer | Phase F感覚受入後にReady化可否を判断する |
| CI証跡 | PR上で再現可能なゲートを得る | typecheck/test/build workflow | 未設定・非ブロッキング | repo owner / CI | merge方針決定時に必要性を判断する |
| bundle計測 | 性能作業の根拠を得る | 初回、warm cache、再訪の実機計測 | warningのみ・保留 | performance | 体感問題が出た端末で3値を採る |
| schema migration | 将来save互換を守る | 明示v2要件、v1 fixture、fail-closed | trigger待ち | persistence | v2フィールド確定後、fixture testから始める |
| 制作アセット | 視覚品質を製品段階へ進める | rights、GLB/glTF規約、collision proxy、budget | primitive段階 | art / tech art / owner | gameplay loop固定後に導入基準を承認する |
| release / deployment | 外部配布する | rights、品質、review、配布先、rollbackの人間承認 | 未許可 | オーナー | 現段階では実施しない |

## 次のAIが最初に行うこと

1. `PROJECT_HANDOFF.md`、`docs/project-context.md`、本文書を読む。
2. `git status -sb` と `git rev-list --left-right --count HEAD...origin/feat/phase-f-world-persistence` を確認する。
3. 人間評価メモが追加されているか確認する。なければPhase G実装を開始しない。
4. 評価メモがある場合だけ `docs/idea-ledger.md` と比較し、Phase Gを1つに絞る。
5. 受入条件と非対象を先に文書化し、Phase F先端から新branchを作る。

## 監修役AIへの判断依頼

現時点で必要な判断は1つです。

**人間の3訪問感覚評価を先に実施し、その結果が重大な別問題を示さなければ、Phase Gを「契約・証拠・再訪判断の因果深化」に限定して仕様化してよいか。**

この判断はPhase G実装の許可に限定し、draft PRのmerge、公開、deployment、releaseの許可を含みません。
