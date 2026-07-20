# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-07-21

## 現在地

- 正本ブランチ: `feat/phase-f-world-persistence`
- 実装基準コミット: `1e98860597ac940ff8d47505a5b00736d852c43a`
- 到達点: フェーズF「訪問間世界永続化」の実装・自動検証・3訪問ブラウザ検証まで完了
- 次のゲート: 人間による3訪問の感覚評価。その後にフェーズGの目的を1つだけ選ぶ
- `main` はフェーズB基準点 `c5ae3b9` のまま。Phase C〜Fを暗黙に統合・強制更新しない

この文書を含む最新の引き継ぎコミットはブランチ先端です。再開時は `git rev-parse HEAD` と `git status -sb` で、`origin/feat/phase-f-world-persistence` と一致することを確認してください。

## リモート反映

- origin: `https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git`
- GitHub visibility: public（既存repository設定）
- default branch: `main`（Phase B統合基準）
- 再開branch: `feat/phase-f-world-persistence`
- review gate: draft PR [#1](https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS/pull/1)（Phase C〜F → `main`）
- ローカルに存在したPhase C〜Fの全branchとPhase B〜Eの全tagはoriginへpush済み
- deployment / releaseは未実施。draft PRのmergeと公開リリースは人間判断に残す

## 別端末での最短再開

```powershell
git clone https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git
Set-Location LOWPASS-SALVAGE-ATLAS
git fetch --prune --tags origin
git switch --track origin/feat/phase-f-world-persistence
npm ci
npm ls --depth=0
npm run typecheck
npm test
npm run build
git status -sb
```

`npm ci`、`npm ls`、検証コマンドは重ねて実行せず、1つずつ完了させます。開発サーバーは検証後に `npm run dev` で起動します。ブラウザ反復試験は `http://localhost:5173/?qa=1&audio=muted` を使用できますが、音の人間評価では `audio=muted` を外してください。

## 完了済み

- Phase A〜Eの基盤を維持したまま、固定世界の `schemaVersion: 1`、`WorldDelta`、revision付きsettlement、IndexedDB永続化を追加
- 帰還した `complete` / `partial` / `aborted` だけを精算し、クラッシュ・リロード・ロード途中終了では未精算deltaを破棄
- 扉、チェーン、navigation edge、Rapier collider、Porter関係、固有資源、証拠、契約、残置relayを安定IDから復元
- 残置relayの同一 `ItemInstanceId` を維持し、船内在庫との二重化を防止
- 3訪問で第1契約の累積完了、第2契約解禁・完了、証拠の一回通知、Porter友好状態、経路開放、残置relayの回収を実ブラウザ確認
- 進行中リロードで `VISIT 3 / REV 3` が維持され、未精算貨物・報酬・装備・証拠が増えないことを確認
- 世界限定リセットが描画・音声・操作設定を変更しないことを確認

詳細な数値、ファイル別変更、ブラウザ証跡は `README.md` の「フェーズF 訪問間世界永続化の検証結果」を参照してください。

## 現行の検証基準

2026-07-21 の実装コミット `1e98860` では次を確認済みです。

- `npm run typecheck`: PASS
- `npm test`: PASS（24ファイル、122テスト）
- `npm run build`: PASS
- `npm ls --depth=0`: PASS
- `git diff --check`: PASS
- 3訪問と複数回の進行中リロード: PASS
- 3訪問後のリソース復帰: Rapier rigid bodies / colliders / contacts 1 / 12 / 1、scene objects 60、DOM nodes 117で増殖なし
- console error / 未処理例外: 0

既知の非ブロッキング項目は、Viteの500 kB初期チャンク警告とRapier互換パッケージ由来の初期化非推奨warningです。警告を消すためだけの閾値変更や物理基盤変更は行いません。

## 意図的に触れていない境界

- `main` のfast-forward、既存branch/tagの強制更新、履歴改変
- 本番デプロイ、Web公開手順、リリース判定
- オンライン同期、HP、死亡、銃撃戦、敵の偽通信・音声模倣
- Porterのカート操作、複数敵協調、プロシージャル世界、ミッション途中再開
- `.serena/`、`node_modules/`、`dist/`、ブラウザのIndexedDB、資格情報などのローカル専用状態

## 残作業

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| 人間による感覚評価 | 復元要約、契約テンポ、脅威圧、音量、視認性、搬送速度を最終判断できる | デスクトップ実機で `partial → reload → complete → 第2契約` をミュートなしで完走 | 実装済み・評価待ち | ゲームデザイン / UX | 調整値と文言だけをデータ定義・UIへ反映する |
| フェーズGの目的選定 | 次スライスの境界を固定し、複数機構の同時拡張を防ぐ | 人間評価結果と `docs/idea-ledger.md` を比較し、目的を1つに絞る | 未決定 | オーナー / ゲームデザイン | 受入条件を先に書き、専用branchをPhase F先端から作る |
| 保存migration | 将来のschema更新でもv1セーブを安全に継続利用できる | 明示version migration、v1 fixture、破損値のfail-closed維持 | v2要求まで保留 | 保存基盤 | schemaVersion 2が必要になった時点でテストから着手する |
| 初期バンドル分割 | 初回ダウンロードを減らせる | 実機起動計測、vendor cache戦略、現行dynamic import境界の維持 | 非ブロッキング | 性能作業 | 実測後にThree.js / Rapier分割の費用対効果を判断する |
| Rapier warning解消 | 開発コンソールの既知warningを除去できる | 依存版と初期化APIの互換性検証 | 非ブロッキング | 依存更新 | Rapier更新時に再評価する |

## 最初に読むファイル

1. `PROJECT_HANDOFF.md`
2. `docs/project-context.md`
3. `README.md` のフェーズF設計・検証・残課題
4. `docs/decision-log.md`
5. `docs/idea-ledger.md`
6. 実装着手時は `src/game/world/`、`src/game/mission/ExpeditionReservation.ts`、`src/main.ts`

未解決の設計質問は「Phase Gで、プレイヤー体験を最も大きく前進させる単一目的は何か」です。人間評価前に複数敵協調、生成世界、途中再開をまとめて実装しないでください。
