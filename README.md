# LOWPASS: SALVAGE ATLAS

デスクトップブラウザ向け3Dゲームの垂直スライスです。TypeScript、Vite、Three.js、Rapier、DOM UIで構成されています。フェーズAの三人称アクション基盤、フェーズBの遠征編成、フェーズCの固定探索・回収ループに加え、フェーズDでは決定論的な分散降下、分隊命令、通信網、個別知識、リレー、フレア、操作隊員切替までを実装しています。

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

探索では `E` で資源回収、カートの牽引・解放、工具短縮路、抽出を操作します。右下の `SQUAD` パネルから `follow`、`hold`、`move-to`、`search-zone`、`rally`、操作対象切替、携帯リレー、フレアを操作できます。パネルは折り畳み式で、通常HUDの中央を覆いません。

`?qa=1` を付けた開発URLでは、ブラウザ反復試験用の28U編成プリセットと位置移動ボタンだけが追加されます。プリセットは通常の `ExpeditionPlanner` 操作を呼び、資源取得、工具、カート、抽出は通常のインタラクション経路を使用します。

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

### フェーズDのシミュレーション境界

- `InsertionPlan` は不変な `ExpeditionManifest`、固定ミッション、シード、`stable` / `paired` / `scattered` から純粋かつ決定論的に生成する。手書きアンカーについて抽出地点への到達性、工具不要の脱出、コライダー非交差、ナビゲーション接続、隊員間距離、カメラ開始位置を検証する
- `NavigationService` は手書きウェイポイント上のA*、ナビゲーション点への投影、到達性、動的エッジ、構造化失敗理由を所有する。バールで短縮路を開くと、同じシミュレーション状態からナビゲーションエッジ、Rapierコライダー、Three.js表示を同期する
- `CommunicationGraph` は `agent-radio`、`field-terminal`、`portable-relay`、`extraction-beacon` を接続し、内部品質0〜1を `none` / `burst` / `voice` / `telemetry` へ変換する。評価は固定シミュレーション上で4 Hzとし、描画フレームごとの全組合せレイキャストは行わない
- 固定マップの `SignalZone` は駐車場、売場、冷却設備室、地下サービス通路などの手書き減衰を与える。通信経路は決定論的に選択され、携帯リレーの設置・回収直後に再評価される
- `SquadOrder` は `follow`、`hold`、`move-to`、`search-zone`、`rally` を表す。NPC移動は固定60 Hzで、通信切断後も受領済み命令を継続し、完了後は `finish-order-then-hold` に従う。経路停止時は再計画、再投影、再試行、失敗報告、待機の順で処理し、通常プレイではテレポートしない
- `SquadControlState` は `fieldLeadAgentId` と `controlledAgentId` を分離する。遠隔切替には簡易フィールド端末、対象へのtelemetry、操作可能状態、排他的操作なしが必要で、近距離だけローカル切替を許可する。拒絶は構造化コードとDOMフィードバックで返す
- `AgentKnowledge` と `SquadKnowledge` を分離する。区域探索の発見は最初に個人知識へ入り、通信可能なら共有、切断中なら `pendingReports` へ保持し、再接続時に重複なく送信する。HUDとレンダラーは未共有知識を直接参照しない
- 携帯リレーとフレアの所在は `ItemLocation` が唯一の真実源である。リレー設置は `mission-ground`、回収は `crew-loadout`、フレア使用は `consumed` へ遷移する。置き去りと消費は `MissionOutcome` に別々に記録される
- 可変な分隊状態は `MissionSession` へ詰め込まず、`DistributedSquadController` と `GameState.mission.squad` に分離する。Three.jsとRapierの参照は保存可能状態へ含めず、描画・物理・DOMは状態を投影するアダプターに留める

再集結目標 `REESTABLISH THE CREW` は `paired` / `scattered` でだけ一時表示されます。全員が信号地点の半径内に一定時間留まると達成しますが、資源抽出の必須条件にはしません。無線なし隊員も視認したフレアへの `rally` は受領できます。

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

## フェーズDで変更した主なファイル

- `src/game/insertion/InsertionPlanner.ts`: モード別の決定論的降下計画とアンカー検証
- `src/game/navigation/WaypointNavigationService.ts`: A*、投影、到達性、動的エッジ、失敗理由
- `src/game/communication/CommunicationGraph.ts`: 通信ノード、品質、バンド、SignalZone、中継経路
- `src/game/squad/DistributedSquadController.ts`: 固定60 HzのNPC命令実行、4 Hz通信、再計画、再集結、操作切替
- `src/game/squad/SquadControl.ts`: ローカル・遠隔切替条件と構造化拒絶
- `src/game/knowledge/KnowledgeService.ts`: 個別知識、共有知識、保留報告、再接続、重複排除
- `src/game/signals/SignalBeaconService.ts`: フレア消費、信号生成、認識、有効期限
- `src/game/mission/fixed/floodedMarket.ts`: 挿入アンカー、ウェイポイント、SignalZone、6探索区域、工具短縮路
- `src/game/mission/MissionSession.ts` / `ExpeditionReservation.ts`: 隊員別回収、消費・置き去り装備の結果と帰還精算
- `src/physics/PhysicsWorld.ts`: 名前付きワールドコライダーの有効・無効化
- `src/render/objects/createFloodedMarket.ts`: NPC、リレー、フレア、短縮路の状態投影
- `src/render/app/RenderSystem.ts`: 操作対象へのカメラ再バインドと `renderer.info.memory` 診断
- `src/ui/SquadPanel.ts`: 折り畳み式分隊端末、命令、通信、報告、リレー、フレア、拒絶理由
- `src/ui/Hud.ts`: 現操作隊員、フィールドリーダー、再集結、通信バンド、GPUメモリ表示
- `src/render/audio/SquadFeedbackAudio.ts`: 色だけに依存しない命令・拒絶フィードバック音
- `src/main.ts`: 独立サービスの調停、ワールド切替、入力停止、物理・描画同期
- `src/game/{insertion,navigation,communication,knowledge,squad}/*.test.ts`: フェーズD純粋ロジックと回帰テスト

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

## フェーズDの検証結果 — 2026-07-20

- フェーズC基準点 `7d775d5c6c38e107f0cdce75056916da374fe8d1` で既存8ファイル・27テスト、型検査、ビルド、依存整合を先に再検証した
- `phase-c-fixed-expedition` タグを同コミットへ作成し、`feat/phase-d-squad-comms` を同基準点から作成した。既存履歴・タグ・ブランチの強制更新は行っていない
- `npm run typecheck`: PASS
- `npm test`: PASS（14ファイル、55テスト）
- `npm run build`: PASS。`floodedMarket` 約7.82 kB、`createFloodedMarket` 約5.05 kBの遅延チャンクを維持
- `npm ls --depth=0`: PASS
- `git diff --check`: PASS

### 実ブラウザ検証

- `stable`、`paired`、`scattered` を同じ28Uマニフェストから明示選択し、3名の別アンカー配置とモード別再集結目標を確認
- 無線なしItoへの遠隔命令が `COMMUNICATION_INSUFFICIENT` で拒絶され、無線ありMaraへの `follow` / `hold` / `move-to` / `search-zone` が受領されることを確認
- 冷却設備室・地下サービス通路で `telemetry` から `voice` / `burst` / `none` へ低下し、通信不足時の操作切替が拒絶されることを確認
- 携帯リレー設置で地下隊員へのリンクが回復し、回収時にリンクが再計算されることを確認。telemetry回復後は端末経由でPlayerからMaraへ操作対象を切り替え、フィールドリーダーがPlayerのまま維持されることを確認
- 切断中の `search-zone` 発見が `PENDING 1` となり、再接続後に `PENDING 0` で共有され、同一報告が重複しないことを確認
- フレアが1個消費され、3/3隊員に認識され、通信 `none` のItoも `rally` を受領。PlayerとItoが集合後に `CREW_REESTABLISHED` / `CREW LINKED` へ遷移することを確認
- バールで短縮路を開き、DOM結果、描画の遮蔽物、Rapierコライダー状態、ナビゲーション動的エッジが同じシミュレーション状態へ同期することを確認
- 浄水フィルター3点、冷却コイルの手持ち拒絶、カート積載・抽出、4/4 `complete`、1/4 `partial`、リレー置き去り、フレア消費を確認
- 3回連続の船→探索→船を完了。帰還1はpartial、帰還2はcomplete、帰還3はpartial。通知と結果は各操作1回だけ発火し、イベント重複は観測されなかった
- 自動操作環境で拒絶されるpointer lock Promiseを入力境界で回収するよう修正し、再読込後のコンソールはerror・未処理例外0件。残ったwarningは既知のRapier初期化警告1種類のみ

### 3往復後のリソース計測

| 帰還 | Rapier collider | Scene objects | DOM nodes | geometries | textures | programs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 12 | 60 | 233 | 47 | 3 | 4 |
| 2 | 12 | 60 | 233 | 47 | 3 | 4 |
| 3 | 12 | 60 | 234 | 47 | 3 | 4 |

DOMの+1は3回目帰還時の消費・置き去り結果に対応する状態表示で、帰還ごとの単調増加ではありません。Rapier、Three.jsシーン、`renderer.info.memory` に増加傾向は観測されませんでした。

Viteの500 kB警告は継続しています。警告閾値は変更していません。初期チャンクは2,866.56 kB（gzip 1,007.98 kB）で、ミッション定義と探索ビューのdynamic import境界は維持されています。Vite 8.1.5は `vite:build-import-analysis` の `PLUGIN_TIMINGS` 診断も表示しますが、ビルドは正常終了しています。Rapier開発実行時の `using deprecated parameters for the initialization function; pass a single object instead` は依存側初期化ラッパー由来で、今回の60 Hz物理、コライダー復帰、3往復には影響していません。警告だけを理由とした物理基盤変更は行っていません。

## 残課題

| 目的 | 影響 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| フェーズEの脅威と協力者 | 分隊探索に敵対圧力と搬送支援がまだない | 孤立隊員を狙う敵ドローン、3名集合時の退避、修理可能な搬送アンドロイド | フェーズDスコープ外・未着手 | フェーズE | 既存の通信・命令・NavigationServiceへ知覚と行動を接続する。戦闘は別スライスで判断する |
| NPCの資源物理運搬 | NPCは探索・報告までで、資源やカートを操作しない | ItemLocation所有権、運搬予約、競合解決、帰還精算 | フェーズDスコープ外・未着手 | フェーズE以降 | プレイヤー経路を迂回せず、純粋な運搬トランザクションから薄く実装する |
| 初期バンドル分割 | 初回ダウンロードが大きい | Three.js/Rapierのvendor分割、実機起動計測、キャッシュ戦略 | 非ブロッキング | 将来の性能作業 | 現在のdynamic import境界を維持して実測後に分割方針を決める |
| Rapier非推奨警告の解消 | 開発コンソールに警告が残る | 依存版と初期化APIの互換性確認 | 非ブロッキング | 依存更新作業 | Rapier更新時に移行を再評価する |
| 人間による感覚評価 | 自動検証では遊びやすさ、音量、視認性の最終判断はできない | 分散距離、NPC速度、フレア45秒、通信段階、パネル密度、色覚・音量の実機評価 | 実装済み・人間評価待ち | ゲームデザイン / UX | デスクトップ実機で各モードを通し、調整値だけをデータ定義へ反映する |

オンライン同期、敵AI、搬送アンドロイド、戦闘はフェーズDでは実装していません。フェーズEは不変マニフェスト、ItemLocation、NavigationService、CommunicationGraph、分隊知識の境界を保ったまま、敵ドローンまたは搬送アンドロイドのどちらか一方を薄い垂直スライスとして接続する地点から開始します。

## アセット方針

実行時の3Dアセットは `src/game/content/assetManifest.ts` の安定キーを介したGLB/glTF 2.0を前提とします。現段階はプリミティブ表示で、制作アセットへ置換する前にコリジョンプロキシと最適化規約を確定します。
