# Idea Ledger

ここは未採用方向、選定理由、負の例を失わないための台帳です。記載は実装承認ではありません。

## 2026-07-23 direction shift

オーナーの明示指示により、Phase Gは「固定上限の協調敵対Security Cell」に選定・実装されました。以前の第一候補「契約と証拠の深化」は棄却ではなく将来候補へ戻します。複数敵協調という語も無制限敵生成ではなく、needle 1 + watcher 1、routine/watchful、限定知識、予約、圧力上限という薄いスライスへ具体化しました。

## Phase H以降のactive seeds

| 候補 | 期待する価値 | 着手条件 | 主な危険 | 状態 |
| --- | --- | --- | --- | --- |
| Phase G tuning closeout | watcher、chirp、圧力、退避の感覚品質を閉じる | ミュートなし人間観察とblocking/tuning分類 | 構造変更をtuning名目で混ぜる | 最優先ゲート・未評価 |
| 契約と証拠の因果深化 | 継続世界の選択と再訪理由を強める | Phase G受入後、現行契約テンポと要約密度を評価 | content量だけ増え、判断が増えない | Phase H第一候補・未承認 |
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

「Phase Gの人間評価で観測された最大の支障を、既存の保存・通信・物流・限定知識を壊さず、1つのプレイヤー判断として最も前進させる変更は何か」を選びます。目的1文、受入条件、非対象、停止条件を先に固定し、push / PR / release承認とは分離します。

現時点の優先順は、(1) Phase G tuning closeout、(2) 契約と証拠の因果深化、(3) 第2作者定義世界、(4) 訪問時間が問題なら途中再開、(5) 実測で問題ならbundle分割です。監修用の条件付き長期順序は `supervising-ai-report.md` を参照します。
