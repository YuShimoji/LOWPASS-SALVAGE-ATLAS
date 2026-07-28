# Idea Ledger

ここは未採用方向、選定理由、負の例を失わないための台帳です。記載は実装承認ではありません。

## 2026-07-28 Phase G Closure後

Phase Gは自動受入greenで、human sensory reviewはdeferred / non-blockingです。観測事実のないG-TUNEはactive seedから外し、camera、Guided QA、semantic cue、Canary consumerを追加拡張しません。CanaryはLOWPASSのinternal-only consumerまで成立しましたが、rights `NOASSERTION`、UV / texture / Blender / production approval未完了のため、製品asset採用候補とは区別します。

次の第一候補はPhase H1「契約・証拠・再訪判断の因果深化」です。static definitionとpersisted V2の境界を維持し、既存証拠から次訪問のrouteまたはsupport差を導く薄いsliceを優先します。WorldState migration、契約の大量追加、第2world、途中再開、敵追加を同時に行わないことが条件です。これはPrompt提案であり実装承認ではありません。

## 2026-07-26 playability recovery（履歴）

Gate G-Aは感覚評価の結論を出す前に `GATE_G_A_BLOCKED_BY_PLAYABILITY_BASELINE` で停止しました。入力、camera、cartの操作基準はlocal recovery branchで技術復旧しましたが、Phase Gは未受入です。次の近距離は `GATE_G_A_RETEST_REQUIRED` だけです。

物理Gamepadの感覚と完全menu navigation、カートのより精密な四輪物理、入力設定の永続化は今回の非対象です。現時点で追加実装へ広げず、人間の再受入結果を待ちます。CGAW canaryは別repositoryの独立レーンであり、このゲームbranchへ本番assetを導入しません。

## 2026-07-23 direction shift

オーナーの明示指示により、Phase Gは「固定上限の協調敵対Security Cell」に選定・実装されました。以前の第一候補「契約と証拠の深化」は棄却ではなく将来候補へ戻します。複数敵協調という語も無制限敵生成ではなく、needle 1 + watcher 1、routine/watchful、限定知識、予約、圧力上限という薄いスライスへ具体化しました。

## Phase H以降のactive seeds

| 候補 | 期待する価値 | 着手条件 | 主な危険 | 状態 |
| --- | --- | --- | --- | --- |
| Phase G tuning closeout | 観測された音量・音色・game feel問題だけを限定修正 | 任意の人間感覚レビューで具体的blocking/tuning事実がある | 構造変更をtuning名目で混ぜる | deferred / trigger待ち |
| 契約と証拠の因果深化 | 継続世界の選択と再訪理由を強める | 完全Prompt、owner承認、既存V2で表現可能な1判断 | content量だけ増え、判断が増えない | Phase H1第一候補・未実装 |
| Security Cell authoring definition | 別の作者定義世界でも役割セルを再利用する | 第2世界が承認され、hard-code重複が実在する | 早すぎる抽象化、敵数の暗黙増加 | 条件付き候補 |
| 第2の作者定義世界 | 固定世界反復の幅を広げ、WorldDefinitionを実証する | 現世界の継続動機が人間受入済み | contentと基盤変更の同時肥大化 | 条件付き候補 |
| ミッション途中再開 | 長い訪問の中断耐性を上げる | 訪問時間の実測、一時snapshotとsettlementの別契約 | 一時AI状態と確定world stateの混同、二重精算 | 条件付き候補 |
| 初期bundle分割 | cold startを軽くする | cold / warm / revisitの実機計測 | warningだけを追う複雑化 | 性能候補・非ブロッキング |
| schema V3 | 将来の保存形式変更を安全にする | 実データ要件とV2 fixtureが確定 | 要件なしmigrationの先行設計 | trigger待ち |

## Deferred directions

- オンライン同期
- HP、死亡、銃撃戦
- 敵による偽通信・音声模倣
- Porterによるカート操作
- 通常敵数のwatchful 2機超への増加
- 大規模な手続き生成や無制限の世界拡張

採用する場合は `ItemLocation`、world settlement、個体/共有knowledge、pressure budget、navigation、disposeのどこを変更するか先に仕様化します。

## Negative examples

- Vite chunk warningを消すだけの閾値引き上げ
- Rapier warningを消すためだけの未検証な物理基盤交換
- runtime UUID、Rapier handle、配列index、runtime taskやSetをsaveへ書く
- 破損saveや未来schemaの欠落値を推測補完する
- 帰還前のsecurity deltaを確定world stateとして保存する
- 敵がplayer stateや共有前のwatcher factを直接読む
- 古い共有位置だけからlock / interferenceを開始する
- watcherへinterdictを割り当てる、または全機を同じagent / relayへ予約する
- cautiousで新規攻撃を始める、outnumberedでもtokenを保持する
- Phase Hで契約、新世界、途中再開、敵追加を同時実装する
- 自動テスト結果から音量、シルエット、game feelをacceptedと推論する

## Phase H selection question

「帰還済みの契約・証拠を、既存の保存・通信・物流・限定知識を壊さず、次訪問のrouteまたはsupportを選ぶ1つのプレイヤー判断へどう変えるか」を選びます。目的1文、受入条件、非対象、停止条件を先に固定し、push / PR / release承認とは分離します。

現時点の優先順は、(1) 契約と証拠の因果深化、(2) 第2作者定義世界、(3) 訪問時間が問題なら途中再開、(4) 実測で問題ならbundle分割です。Phase G tuningは人間観察が具体的triggerを示した場合だけ割り込みます。監修用の条件付き長期順序は `supervising-ai-report.md` を参照します。

## 2026-07-24 branch framing

remote同期と開発gate再検証では新しいtechnical blockerは見つかりませんでした。したがって次の分岐は作業都合ではなく、Gate G-Aの観察結果で決めます。

| 分岐 | Objective | Gain | Risk | Best fit |
| --- | --- | --- | --- | --- |
| 契約・証拠の因果深化 | 1visitの選択を次visitの目的・経路・支援へ接続 | 継続世界が計画理由になる | content追加だけで判断が増えない | Phase Gがacceptedで、再訪動機が最大gap |
| 第2作者定義world | WorldDefinitionとSecurity Cell再利用を実証 | content幅と抽象の妥当性が上がる | contentと基盤変更が同時に膨らむ | 固定world反復が主要な退屈要因 |
| ミッション途中再開 | 長いvisitを安全に中断・再開 | accessibilityと生活適合が上がる | temporary snapshotとsettlement混同 | 中断負担が人間評価の主要問題 |
| 実機hardening | load、frame、input、audioの端末差を閉じる | production readinessが上がる | gameplay前進が止まる | cold startやframeがblocking |

第一候補は契約・証拠の因果深化です。ただしPhase Gの人間評価がblockingなら、どの分岐にも進まずPhase G closeoutを優先します。

## 2026-07-24 remote portability

オーナーの明示依頼により、`feat/phase-g-security-cell` branchと`phase-f-world-persistence` tagをoriginへpushしました。別端末から同じ実装・保全基準を取得できる状態になりました。これは履歴の共有gateを閉じただけであり、Phase Gのミュートなし人間受入、PR更新、main統合、deploy、releaseの承認を意味しません。

## 2026-07-25 restart audit

remote fetch / ff-only pull、依存、型、151 tests、production build、HTTP smokeを再実施し、新しいtechnical blockerは見つかりませんでした。`feat/phase-g-security-cell` はupstreamと0 / 0です。したがって候補順位は作業都合では変更せず、Gate G-Aの人間観察を次の分岐条件として維持します。

長期案は `docs/supervising-ai-report.md` で、必須近距離、次距離、条件付き長距離、製品化・配布・運用距離に分けました。後段の記載は実装承認ではありません。各段階は直前gateの証拠、目的1つ、受入条件、非対象、停止条件が揃った場合だけ具体化します。
