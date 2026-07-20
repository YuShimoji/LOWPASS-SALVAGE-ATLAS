# LOWPASS: SALVAGE ATLAS

デスクトップブラウザ向け3Dゲームの垂直スライスです。TypeScript、Vite、Three.js、Rapier、DOM UIで構成されています。フェーズAの三人称アクション基盤、フェーズBの遠征編成、フェーズCの固定探索・回収ループ、フェーズDの分散分隊に加え、フェーズEでは敵対ドローンと友好搬送アンドロイドによる非致死的な機械生態系を接続しています。

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

探索では `E` で資源回収、カートの牽引・解放、工具短縮路、リレー再起動、搬送アンドロイド認証、抽出を操作します。右下の `SQUAD` パネルから `follow`、`hold`、`move-to`、`search-zone`、`rally`、操作対象切替、携帯リレー、フレアを操作できます。接触情報は操作中隊員が直接観測または受信した範囲だけを同じ折り畳みパネルに表示します。敵のロックオンと通信妨害、友好アンドロイドの命令と搬送対象は低干渉な状態表示へ投影されます。

`?qa=1` を付けた開発URLでは、ブラウザ反復試験用の28U編成プリセット、位置移動、孤立・援軍・離脱、リレー状態、Porter認証・搬送の診断操作が追加されます。`&drones=2` で敵対ドローン2体のデバッグ構成を選べます。`&audio=muted` を併用すると自動試験中はAudioContextを生成しません。通常の編成、インタラクション、ItemLocation、通信グラフ、抽出処理はQA表示でも迂回しません。

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

### フェーズEの機械生態系境界

- `MachineAgentState` は機械のid、definition、faction、mode、位置、向き、標的、経路、cooldown、perceptionだけを保持する保存可能なシミュレーション状態である。Three.jsオブジェクトとRapierハンドルは含めず、敵AI、Porter制御、描画、音、DOMを分離した
- `PresenceAssessment` は標的から11 m以内にいる、行動可能・認識可能・完全隔壁に遮られていない実体だけを評価する。隊員1.0、友好Porter 0.75、敵ドローン1.0、リレーとフレア0で、敵側が同数以上なら `predatory`、味方超過が0.75未満なら `cautious`、0.75以上なら `outnumbered` とする。5 Hz評価、0.8秒ヒステリシス、退避後4秒の同一標的cooldownをデータ定義から適用する
- `HostileDroneState` は `dormant`、`patrol`、`investigate`、`stalk`、`lock-on`、`interdict`、`sabotage-relay`、`observe`、`disengage`、`return-to-route`、`disabled` を持つ。固定60 Hz移動、4 Hz意思決定、5 Hz知覚・存在量評価で、孤立度、通信状態、距離から標的を選び、数的不利への移行時は2秒のロックオンを即時中止して退避する
- 干渉パルスは8秒間、対象の通信を最大 `burst` に制限し、遠隔操作切替、Porter認証、リレー再起動などの進行中インタラクションを中断する。`agent-carried` の片手資源だけを `mission-ground` へ遷移させ、装備スロットの無線、端末、工具は落とさない。HP、死亡、永久破壊、銃撃は導入していない
- 既存フレアを `MachineStimulus` として接続した。孤立地点は `investigate`、集団地点は接近せず `observe` とし、フレアを隊員の正確な位置として扱わない。activeリレーは半径6 m以内に防衛側がいない場合だけ2.5秒でdisabledとなり、所在を変えず通信グラフから一時除外される。プレイヤーの1.5秒操作で再起動し、グラフを即時再評価する
- 抽出ビーコン半径8 mは干渉・リレー妨害を禁止する安全区域である。通常HUDはロック進行、妨害残り時間、Porter命令など必要最小限だけを示し、敵内部状態、存在量、標的評価はデバッグHUDだけへ表示する
- `PorterAndroidController` は停止中の荷役補助機を、簡易フィールド端末を持つ操作可能な隊員の3秒認証で友好化する。`follow`、`hold`、`carry-to`、短距離voice通信、存在量0.75を提供し、冷却コイルを `world → machine-carried → extraction-pad` と搬送する。経路失敗時は再計算、再投影、再試行、安全配置、失敗報告、待機の順に回復する。認証後は低い反復音、経路失敗とゲート拒絶では別の下降音を状態投影として再生する
- Porterのゲート特性は8U、volume 5、logic 5で、物体単体上限の双方から拒絶される。資源を抽出台へ置いた後は現地へ残り、`AlliedMachineOutcome` に `friendly-left-behind` と支援item idを不変結果として記録する。船内隊員・装備・貨物には追加せず、`ExpeditionManifest` も変更しない
- 隊員別脅威知識、保留報告、SignalZone、携帯リレー、分隊命令、操作対象切替、カート、complete / partial精算は既存境界を再利用する。標準構成は敵1体で、`?drones=2` だけが2体の診断構成を追加する

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

## フェーズEで変更した主なファイル

- `src/game/machines/machineTypes.ts`: 保存可能なMachineAgentState、機械faction・mode、Porter・outcome型
- `src/game/threat/PresenceService.ts`: 重み、壁・行動可否・認識条件、band、ヒステリシスを扱う純粋な局所存在量評価
- `src/game/threat/ScoutDroneController.ts`: 4 Hz決定、5 Hz知覚、標的評価、ロックオン、退避、フレア・リレー反応
- `src/game/threat/InterferenceService.ts`: 8秒の通信制限とItemLocationに基づく片手資源落下
- `src/game/machines/PorterAndroidController.ts`: 認証、命令、搬送、経路回復、安全配置、ゲート拒絶
- `src/game/machines/machineGateEvaluator.ts`: DOM・Three.js・Rapier非依存のPorterゲート判定
- `src/game/items/itemLocation.ts`: `machine-carried` と `extraction-pad` を追加した唯一所在型
- `src/game/communication/CommunicationGraph.ts` / `src/game/squad/DistributedSquadController.ts`: friendly-machine voice、interference、disabled relay、再起動
- `src/game/mission/MissionSession.ts`: 搬送資源の抽出、Porter支援結果、干渉時の安全な所在遷移
- `src/render/objects/createFloodedMarket.ts` / `src/render/audio/MachineFeedbackAudio.ts`: authorityを持たない機械・走査光・身体言語・音響投影
- `src/ui/SquadPanel.ts` / `src/ui/MissionResultPanel.ts` / `src/ui/Hud.ts`: 低干渉警告、Porter状態、ゲート拒絶、デバッグ詳細
- `src/diagnostics/DomDiagnostics.ts`: total、persistent HUD、modal、transient、result historyのカテゴリ計測
- `src/main.ts`: 遅延ロードされる機械サービス、入力中断、UI・物理・描画・音の調停とQA readback
- `src/game/{threat,machines,communication,mission}/*.test.ts`: 存在量、敵AI、干渉、リレー、Porter、回帰テスト

## フェーズFで変更した主なファイル

- `src/game/world/worldTypes.ts`: immutableな`WorldDefinition`、保存用`PersistedWorldStateV1`、安定した`WorldEntityId`、`WorldDelta`、`WorldVisitSettlement`の型
- `src/game/world/floodedMarketWorld.ts`: 固定世界、2契約、扉・チェーン、Porter安全アンカー、固有資源、証拠の作者定義ID
- `src/game/world/WorldState.ts`: 初期状態、純粋で不変・冪等なdelta適用、revision検査付き精算、契約解禁と精算効果
- `src/game/world/worldStateCodec.ts`: unknown入力のschemaVersion 1検証、JSON境界、破損診断、将来migrationの入口
- `src/game/world/WorldStateRepository.ts`: テスト用インメモリ実装と、単一readwrite transactionで精算するIndexedDB実装
- `src/game/world/WorldVisit.ts`: 保存状態からの訪問投影、帰還結果からのdelta生成、残置装備の安全位置修復
- `src/ui/WorldStatusPanel.ts`: visits、契約、Porter、経路、残置装備、証拠、直近結果と確認付き開発リセットの折り畳み表示
- `src/game/mission/ExpeditionReservation.ts`: 世界に残っている同一ItemInstanceを再予約でき、回収時に船内へ一度だけ戻す所在精算
- `src/game/machines/PorterAndroidController.ts`: friendly関係、安全アンカー、支援回数の復元と端末条件付き高度命令
- `src/render/objects/createFloodedMarket.ts` / `src/physics/PhysicsWorld.ts` / `src/game/squad/DistributedSquadController.ts`: traversal、コライダー、ナビエッジ、active / disabled relayを同じ復元投影へ同期
- `src/main.ts`: WorldStateロード、訪問開始時の順序付き復元、帰還時だけのcommit、リロード中断破棄、世界限定リセットの調停
- `src/game/world/*.test.ts` と既存回帰テスト: schema、delta、精算、復元、Porter、残置装備、契約、reservationの自動検証

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

## フェーズE 機械生態系の検証結果 — 2026-07-21

- フェーズDコミット `6a6cb6ccd8f37b2a8c197713a1c9031c884a27fc` で型検査、14ファイル・55テスト、ビルド、依存整合、diff検査を先に再検証した
- `phase-d-squad-comms` タグを同コミットへ作成し、既存の部分実装コミットを保全したまま `feat/phase-e-machine-ecology` を作成した。既存履歴、タグ、ブランチの強制更新は行っていない
- `npm run typecheck`: PASS
- `npm test`: PASS（19ファイル、87テスト）。Presence、敵AI、干渉、relay、Porterに加え、stable / paired / scattered、分隊命令、通信、知識、カート、complete / partial、精算、disposeを回帰した。干渉中のPorter認証とリレー再起動中断も個別に固定した
- `npm run build`: PASS、`npm ls --depth=0`: PASS、`git diff --check`: PASS
- 遅延チャンクは機械音響1.52 kB、MissionSession 7.89 kB、探索ビュー8.24 kB、Porter 8.90 kB、固定マップ8.94 kB、ScoutDrone 19.21 kBで、機械固有処理を初期船内ロードから分離した

### 実ブラウザ検証

- `scattered` の標準プレイで孤立したMaraが優先標的となり、走査光、前傾姿勢、`LOCK-ON` 進行、通信ノイズ表示、8秒の最大burst干渉を確認した
- QAの孤立状態から2秒以内に援軍を到着させると、ロックが解除され、`OUTNUMBERED` / `OBSERVE` と後退へ切り替わった。敵の集団退避と友好Porterの0.75存在量寄与を確認した
- 最初の退避時だけ簡易端末へ `FIELD TERMINAL // LOCAL PRESENCE 2.00 > 1.00 // DRONE RETREAT` が短時間表示され、その後は通常HUDへ内部数値を常駐させないことを確認した
- Porterを簡易端末で3秒認証し、friendly voice node、冷却コイルの搬送、`extraction-pad` 配置、volume・logic双方のゲート拒絶、`friendly-left-behind` と支援1件の結果を確認した。船内メンバー、装備、貨物には追加されていない
- activeリレーのdisabled化、通信グラフからの除外、再起動プロンプト、1.5秒後の `RELAY_RESTARTED` と通信再評価を確認した
- 従来カート経路で冷却コイルを積載した4/4 `complete` を回帰確認済みである。2026-07-21の実測ではPorter支援partialを別途確認し、装備を置き去りにしない `partial` を3往復して通知・結果・操作が各1回だけ発火することを確認した。意図的にリレーを置き去りにした場合は、同じマニフェストの次回予約が正しく拒絶された
- コンソールerror 0、未処理例外0。warningは既知のRapier初期化非推奨1種類だけだった
- 隔壁越し非算入、孤立・集団フレア分岐、同一標的4秒cooldown、片手資源だけの落下、妨害解除後の切替、端末なし認証拒絶、経路失敗時安全配置は自動テストで検証した。ブラウザでは直接の視覚照合を行っていない
- 自動ブラウザ試験は `audio=muted` で行ったため、警告周波数上昇、再評価音、退避音の主観的な聞き分けは未評価である

### 3往復後のリソース・DOM計測

| 項目 | 3往復後 |
| --- | ---: |
| Rapier rigid bodies | 1 |
| Rapier colliders | 12 |
| Rapier contacts | 1 |
| Scene objects | 60 |
| WebGL draw calls / triangles | 66 / 1,468 |
| renderer.info.memory geometries | 47 |
| renderer.info.memory textures | 3 |
| renderer.info.programs | 4 |
| DOM totalNodes | 253 |
| DOM persistentHudNodes | 64 |
| DOM modalNodes | 0 |
| DOM transientFeedbackNodes | 0 |
| DOM resultHistoryNodes | 1 |

各帰還後のDOM totalは253で一定だった。modalとtransientは終了後0へ戻り、result historyは1件のまま、Rapier、Scene、geometry、texture、programに単調増加は観測されなかった。

初期チャンクは2,876.58 kB（gzip 1,011.02 kB）で、Phase Dの2,866.56 kB（gzip 1,007.98 kB）からの増分は10.02 kB（gzip 3.04 kB）だった。機械固有処理のdynamic import境界は維持している。Viteの500 kB警告は継続し、閾値は変更していない。Rapier開発実行時の `using deprecated parameters for the initialization function; pass a single object instead` は依存側初期化ラッパー由来で、60 Hz物理、遮蔽判定、3往復には影響しなかったため物理基盤を変更していない。

## フェーズF 訪問間世界永続化の検証結果 — 2026-07-21

- フェーズE基準点 `6473c6517a07da1bb251c6bef2c093c7557502cc` のクリーン状態で19ファイル・87テスト、型検査、ビルド、依存整合、diff検査を再検証した
- `phase-e-machine-ecology` タグを同コミットへ作成し、`feat/phase-f-world-persistence` を同基準点から作成した。既存履歴、タグ、ブランチの強制更新は行っていない
- `npm run typecheck`: PASS
- `npm test`: PASS（24ファイル、122テスト）。Phase Eの全87テストに加え、schema、delta全種、不正ID、immutability、冪等精算、revision競合、書込失敗、complete / partial / aborted帰還、2訪問の累積契約、Porter復元、残置relay、render・Rapier・navigation一致を検証した
- `npm run build`: PASS、`npm ls --depth=0`: PASS、`git diff --check`: PASS
- 遅延チャンクはMachineFeedbackAudio 1.52 kB、MissionSession 7.88 kB、探索ビュー8.37 kB、Porter 9.18 kB、固定マップ9.79 kB、ScoutDrone 19.21 kB。固定マップと機械処理のdynamic import境界を維持した

### 保存設計と中断境界

- `WorldDefinition`は作者定義のimmutableデータ、`PersistedWorldStateV1`は訪問間スナップショットであり、ランタイムのThree.js UUID、Rapierハンドル、生成順、Map、Setを保存しない
- schemaVersion 1はworld identity、revision、visitCount、traversal、machine relation、安全アンカー、固有資源、残置装備、証拠、契約、適用済みsettlement ID、直近outcomeを保存する
- `WorldDelta`はPorter友好化、経路開放、装備残置・回収、固有資源抽出、証拠発見、契約目的回収を純粋関数へ渡す。ID不整合や不正transformは構造化違反となり、元スナップショットへ部分適用しない
- settlementは`expectedRevision`を先に検査し、同じsettlement IDの再送をduplicateとして扱う。成功時だけrevisionとvisitCountを1増加し、新規貨物・回収装備・契約完了をeffectsとして一度だけ返す
- IndexedDBは世界スナップショットのread、revision判定、writeを同じreadwrite transactionで行う。codecはunknownから検証し、破損・必須フィールド欠落・未来schemaを正常値として上書きせずsafe modeと診断へ送る。version 1から先は明示migrationを追加する境界だけを置き、推測変換は行わない
- complete / partial / abortedの帰還操作は成立済みdeltaを精算できる。クラッシュ、強制終了、ページ再読込、ロード途中終了では未精算deltaを保存せず、基底revisionを維持する。ミッション途中再開はフェーズFの対象外
- `ItemLocation`を所在の唯一の真実源として維持する。残置relayは同じItemInstanceIdで復元され船内在庫と二重化せず、回収帰還後だけ世界から削除して船内へ戻る。無効位置はnavigation投影、失敗時は作者定義安全アンカーへ修復し診断を残す
- traversalはWorldStateロード後、静的マップ生成、扉・チェーン状態、Rapierコライダー、navigation edgeの順で適用する。その後に残置装備、Porter、契約資源、通信グラフ、隊員を復元する
- Porterは初回認証後friendly、安全アンカー、支援訪問数を保存する。再訪はhandshakeを省き、端末なしでもfriendly presenceを維持する一方、`carry-to`は簡易端末がなければ拒絶する。Porter自身はゲート、船員、船内在庫へ追加しない
- 第1契約「浄水フィルター回収」3点はpartialを累積し、完了後に既存区域を使う第2契約「旧式リレーコア回収」3点を解禁する。回収済み固有資源は再生成せず、冷却コイルは契約外の任意固有資源として一度だけ回収できる
- `EvidenceState`は初回訪問IDを保持し、発見済み証拠を船内資料へ残す。再訪projectionから既発見証拠を除外し、初回通知を繰り返さない
- 折り畳み式船内パネルに継続情報を限定し、世界リセットは確認後に固定世界だけを初期化する。実ブラウザでディザリングをOFFにした後もOFFが保持され、描画・音声・操作設定をリセットしないことを確認した

### 3訪問とリロードの実ブラウザ検証

- 第1訪問: Porterを端末で認証し、バールで冷却設備室の扉を開放、active relayを残置、浄水フィルター2/3でpartial帰還。船内で`VISIT 1 / REV 1`、契約2/3、friendly 1、opened route 1、left equipment 1を確認した
- リロード後: `WORLD MEMORY RESTORED // VISIT 1 · REV 1`を確認。第2訪問は回収済みフィルター2点を生成せず残り1点だけを要求し、扉の描画・コライダー・navigation edge、Porter friendly安全アンカー、`LINK RECOGNIZED`、relay位置とactive状態を復元した。handshakeなしでPorterを利用でき、relayを回収してフィルター契約をcomplete、`VISIT 2 / REV 2`で第2契約を解禁した
- 第3訪問: 第1契約の固有資源を再生成せず、旧式リレーコア3点を回収して第2契約をcomplete。Porter関係を維持し、証拠「濡れた搬入記録」を初回だけ共有して`VISIT 3 / REV 3`へ帰還した。船内資料、全契約完了、friendly contact、opened route、残置装備0を確認した
- 追加の未精算第4訪問で同じ証拠区域を探索し、`NO SHARED REPORT`となって初回通知が重複しないことを確認した。そのままリロードすると世界は`VISIT 3 / REV 3`のままで、未精算訪問、貨物、報酬、装備、証拠が増えていない
- 第2訪問前と第3訪問前にも進行中リロードを実施し、未精算deltaが破棄され基底revisionが維持されることを確認した。各帰還通知、契約進捗、回収装備は操作1回につき1回だけ反映された
- 世界リセット後は`VISIT 0`、第1契約0/3、friendly 0、opened route 0、left equipment 0、evidence 0へ戻り、ディザリングOFFは保持された
- ブラウザコンソールerror・未処理例外は0。warningは既知のRapier初期化非推奨1種類だけだった

### 3訪問後のリソース・DOM計測

| 項目 | 第3訪問帰還・リロード後 |
| --- | ---: |
| Rapier rigid bodies / colliders / contacts | 1 / 12 / 1 |
| Scene objects | 60 |
| WebGL draw calls / triangles | 66 / 1,468 |
| renderer.info.memory geometries | 47 |
| renderer.info.memory textures | 3 |
| renderer.info.programs | 4 |
| DOM totalNodes | 117 |
| DOM persistentHudNodes | 67 |
| DOM modalNodes | 0 |
| DOM transientFeedbackNodes | 0 |
| DOM resultHistoryNodes | 0 |

開発リセット後にも同じRapier 1 / 12 / 1、Scene 60、WebGL 66 / 1,468、geometry 47、texture 3、program 4、DOM 117 / HUD 67 / modal 0 / transient 0を確認した。訪問間でRapier、Scene、GPU memory、DOMカテゴリの単調増加やイベント重複は観測されなかった。

初期チャンクは2,900.15 kB（gzip 1,017.94 kB）で、Phase Eの2,876.58 kB（gzip 1,011.02 kB）から23.57 kB（gzip 6.92 kB）増加した。Viteの500 kB警告は継続し、閾値は変更していない。Rapier開発実行時の `using deprecated parameters for the initialization function; pass a single object instead` も依存側の既知警告として継続しており、今回の固定60 Hz物理、復元コライダー、3訪問には影響しなかった。

## 残課題

| 目的 | 影響 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| フェーズGの探索深化 | 固定世界と2契約は永続化したが、複数敵協調、プロシージャル生成、ミッション途中再開はない | schemaVersion 1、WorldDelta、ItemLocation、settlement revision境界を維持し、新規ゲーム機構を1スライスずつ選ぶ | フェーズF完了・次スライス未定 | ゲームデザイン / シミュレーション | 人間評価後にフェーズGの目的を1つに絞って仕様化する |
| 保存migration実装 | schemaVersion 1以外は安全に拒絶するため、将来schemaをまだ読み込めない | versionごとの明示migrationとfixtureを追加し、破損値を推測変換しない | migration境界のみ実装・非ブロッキング | 保存基盤 | schemaVersion 2が必要になった時点でv1 fixtureからの移行テストを先に追加する |
| 初期バンドル分割 | 初回ダウンロードが大きい | Three.js/Rapierのvendor分割、実機起動計測、キャッシュ戦略 | 非ブロッキング | 将来の性能作業 | 現在のdynamic import境界を維持して実測後に分割方針を決める |
| Rapier非推奨警告の解消 | 開発コンソールに警告が残る | 依存版と初期化APIの互換性確認 | 非ブロッキング | 依存更新作業 | Rapier更新時に移行を再評価する |
| 人間による感覚評価 | 自動検証では復元要約の密度、契約テンポ、脅威圧、音量、視認性、搬送速度の最終判断はできない | 3訪問のデスクトップ実機プレイと、警告・再評価・退避音をミュートなしで評価する | 実装済み・人間評価待ち | ゲームデザイン / UX | partial→reload→complete→第2契約を通し、調整値と文言だけをデータ定義・UIへ反映する |

オンライン同期、HP、死亡、銃撃戦、敵による偽通信・音声模倣、Porterのカート操作、複数敵協調、プロシージャル世界、ミッション途中再開は実装していません。フェーズFは不変マニフェスト、ItemLocation、NavigationService、CommunicationGraph、分隊知識を維持したまま、固定世界の帰還精算と再訪復元までです。

## アセット方針

実行時の3Dアセットは `src/game/content/assetManifest.ts` の安定キーを介したGLB/glTF 2.0を前提とします。現段階はプリミティブ表示で、制作アセットへ置換する前にコリジョンプロキシと最適化規約を確定します。
