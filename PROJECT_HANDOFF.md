# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-07-23

## 現在地

- 現行ブランチ: `feat/phase-g-security-cell`
- Phase F保全タグ: `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a`
- Phase G分岐元: `4e3cdc66d357e8054d45e0a42c4f41f166087b20`（Phase F実装＋ローカル監修文書2件）
- Phase G実装コミット: この文書を含む現branchのHEAD。件名は `feat: coordinate hostile machine security cells`
- 到達点: Phase G「協調する敵対機械Security Cell」の実装、自動検証、実ブラウザ検証、V1→V2 migration、reset、3訪問リソース計測まで完了
- 次の必須ゲート: 人間がミュートなしで観測機の識別性、共有chirp、圧力テンポ、集団退避の自然さを評価する
- `main` の統合、既存PRの更新、push、PR作成、deploy、releaseは未実施・未許可

監修役AIは [`docs/supervising-ai-report.md`](docs/supervising-ai-report.md) を先に読み、確認済み事実、未確認の感覚品質、オーナー判断、条件付きPhase H以降を分離してください。READMEの「フェーズG Security Cellの検証結果」が数値とブラウザ証跡の正本です。

## 最短再開

```powershell
git status -sb
git rev-parse HEAD
git show-ref --verify refs/tags/phase-f-world-persistence
npm ci
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
git diff --check
npm run dev
```

ブラウザQAは `http://127.0.0.1:5173/?qa=1&audio=muted` を使用できます。訪問限定の構成確認は `&security-posture=routine` または `&security-posture=watchful` を加えます。音の人間評価では `audio=muted` を外してください。npm操作は同時実行せず、1つずつ完了させます。

## 実装済みシステム

- `PersistedWorldStateV2` とV1 fixture migration。契約、Porter、traversal、relay、証拠、settlement ID、visitCount、revisionを欠落なく保持し、破損・未来schemaはfail-closed
- 永続 `routine` / `watchful`。routineは監視針1機、watchfulは監視針＋観測機の固定2機で、それ以上増えない
- 確認接触を訪問deltaへ記録し、`complete` / `partial` / `aborted` の帰還settlementでだけ精算。同一settlement再送と未精算reloadでは増えない
- 個体 `HostileMachineKnowledge`、敵専用 `HostileMachineLinkGraph`、遅延共有、confidence減衰、uncertainty拡大、TTL破棄
- `SecurityBlackboard`、決定論的task allocator、同一対象・relay予約、失効・到達不能・退避時の解放
- lock / interference / relay sabotageを各1へ制限する圧力予算と、干渉後4秒grace
- watcherはobserve / overwatch、needleは再視認後interdictまたはrelay sabotage。古い共有位置だけからlockしない
- 隊員1.0、Porter 0.75、needle 1.0、watcher 0.5の存在量。cautiousは新規攻撃保留、outnumberedはセル全体で攻撃解除・共通退避
- 開放済みdoor / chainを敵A*、味方A*、Rapier、描画へ同じWorldStateから投影
- watcherの別シルエット、高高度、広角amber scan、共有送受信chirp、初回mesh解析通知、F1診断
- world resetはV2 routineへ戻し、描画・音・操作設定を変更しない

## 現行検証基準

- Node `v24.13.0` / npm `11.6.2`
- `npm run typecheck`: PASS
- `npm test -- --run`: PASS（26ファイル、151テスト）
- `npm run build`: PASS
- `npm ls --depth=0`: PASS
- `git diff --check`: PASS
- 初期chunk 2,904.36 kB / gzip 1,019.06 kB
- SecurityCellController dynamic chunk 44.38 kB / gzip 11.89 kB
- 実ブラウザ: V1→V2、routine→watchful、reload、fixed 2-node上限、遅延共有、link断・復旧、relay分業、存在量5ケース、lock解除、4秒grace、`partial → complete → aborted`、resetを確認
- 実ブラウザconsole error / page error / 未処理例外: 0
- 第3訪問帰還・通常reload後: Rapier 1 / 12 / 1、Scene 60、WebGL 60 / 1,416、geometry / texture / program 43 / 3 / 4、DOM 119 / 67 / 0 / 0 / 0

既知warningはViteの500 kB初期chunk警告と、Rapier互換packageの初期化API非推奨1種類です。閾値変更や物理基盤交換で隠していません。

## 保存・AI不変条件

1. `ExpeditionManifest` は不変、`MissionSession` を敵セル全責務へ肥大化させない。
2. `ItemLocation` がitem所在の唯一の真実源である。
3. Three.js UUID、Rapier handle、配列index、runtime taskや知識を保存しない。
4. settlementのrevision / ID冪等性と、帰還だけを永続化する境界を維持する。
5. 敵はlocalまたは敵リンクで受信した事実だけを使い、古い共有位置では再視認前にlockしない。
6. 敵HP、プレイヤーHP、射撃、死亡、偽通信、音声模倣を追加しない。
7. 通常敵数はroutine 1 / watchful 2を上限とする。
8. 描画、物理、味方・敵navigation、communicationは同じシミュレーション状態の投影である。
9. Security Cell、探索view、固有audioのdynamic importと帰還時disposeを維持する。
10. Vite / Rapier warningは実測に基づく別スライスで扱い、警告隠しをしない。

## 残作業

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase G人間受入 | watcherの識別、chirp、圧力、退避を製品判断できる | ミュートなしdesktop、routine→watchful、孤立→援軍→退避、短い観察メモ | 技術検証済み・感覚評価待ち | 人間ゲームデザイン / UX | blocking / tuning / acceptedを4観点ごとに記録する |
| Phase H目的承認 | 次の開発を最大の実測課題へ集中する | 人間メモ、目的1文、受入条件、非対象、停止条件 | 条件付き提案・未承認 | オーナー / 監修役AI | `docs/supervising-ai-report.md` のGate G-A後に1案だけ承認する |
| remote portability | 別端末がPhase G HEADとtagから再開できる | local commit内容と履歴確認、明示push権限、push後parity | local commitのみ・未push | オーナー | 承認時だけ現branchと新tagをpushする |
| main統合 | Phase C〜Gをreview可能にする | 人間受入、PR方針、必要ならCI、rollback確認 | 未実施・既存draft PRはPhase G未反映 | オーナー / reviewer | Phase G受入後にPR更新または新PRを判断する |
| bundle性能 | 初回起動を改善する | cold / warm / revisit実機計測、cache戦略 | warningのみ・非ブロッキング | performance | 体感問題のある端末で3値を採る |
| Rapier warning | 既知console warningを解消する | dependency/API互換、物理回帰 | 非ブロッキング | dependency maintenance | 更新専用スライスで扱う |
| release / deployment | 外部配布を可能にする | rights、品質、review、配布先、rollback、save互換の人間承認 | 未許可 | オーナーのみ | 現段階では実施しない |

## 監修役AIの最初の確認

1. `git status -sb` がcleanで、branchが `feat/phase-g-security-cell` であることを確認する。
2. `git log -1 --oneline` の件名と、Phase F tagの参照先を確認する。
3. READMEのPhase G検証値と、必要なら上記5コマンドを再実行する。
4. 人間のPhase G感覚評価メモがあるか確認する。なければ調整値を最終決定しない。
5. メモがある場合だけ、監修報告のGate G-Aでaccepted / tuning / blockingを判定する。
6. 次Phaseは1目的だけ承認し、push / PR / deploy / releaseは別々のオーナー判断として扱う。
