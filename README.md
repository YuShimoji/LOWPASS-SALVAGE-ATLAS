# LOWPASS: SALVAGE ATLAS

デスクトップブラウザ向け3Dゲームの垂直スライスです。TypeScript、Vite、Three.js、Rapier、DOM UIで構成されています。フェーズAの三人称アクション基盤に加え、フェーズBでは船内の遠征編成、ゲート制約検証、不変な `ExpeditionManifest` の確定までを実装しています。

## 実行

```powershell
npm install
npm run dev
```

検証コマンド:

```powershell
npm run typecheck
npm test
npm run build
```

### External CGAWE Runtime Bundle consumer

通常のgame startupとは分離した、repository-external Three.js contract proofです。exact CodexGameAssetWorkbench checkoutをread-onlyで指定します。

```powershell
$env:CGAWE_WORKBENCH_ROOT = 'X:\path\to\exact\CodexGameAssetWorkbench'
npm run cgawe:consumer:check
Remove-Item Env:CGAWE_WORKBENCH_ROOT
```

accepted producer commitは`831bdf587d26f74964f8d8a90f178f93e7213e54`です。proofはproducer artifactをこのrepositoryへcopyせず、contract、file identity、rights、Stable ID、pre-attachment failure、owned-resource disposalを検証します。現在のbounded statusとclaim boundaryは[`docs/CGAWE_RUNTIME_BUNDLE_EXTERNAL_CONSUMER_V1.md`](docs/CGAWE_RUNTIME_BUNDLE_EXTERNAL_CONSUMER_V1.md)を参照してください。

## 操作

- `WASD` / 矢印キー: 移動
- `Shift`: 走る
- ゲーム画面をクリック後、マウス移動: 三人称カメラ
- `E`: 出撃コンソールやゲート試験物体を操作
- `Escape`: 開いている編成・設定画面を閉じる
- `F1`: デバッグHUD

編成画面はドラッグ＆ドロップを必須にせず、標準のチェックボックス、ラジオボタン、ボタンで操作できます。Tabでフォーカスを移動し、EnterまたはSpaceで選択・割当できます。画面を開いている間は移動、カメラ、ポインターロック入力が停止し、設定画面とは排他的に表示されます。

## アーキテクチャ

- `src/game/`: シリアライズ可能なゲーム状態、固定60 Hzシミュレーション、分隊・アイテム・ミッション定義と純粋ルール
- `src/physics/`: Rapierワールド、コライダー、キャラクターコントローラー連携
- `src/render/`: Three.jsシーン、カメラ、プリミティブ表示、ゲート演出、GLB/glTF読込境界
- `src/ui/`: DOM HUD、編成画面、設定、プロンプト、診断表示
- `src/diagnostics/`: フレーム計測

Three.jsとRapierはゲームルールを所有しません。ゲート室の物理演出と編成UIは、DOM・Three.js・Rapierに依存しない `evaluateItemForGate` / `evaluateExpeditionDraft` を共有します。レンダラーは構造化された判定結果を色、短いアニメーション、音へ変換するだけです。

### フェーズBのデータ境界

- `ItemDefinition` は品目の静的仕様、`ItemInstance` は船内に存在する個体を表す
- `ExpeditionDraft` はUI操作中だけ変更可能で、確定済み `ExpeditionManifest` とは別の型にする
- マニフェスト生成時に隊員・装備の主要情報をスナップショット化し、全階層をfreezeする
- セーブ境界には確定マニフェストだけを含め、編集中ドラフトを混入させない
- 判定はbooleanに加え、違反コード、理由、対象、実値、上限を返す

ゲート上限は合計28U、物体単体の容積負荷4、論理負荷3です。隊員は1名5Uで、1～3名とフィールドリーダー1名が必須です。高性能端末は論理負荷6、ショッピングカートは容積負荷8のため、合計容量に空きがあっても拒絶されます。

## フェーズBで変更した主なファイル

- `src/game/items/itemDefinitions.ts`: 装備定義・個体・船内在庫・ゲート実演物体
- `src/game/mission/expeditionTypes.ts`: ドラフトと不変マニフェストの型
- `src/game/mission/gateEvaluator.ts`: 構造化違反を返す純粋な共通判定器
- `src/game/mission/ExpeditionPlanner.ts`: 編成操作、在庫返却、確定、二重確定防止
- `src/game/save/saveTypes.ts`: ドラフトを含めないセーブ境界
- `src/ui/ExpeditionPanel.ts`: 隊員選択、リーダー指定、装備割当、違反表示、確定サマリー
- `src/render/ship/createShipInterior.ts`: 3種類の試験物体とゲート光・短時間アニメーション
- `src/render/audio/GateFeedbackAudio.ts`: 認証・拒絶フィードバック音
- `src/main.ts`: UI排他制御、入力停止、共通判定器と演出の接続
- `src/game/mission/*.test.ts`: ゲート規則、ドラフト操作、不変性、JSON往復のテスト

## 検証結果 — 2026-07-20

- `npm run typecheck`: PASS
- `npm test`: PASS（6ファイル、21テスト）
- `npm run build`: PASS
- 実ブラウザ: 編成のリアルタイム容量更新、隊員除外時の在庫返却、キーボード割当、設定画面との排他、入力停止、確定サマリー遷移を確認
- 実ブラウザ: 簡易フィールド端末の認証、高性能端末の `OBJECT_LOGIC_LIMIT_EXCEEDED`、ショッピングカートの `OBJECT_VOLUME_LIMIT_EXCEEDED` と光・DOM表示を確認。音は同じスキャン結果からユーザー操作時に再生する経路を実装

Viteは生成JavaScriptが大きい旨の警告を出しますが、ビルドエラーではありません。Rapier開発実行時には互換パッケージ由来の初期化API非推奨警告が1件表示されますが、物理シミュレーションとコライダーは動作しています。

## 残課題

| 目的 | 影響 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| フェーズCの探索スライス | 現在は確定サマリーで終了する | 浸水スーパー、分散スポーン、NPC実体と命令の最小縦切り | スコープ外・未着手 | 次フェーズ | 確定マニフェストを探索開始入力として接続する |
| 初期バンドル分割 | 初回ダウンロードが大きい | Three.js/Rapierまたはマップの遅延ロード設計 | 非ブロッキング | 将来の性能作業 | 探索マップ導入時にチャンク境界を決める |
| Rapier非推奨警告の解消 | 開発コンソールに警告が残る | 依存版と初期化APIの互換性確認 | 非ブロッキング | 依存更新作業 | Rapier更新時に移行を再評価する |

NPCの3D実体・追従AI、散開スポーン、通信、操作対象切替、敵AI、探索マップ、資源回収、物理運搬、抽出、オンライン同期はフェーズBでは実装していません。

## アセット方針

実行時の3Dアセットは `src/game/content/assetManifest.ts` の安定キーを介したGLB/glTF 2.0を前提とします。現段階はプリミティブ表示で、制作アセットへ置換する前にコリジョンプロキシと最適化規約を確定します。
