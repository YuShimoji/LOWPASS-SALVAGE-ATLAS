# LOWPASS: SALVAGE ATLAS

デスクトップブラウザ向け3Dゲームの垂直スライスです。TypeScript、Vite、Three.js、Rapier、DOM UIで構成されています。フェーズAの三人称アクション基盤、フェーズBの遠征編成に加え、フェーズCでは固定探索マップでの回収、カート搬送、complete/partial帰還までを実装しています。

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

## 操作

- `WASD` / 矢印キー: 移動
- `Shift`: 走る
- ゲーム画面をクリック後、マウス移動: 三人称カメラ
- `E`: 出撃コンソールやゲート試験物体を操作
- `Escape`: 開いている編成・設定画面を閉じる
- `F1`: デバッグHUD

編成画面はドラッグ＆ドロップを必須にせず、標準のチェックボックス、ラジオボタン、ボタンで操作できます。Tabでフォーカスを移動し、EnterまたはSpaceで選択・割当できます。画面を開いている間は移動、カメラ、ポインターロック入力が停止し、設定画面とは排他的に表示されます。

フェーズCの探索でも `E` で資源回収、カートの牽引・解放、抽出を行います。`?qa=1` を付けた開発URLでは、ブラウザ反復試験用の位置移動ボタンだけが追加されます。資源取得や抽出そのものは通常のインタラクション経路を使用します。

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

### フェーズCの状態とトランザクション境界

- `ExpeditionManifest` はフェーズBで確定した不変入力のまま保持し、探索中には変更しない
- 可変な経過時間、資源、カート、結果、イベントrevisionは `MissionSession` に分離する
- `ItemLocation` の判別共用体を装備・資源・カートの唯一の所在表現とし、Mesh座標やRapierボディを真実源にしない
- 出撃前に全装備の船内所在を検証してから一括予約し、読込失敗時は全件ロールバック、帰還時は装備返却と回収資源だけを一括精算する
- カートはプレイヤー追従位置をゲーム状態で決め、Rapierではキネマティックセンサーとして同期する。重量物搬送を決定論的に保ち、動的剛体の暴走や状態所有の逆転を避けるためである

### 固定探索マップ

`濁流の生活圏` は浸水した郊外型スーパーマーケットのプリミティブマップです。3個の浄水フィルター、手持ち不可の密閉型冷却コイル、現地ショッピングカート、抽出リングを含みます。全4点を確保すると `complete`、1点以上を確保して戻ると `partial` になります。カート本体は結果にも船内台帳にも追加されません。

固定ミッション定義と探索ビューは `main.ts` からそれぞれ `dynamic import()` されます。本番ビルドでは `floodedMarket-*.js` と `createFloodedMarket-*.js` の独立チャンクを確認しています。帰還時はミッション用Rapierワールド、シーンroot、geometry、materialをdisposeし、船内ワールドを新規生成します。

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

## フェーズCで変更した主なファイル

- `src/game/items/itemLocation.ts`: 唯一のアイテム所在型と台帳コピー
- `src/game/mission/ExpeditionReservation.ts`: 予約、ロールバック、帰還精算トランザクション
- `src/game/mission/MissionSession.ts`: 資源回収、重量拒絶、カート積載、complete/partial判定
- `src/game/mission/fixed/floodedMarket.ts`: 動的読込される固定ミッションデータ
- `src/physics/PhysicsWorld.ts`: ワールド差替えとキネマティックカート同期
- `src/render/objects/createFloodedMarket.ts`: 低ポリゴン探索マップと隊員・装備・資源表示
- `src/render/objects/disposeObjectTree.ts`: geometry/materialの明示破棄
- `src/ui/MissionResultPanel.ts`: complete/partial結果と船内帰還UI
- `src/main.ts`: 動的読込、船→探索→船遷移、リソース所有権とdisposeの調停
- `src/game/mission/*Session.test.ts` / `ExpeditionReservation.test.ts`: 遠征ループとトランザクションのテスト

## フェーズB基準点の検証結果 — 2026-07-20

- `npm run typecheck`: PASS
- `npm test`: PASS（6ファイル、21テスト）
- `npm run build`: PASS
- 実ブラウザ: 編成のリアルタイム容量更新、隊員除外時の在庫返却、キーボード割当、設定画面との排他、入力停止、確定サマリー遷移を確認
- 実ブラウザ: 簡易フィールド端末の認証、高性能端末の `OBJECT_LOGIC_LIMIT_EXCEEDED`、ショッピングカートの `OBJECT_VOLUME_LIMIT_EXCEEDED` と光・DOM表示を確認。音は同じスキャン結果からユーザー操作時に再生する経路を実装

Viteは生成JavaScriptが大きい旨の警告を出しますが、ビルドエラーではありません。Rapier開発実行時には互換パッケージ由来の初期化API非推奨警告が1件表示されますが、物理シミュレーションとコライダーは動作しています。

## フェーズCの検証結果 — 2026-07-20

- `npm run typecheck`: PASS
- `npm test`: PASS（8ファイル、27テスト）
- `npm run build`: PASS。固定定義1.89 kB、探索ビュー3.68 kBの遅延チャンクを生成
- `npm ls --depth=0`: PASS
- 実ブラウザ: 船内編成、マニフェスト確定、動的探索遷移、3名・装備2点の反映、フィルター3点回収を確認
- 実ブラウザ: 冷却コイルの手持ち拒絶、カート積載、抽出地点への搬送、カート非回収、`complete` 帰還を確認
- 実ブラウザ: 1資源だけの `partial` 帰還を確認
- 実ブラウザ: 船→探索→船を3回反復。各帰還時にRapierコライダー12、シーンオブジェクト60、DOMノード134で一致し、イベント結果も各操作1回だけ発火
- 通常HUD、移動入力、設定画面は帰還後に復帰

開発サーバーが転送したブラウザコンソールにはerrorや未処理例外はなく、既知のRapier非推奨warningだけが記録されました。致命UIや遷移停止も発生していません。

Viteの500 kB警告は継続しています。遅延ミッションは分離済みですが、Three.jsとRapierを含む初期チャンクが約2.83 MB（gzip約996 kB）です。警告閾値は変更していません。Rapier警告の文言は `node_modules/@dimforge/rapier3d-compat/rapier_wasm3d.js` 内の生成初期化ラッパーに存在し、公開型は引数なし `init()` です。今回の型検査、テスト、3往復の物理動作には影響しないため依存更新時の対応とします。

## 残課題

| 目的 | 影響 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| フェーズDの分隊行動 | 現状の選択隊員は探索開始地点の表示のみ | NPC追従・待機・合流・探索・運搬命令、分散スポーン | スコープ外・未着手 | 次フェーズ | `MissionSession` の選択隊員をAI実体へ投影する |
| 初期バンドル分割 | 初回ダウンロードが大きい | Three.js/Rapierのvendor分割と起動計測 | 非ブロッキング | 将来の性能作業 | フェーズD前に実測してvendorチャンク方針を決める |
| Rapier非推奨警告の解消 | 開発コンソールに警告が残る | 依存版と初期化APIの互換性確認 | 非ブロッキング | 依存更新作業 | Rapier更新時に移行を再評価する |

NPC追従AI、散開スポーン、通信、操作対象切替、敵AI、搬送アンドロイド、オンライン同期はフェーズCでは実装していません。フェーズDは不変マニフェストとセッション境界を保ったまま、選択隊員をAI実体へ接続する地点から開始します。

## アセット方針

実行時の3Dアセットは `src/game/content/assetManifest.ts` の安定キーを介したGLB/glTF 2.0を前提とします。現段階はプリミティブ表示で、制作アセットへ置換する前にコリジョンプロキシと最適化規約を確定します。
