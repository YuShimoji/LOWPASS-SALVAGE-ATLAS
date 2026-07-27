# Decision Log

この文書は確定済みの設計判断だけを記録します。検討中の案は `idea-ledger.md`、実装・検証の詳細は `README.md` に置きます。

## 2026-07-28 — Phase Gの自動受入と人間感覚レビューを分離する

- 決定: camera orbit、Guided QA、22段階audit、semantic cueと字幕が自動・ブラウザ証拠を満たした時点を `PHASE_G_AUTOMATED_ACCEPTANCE_GREEN` とし、音量・音色・疲労感と最終game feelは `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING` とする
- 理由: 既に人間PASSのmovement、zoom、cart、外観を再び必須停止へ戻さず、機械判定可能な因果・操作・非無音・字幕を再現可能な証拠で閉じるため
- 帰結: `GATE_G_A_RETEST_REQUIRED` は履歴へ移す。human sensory PASS、production audio complete、final game feel acceptedとは記録せず、観測事実なしに距離、delay、scan、lock、pressureを調整しない。Phase Hは別承認

## 2026-07-28 — Canaryをsimulation非所有の内部visual packとして統合する

- 決定: `AssetPackRegistry` でprimitive / canary-v1を選択し、exact hash検証済みGLBをmission chunkで遅延loadする。Needle、Watcher、Porter、Shopping cart、Field terminalは既存simulation stateを投影するvisual adapterとし、load失敗時はprimitiveへfallbackする
- 理由: CGAWのstable node / material / anchor契約をconsumer側で実証しながら、GLB transformやcollision proxyをgameplay authorityへ昇格せず、primitive経路を回帰基準として保持するため
- 帰結: source packageをproduction dependencyにせず、import時に絶対pathを除去する。rights `NOASSERTION`、internal only、distribution未承認を固定し、UV、texture、Blender、rights、production approvalは別gateとする

## 2026-07-26 — 感覚評価を停止し、playability baselineを先に復旧する

- 決定: Gate G-Aを `GATE_G_A_BLOCKED_BY_PLAYABILITY_BASELINE` とし、Phase Gの感覚調整とPhase Hを停止してkeyboard、Gamepad、camera distance、push-cartを独立recovery branchで復旧する
- 理由: 移動、視認、搬送が成立しない状態ではwatcher、chirp、圧力、退避の感覚評価が有効な製品判断にならないため
- 帰結: recoveryのtechnical PASS後もPhase Gは未受入で、次は `GATE_G_A_RETEST_REQUIRED`。Security Cellの距離、共有delay、scan、音、文言、WorldState V2、migration、settlement、ItemLocation、敵知識、圧力予算は変更しない

## 2026-07-26 — 入力とカートの真実源を明示する

- 決定: keyboardはphysical code、Gamepadは標準API sample、cartはMissionSession stateとcollision-limited kinematic pairを真実源にし、logical action、Three表示、Rapier位置を投影として扱う
- 理由: alias keyup、pointer lock拒否、camera-relative strafe、割合追従による操作不整合を、保存やSecurity Cell責務へ波及させず解消するため
- 帰結: ItemLocation、資源積載、抽出契約は維持し、四輪dynamic body、振動、完全menu navigationは非対象とする

## 2026-07-24 — Phase G branchとPhase F保全tagをremote portabilityのためpushする

- 決定: オーナーの明示依頼「ローカルをリモートに反映」に基づき、`feat/phase-g-security-cell` と `phase-f-world-persistence` tagをoriginへpushする
- 理由: 別端末からPhase Gの同じ履歴とPhase F保全基準を取得して再開できるようにするため
- 帰結: 現branchと `origin/feat/phase-g-security-cell` は0 / 0、tagも同一参照。PR更新、main統合、deploy、release、public acceptanceはこのpushから推論せず別gateとして残す

## 2026-07-23 — Phase Gを固定上限のSecurity Cellとして実装する

- 決定: オーナーの明示実装指示により、Phase Gを監視針1機と観測機1機からなる固定上限の敵対セルへ限定する
- 理由: 情報共有、孤立、援軍、relay、Porterという既存システムを深めつつ、HP・死亡・射撃・無制限敵生成へ軸を移さないため
- 帰結: routineは1機、watchfulは2機を上限とし、個体知識、敵link、blackboard、task予約、圧力予算を別責務にする。Phase Hへ敵数増加を自動継承しない

## 2026-07-23 — 永続security summaryと訪問中runtimeを分離する

- 決定: V2へposture、確認接触訪問数、最終接触visit ID、観測戦術tagだけを保存し、機体位置、task、lock、cooldown、local/shared factは保存しない
- 理由: 訪問間の学習効果を残しながら、生成順や一時AI状態をsave authorityへ昇格させないため
- 帰結: V1の全フィールドは明示migrationで維持し、接触は帰還settlementだけで精算、world resetはV2 routineへ戻す

## 2026-07-23 — 敵は観測・敵リンクで得た情報だけを使う

- 決定: local factは直接認識から生成し、shared factは独立敵リンクの遅延配送だけでblackboardへ入れる。古い共有位置ではlockせず、needleが直接視認を再取得する
- 理由: 全知AIを避け、watcherの観測とneedleの行動の因果をプレイヤーが妨害・利用できるようにするため
- 帰結: link切断時はpending、再接続時はTTL内だけ共有し、confidence減衰・uncertainty拡大・失効時のtask/予約解除を必須とする

## 2026-07-23 — 圧力を予約とtokenで上限化する

- 決定: 同一隊員へのlock、同時interdiction、同時relay sabotageを各1へ制限し、干渉後4秒graceを設ける
- 理由: 2機協調を即時連続妨害へ変えず、援軍とPorterを意味のある非致死的な対抗手段にするため
- 帰結: cautiousは新規攻撃を保留し、outnumberedはセル全体の攻撃を解除して共通退避する。watcherはinterdict担当にならない

## 2026-07-22 — Phase Gを人間評価後の単一目的に限定する（2026-07-23にオーナー指示で選定済み）

- 決定: Phase Fの自動・ブラウザ受入とPhase Gの体験方向選定を分け、ミュートなしの人間評価後に目的を1つだけ承認する
- 理由: 自動検証では復元要約、契約テンポ、脅威圧、音量、視認性、搬送速度の感覚品質を最終判断できず、複数機構の同時追加は原因と効果を曖昧にするため
- 帰結: 2026-07-23の明示指示がPhase G目的をSecurity Cellへ確定した。PR merge、公開、deployment、releaseは引き続き別判断であり、この選定から推論しない

## 2026-07-21 — 帰還精算を唯一の永続化境界にする

- 決定: `complete` / `partial` / `aborted` の帰還操作で成立した `WorldDelta` だけを永続化する
- 理由: 訪問中クラッシュやリロードからの推測復元を避け、貨物、報酬、装備、証拠の二重計上を防ぐ
- 帰結: ミッション途中再開はPhase F対象外。進行中リロードは基底revisionへ戻る

## 2026-07-21 — 保存値は安定した作者定義IDに限定する

- 決定: Three.js UUID、Rapier handle、生成順、`Map`、`Set` を保存しない
- 理由: ランタイム実装や生成順の変更からセーブデータを分離する
- 帰結: `WorldDefinition` とschemaVersion付きsnapshotを分け、復元時に表示・物理・navigationへ投影する

## 2026-07-21 — settlementをrevisionとIDで冪等化する

- 決定: 新規settlementは `expectedRevision` を検査し、既適用settlement IDの再送をduplicate successとして扱う
- 理由: 競合更新と再送による二重反映を同時に防ぐ
- 帰結: 成功時だけrevision / visitCountを1増加し、effectsを一度だけ返す

## 2026-07-21 — 保存codecはfail-closedにする

- 決定: 破損、必須フィールド欠落、未来schemaを推測変換せずsafe modeへ送る
- 理由: 一見正常な値への上書きがプレイヤー資産を不可逆に壊すため
- 帰結: schemaVersion 2が必要になるまでmigration実装は行わず、入口だけ維持する

## 2026-07-20〜21 — ItemLocationを唯一の所在表現にする

- 決定: 装備、資源、カート、Porter搬送、残置relayの所在を判別共用体で表す
- 理由: Mesh位置、物理body、船内配列、世界snapshotの多重所有を防ぐ
- 帰結: 予約、搬送、帰還精算、再訪復元は同じItemInstanceを遷移させる

## 2026-07-20〜21 — 表示・物理・navigationはゲーム状態の投影にする

- 決定: Three.jsとRapierはルールを所有せず、扉・チェーン・relay・隊員・Porterを同じ状態から同期する
- 理由: 見た目だけ開く、colliderだけ残る、経路だけ通れる不整合を防ぐ
- 帰結: 復元順序はworld load → static map → traversal / collider / navigation → equipment / machine / contract / communication / squadとする

## 2026-07-20 — 固定周波数と決定論的手書き世界を優先する

- 決定: 物理60 Hz、通信4 Hz、敵知覚・存在量5 Hzを使い、固定anchorと手書きwaypoint graphを採用する
- 理由: 繰り返し可能なテストとプレイヤー判断の説明可能性を先に確立する
- 帰結: プロシージャル生成と複数敵協調は将来候補に留める

## 2026-07-20〜21 — 脅威は非致死的な情報・物流妨害として作る

- 決定: 敵対ドローンはlock-on、通信干渉、片手資源落下、relay妨害を行い、HP、死亡、銃撃を導入しない
- 理由: 通信・孤立・搬送のシステムを主役にし、戦闘ゲームへ軸を移さない
- 帰結: 抽出ビーコンは安全域、Porterは友好化可能な現地支援機として残る

## 2026-07-20 — ミッション境界を遅延ロード・明示破棄する

- 決定: ミッション定義、探索ビュー、機械固有処理をdynamic importし、帰還時に専用資源をdisposeする
- 理由: 船内復帰後の物理・DOM・イベント増殖を防ぎ、初期船内ロードから機械処理を分離する
- 帰結: 連続往復でcollider、scene object、DOM nodeが基準値へ戻ることを受入条件に含める
