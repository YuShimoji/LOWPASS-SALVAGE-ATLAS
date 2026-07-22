# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-07-23

## 現在地

- 正本ブランチ: `feat/phase-f-world-persistence`
- 実装基準コミット: `1e98860597ac940ff8d47505a5b00736d852c43a`
- リモート同期基準: `d25a9c04c277d5d4728904a11429f45413599a83`
- 直前のローカル監修文書基準: `1f1319a9dd3e324ae81b62d73972b26137b7014c`
- 到達点: フェーズF「訪問間世界永続化」の実装・自動検証・3訪問ブラウザ検証まで完了
- 再開検証: 2026-07-23にremote取得、依存整合、型検査、24ファイル122テスト、build、HTTP smokeを再実施してPASS
- 次のゲート: 監修確認後、人間による3訪問の感覚評価。その後にフェーズGの目的を1つだけ選ぶ
- `main` はフェーズB基準点 `c5ae3b9` のまま。Phase C〜Fを暗黙に統合・強制更新しない

この文書を含む最新の引き継ぎコミットはローカルbranch先端です。2026-07-23の同期ではorigin側の未取込変更は0件で、ローカル監修文書だけが先行していました。この更新をcommitした直後の想定parityはlocal ahead 2 / behind 0です。再開時は `git rev-parse HEAD`、`git status -sb`、`git rev-list --left-right --count HEAD...origin/feat/phase-f-world-persistence` を確認し、ローカル先行commitを消さないでください。

監修役AIは [`docs/supervising-ai-report.md`](docs/supervising-ai-report.md) を読み、今回確認済みの自動検証、2026-07-21の既存ブラウザ証跡、人間所有の感覚評価、条件付き長期ロードマップを分離して扱ってください。

## リモート反映

- origin: `https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git`
- GitHub visibility: public（既存repository設定）
- default branch: `main`（Phase B統合基準）
- 再開branch: `feat/phase-f-world-persistence`
- review gate: draft PR [#1](https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS/pull/1)（Phase C〜F → `main`）
- ローカルに存在したPhase C〜Fの全branchとPhase B〜Eの全tagはoriginへpush済み
- `1f1319a` とこの2026-07-23監修更新はローカル引き継ぎcommitであり、originへのpushは未実施。remote portabilityはオーナー判断待ち
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

## 2026-07-23 再開検証

- `git fetch --prune --tags origin`: PASS
- `git pull --ff-only origin feat/phase-f-world-persistence`: PASS、already up to date
- 同期・文書更新前の `git rev-list --left-right --count HEAD...origin/feat/phase-f-world-persistence`: `1 0`。remote未取込0、既存のローカル監修commit 1件を保全
- この更新をcommitした直後の想定feature parity: `2 0`。2件とも監修・再開文書で、実装差分ではない
- `git rev-list --left-right --count main...origin/main`: `0 0`
- Node `v24.13.0` / npm `11.6.2`
- 対象checkoutに紐づくNode / npm process: 0
- `npm ls --depth=0`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS（24ファイル、122テスト）
- `npm run build`: PASS（初期チャンク2,900.15 kB / gzip 1,017.94 kB、既知warningのみ）
- 開発URL `http://127.0.0.1:5173/?qa=1&audio=muted`: HTTP 200、正しいtitleとmodule entrypointを確認後にserver停止
- draft PR #1: OPEN / DRAFT / MERGEABLE、status check 0件をライブ確認

この再開検証は3訪問の操作、音、リソース計測を再実施していません。それらは直前節とREADMEの2026-07-21証跡を参照します。

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
| 監修ロードマップ確認 | 先行目標を承認済み仕様と混同せず、次ゲートを明確にする | `docs/supervising-ai-report.md` の条件・停止条件・権限分界を確認 | 提案済み・承認待ち | 監修役AI / オーナー | 人間評価を先に行い、Phase G候補を1つだけ承認する |
| ローカル監修commitのremote portability | 別端末でも同じ監修文書から再開できる | 2件のdocs-only commitを確認し、push可否を明示承認する | local ahead 2 / behind 0想定・未push | オーナー | 承認時だけfeature branchへpushし、parity 0 / 0を再確認する |
| 保存migration | 将来のschema更新でもv1セーブを安全に継続利用できる | 明示version migration、v1 fixture、破損値のfail-closed維持 | v2要求まで保留 | 保存基盤 | schemaVersion 2が必要になった時点でテストから着手する |
| 初期バンドル分割 | 初回ダウンロードを減らせる | 実機起動計測、vendor cache戦略、現行dynamic import境界の維持 | 非ブロッキング | 性能作業 | 実測後にThree.js / Rapier分割の費用対効果を判断する |
| Rapier warning解消 | 開発コンソールの既知warningを除去できる | 依存版と初期化APIの互換性検証 | 非ブロッキング | 依存更新 | Rapier更新時に再評価する |

## 最初に読むファイル

1. `PROJECT_HANDOFF.md`
2. `docs/project-context.md`
3. `docs/supervising-ai-report.md`
4. `README.md` のフェーズF設計・検証・残課題
5. `docs/decision-log.md`
6. `docs/idea-ledger.md`
7. 実装着手時は `src/game/world/`、`src/game/mission/ExpeditionReservation.ts`、`src/main.ts`

未解決の設計質問は「Phase Gで、プレイヤー体験を最も大きく前進させる単一目的は何か」です。人間評価前に複数敵協調、生成世界、途中再開をまとめて実装しないでください。
