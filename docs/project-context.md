# Project Context

更新日: 2026-07-21

## North star

`LOWPASS: SALVAGE ATLAS` は、低忠実度3D表現の中で、隊員・装備・通信・非致死的機械生態系・継続世界を一貫した状態モデルとして扱うデスクトップブラウザ向け探索ゲームです。プレイヤーの判断が帰還精算を通じて次の訪問へ残り、表示・物理・ナビゲーションが同じシミュレーション状態を投影することを重視します。

## Cockpit

| 項目 | 現在値 |
| --- | --- |
| 軸 | 状態所有とプレイヤー判断の整合性 |
| レーン | 固定世界を反復訪問できる垂直スライス |
| 完了スライス | Phase F: 訪問間世界永続化 |
| 作業ブランチ | `feat/phase-f-world-persistence` |
| 実装基準 | `1e98860597ac940ff8d47505a5b00736d852c43a` |
| 次のゲート | 人間の感覚評価 → Phase G単一目的の選定 |
| 受入の正本 | `README.md` のフェーズ別検証結果と `PROJECT_HANDOFF.md` |

## 現行アーキテクチャ

- TypeScript / Vite / Three.js / Rapier / DOM UI。ゲームルールは `src/game/` が所有し、Three.jsとRapierを真実源にしない
- 固定60 Hzシミュレーション。敵判断と通信評価は低い固定周波数に分離し、描画フレーム依存を避ける
- 不変な `ExpeditionManifest` と可変な `MissionSession` を分離する
- `ItemLocation` を装備・資源・カート・機械搬送を含む所在の唯一の表現とする
- `WorldDefinition` は作者定義の不変世界、`PersistedWorldStateV1` は安定IDだけを保存する訪問間スナップショットとする
- `WorldDelta` は純粋に適用し、settlementは `expectedRevision` とsettlement IDで競合・重複を防ぐ
- IndexedDBのread / revision判定 / writeは単一readwrite transactionで行う
- 表示、Rapier collider、navigation edge、通信グラフは保存状態から順序付きで復元する
- ミッション・探索ビュー・機械処理はdynamic importし、帰還時にRapier world、Three object、geometry、material、DOM購読を破棄する

## フェーズ履歴

| Phase | 基準 | 成果 |
| --- | --- | --- |
| B | `c5ae3b9` / `phase-b-expedition-planning` | 船内、ゲート、遠征編成、28U制約 |
| C | `7d775d5` / `phase-c-fixed-expedition` | 固定探索、資源、カート、complete / partial精算 |
| D | `6a6cb6c` / `phase-d-squad-comms` | 分散スポーン、手書きA*、通信、分隊命令、知識 |
| E | `6473c65` / `phase-e-machine-ecology` | 敵対Scout Drone、干渉、relay妨害、友好Porter |
| F | `1e98860` | revision付き帰還精算、再訪復元、契約、証拠、残置装備 |

`048299b` と `bf4eeb7` はPhase E途中の保全コミットです。履歴をsquash、rebase、force-pushして消さないでください。

## 保存・中断契約

- 保存するのは帰還操作で確定したworld settlementだけ。訪問中の一時状態は保存しない
- リロード、クラッシュ、強制終了、ロード途中終了では未精算deltaを捨て、基底revisionを維持する
- codecはunknown入力、破損、未来schemaを正常値として上書きせず、safe modeと診断へ送る
- schema更新はversionごとの明示migrationで行い、欠落値を推測補完しない
- 残置装備は同じItemInstance IDを維持し、船内在庫との二重化を許さない
- 不正な保存位置はnavigationへ投影し、失敗時のみ作者定義安全アンカーへ修復して診断を残す

## 現在の品質基準

Phase F先端で、型検査、24ファイル122テスト、production build、トップレベル依存整合、diff checkを通すこと。ブラウザでは3訪問、進行中リロード、契約累積、Porter関係、開放経路、証拠一回通知、relay残置・回収、世界限定リセットを確認すること。詳細な手順と実測値は `README.md` にあり、更新時は要約だけでなく同じ証跡を更新します。

## Re-entry snapshot

- コードとREADMEはPhase F完了地点でクリーン
- Phase Gは未選定。人間評価が所有するため自動的に決めない
- `main` はPhase B基準の統合ゲートであり、Phase C〜Fの履歴はfeature branchに直列で保持
- `.serena/`、`node_modules/`、`dist/`、IndexedDB、資格情報はローカル専用。削除・追跡・共有しない
- 最短コマンドと残作業の責任分界はルートの `PROJECT_HANDOFF.md` を参照
