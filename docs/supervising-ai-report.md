# 監修役AI向け現状報告

更新日時: 2026-07-23 JST

## 監修結論

Phase G「協調する敵対機械Security Cell」は、Phase F基準点をtagで保全した専用branch `feat/phase-g-security-cell` 上で、実装、自動回帰、production build、実ブラウザ、V1→V2実save移行、reload、world reset、3訪問resource計測まで完了しています。ローカルコミット件名は `feat: coordinate hostile machine security cells` です。

技術上のmust-fixは現在ありません。ただし製品受入は未完了です。自動ブラウザを `audio=muted` で実行したため、watcherの視覚的な瞬時識別、共有chirpの音量と意味、孤立時の圧力テンポ、援軍時の攻撃解除・退避の自然さは人間所有です。この評価を通すまでは、Phase Gをrelease acceptedと扱わず、調整値を最終値と断定しないでください。

push、PR作成・更新、main統合、deploy、releaseは行っていません。Phase G実装許可からこれらを推論してはいけません。

## Git・保全状態

| 項目 | 確認値 | 判定 |
| --- | --- | --- |
| Phase F exact commit | `1e98860597ac940ff8d47505a5b00736d852c43a` | 実在・live baseline PASS |
| Phase F保全tag | `phase-f-world-persistence` → `1e988605...` | 新規lightweight tag、上書きなし |
| Phase G branch | `feat/phase-g-security-cell` | `4e3cdc66d357e8054d45e0a42c4f41f166087b20`から安全に分岐 |
| origin feature先端 | `d25a9c04c277d5d4728904a11429f45413599a83` | fetch済み基準 |
| 分岐前parity | origin unique 0 / local unique 2 | remote未取込なし、既存local docs 2件を保全 |
| main parity | local main 0 / origin main 0 | PASS |
| Phase G commit | 現branch HEAD、件名 `feat: coordinate hostile machine security cells` | local-only |
| push / PR / deploy | 0件 | 指示どおり未実施 |

Phase F baselineではNode `v24.13.0`、npm `11.6.2`、型検査、24ファイル122テスト、build、`npm ls --depth=0`、`git diff --check`を実装前に再実行してPASSを確認しました。その後だけtagとbranchを作成しています。既存branch、tag、履歴の削除・強制更新・rebaseは行っていません。

## 実装範囲

### WorldState V2とmigration

- `PersistedWorldStateV2` はV1のworld identity、revision、visitCount、traversal、Porter関係と支援回数、unique item、残置equipment、evidence、contract、applied settlement ID、last outcomeを全て維持する
- 新規 `securityState` は `routine` / `watchful`、確認接触訪問数、最終確認contact visit ID、`flare-observed` / `field-relay-observed` / `porter-support-observed` / `opened-traversal-observed` tagだけを保存する
- V1はunknown入力検証後にV2へ明示migrationし、IndexedDBの既存store `world-state-v1` と同じworld keyへV2を書き戻す。store名は内部互換性のため変更しない
- V2 JSON round-trip、V1 fixture、破損・欠落・未来schemaのsafe modeを維持する。推測補完しない
- runtimeの機体位置、task、lock、cooldown、local/shared knowledge、Map、Set、Three UUID、Rapier handleは保存しない

### 永続警戒姿勢

- `routine`: needle `machine:security:needle-01` 1機
- `watchful`: 同needle + watcher `machine:security:watcher-01` の固定2機
- 一定時間の直接視認、lock開始、interference hit、active relay認識、Porter支援隊員認識を確認接触候補にする
- 訪問中はdeltaだけを作り、`complete` / `partial` / `aborted` の帰還settlementで永続化する。未精算reload / crashでは基底postureを維持する
- settlement ID冪等性により同じ帰還の再送はcontact count、revision、visitCountを増やさない
- contact visitが増えてもwatchful 2機を上限とする。world resetはV2 `routine` / count 0へ戻す

### 個体知識・敵リンク・共有blackboard

- 各機の `HostileMachineKnowledge` がlocal factとpending broadcastを所有し、直接認識したagent / flare / relay / friendly machineだけを事実化する
- factは安定ID、source machine、target、position、observed time、confidence、uncertainty radius、expiry、direct flagを持つ
- confidenceは固定周期で減衰、uncertaintyは拡大し、TTL後に破棄する。shared factも同じ時間モデルで劣化する
- `HostileMachineLinkGraph` はplayer通信から独立し、基本32 m、SignalZone・隔壁減衰、3 Hz再評価、品質別delayを扱う。player relayを敵linkの中継に使わない
- link断では共有revisionが進まずpendingを保持し、再接続後にTTL内だけ配送する
- `SecurityBlackboard` は配送済みshared fact、current assignment、task reservation、pressure tokenだけを保持する。未共有watcher factをneedleへ直接渡さない
- fact失効時は依存taskとreservationを解放する。古いshared positionだけではlockできず、needleはinterference前に直接視認を再取得する

### 分業・予約・圧力

- watcher: observe-agent、investigate-flare、maintain-overwatch、regroup、disengage、patrol。直接interferenceしない
- needle: observe-agent、interdict-agent、investigate-flare、sabotage-relay、regroup、disengage、patrol
- allocatorは能力、距離、到達性、confidence、存在量、現task継続、既存予約、安全域を2 Hzで評価し、同値は安定ID順にする
- 一人へのinterdict、一つのrelayへのsabotage、同一agentへのlock-onを各1機へ制限する
- lock、interdiction、relay sabotageの同時上限は各1、interference後graceは4秒
- cautiousは距離を保って監視し、新規lock / sabotageを開始しない。outnumberedは全攻撃taskとtokenを解除し、セルで共通退避する
- active relay場面ではneedleがsabotage、watcherがoverwatchを同時に担当できる。矛盾taskを同じ機体へ持たせない

### Presence・navigation・projection

- presence weightはagent 1.0、friendly Porter 0.75、needle 1.0、watcher 0.5
- watchfulの期待bandはagent 1=`predatory`、agent 1+Porter=`cautious`、agent 2=`cautious`、agent 2+Porter=`outnumbered`、agent 3=`outnumbered`
- 認識不能な隔壁越しagentは算入しない。Porterは直接認識時だけfact化し、攻撃・損傷・破壊しない
- WorldStateから復元したopened door / cut chainを敵A*にも反映し、closed traversalを通さない。描画、Rapier、味方A*、敵A*を同じ状態へ同期する
- watcherは高所overwatch node、needleと異なる幅広シルエット、高い高度、広角amber scanを持ち、細いlock beamを使わない
- 初回mesh共有だけ簡易端末へ `HOSTILE MESH DETECTED / CONTACT SHARED / 2 SECURITY NODES / TASKS DIVERGED` を表示する。通常HUDには内部blackboardを常駐させず、F1へ診断を出す

## 自動検証

| Gate | 結果 | 実測 |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript `tsc --noEmit` |
| `npm test -- --run` | PASS | 26ファイル / 151テスト |
| `npm run build` | PASS | Vite 8.1.5、69 modules transformed |
| `npm ls --depth=0` | PASS | top-level 6依存整合 |
| `git diff --check` | PASS | 空白errorなし。WindowsのLF→CRLF noticeのみ |

自動テストはV1→V2、V1全field維持、V2 round-trip、safe mode、初期routine、contact→watchful、重複settlement、未精算非更新、reset、watchful上限、個体知識、link遅延・断・再接続、confidence / uncertainty / TTL、古い位置からのlock禁止、役割分担、予約、到達不能、fact失効、安定割当、hysteresis、grace、cautious、outnumbered、安全域、援軍、5通りのpresence、開閉経路、Porter / relay / contract / evidence / cart / interference回帰を含みます。

長時間更新テストではoutnumbered解除を毎tick再適用してtransition revisionを増殖させないこと、shared factが固定周期で実際に減衰することも固定しました。

## Buildと遅延境界

| chunk | minified | gzip |
| --- | ---: | ---: |
| initial `index` | 2,904.36 kB | 1,019.06 kB |
| `SecurityCellController` | 44.38 kB | 11.89 kB |
| `MachineFeedbackAudio` | 1.75 kB | 0.80 kB |
| `MissionSession` | 7.88 kB | 2.90 kB |
| `PorterAndroidController` | 9.18 kB | 3.25 kB |
| `floodedMarket` | 9.80 kB | 2.68 kB |
| `createFloodedMarket` | 9.81 kB | 3.54 kB |

Security Cell、watcher調整、機械audio、mission viewは船内初期chunkから分離されています。Viteの500 kB warningは残りますが閾値を変更していません。

## 実ブラウザ検証

### 保存・姿勢・3訪問

- routineでneedle 1機を確認し、直接接触後の帰還でV2 revision 1 / visit 1 / watchful / confirmed contact 1になった
- reload後もwatchfulとcontact 1を維持し、以後はneedle + watcherの2機。接触回数や訪問数を増やしても3機目を生成しない
- 実browserへrevision 7 / visit 3、contract進捗、Porter friendly / assisted 2、opened traversal、left-behind relay、evidence、settlement IDを含むV1 fixtureを投入した。reload後、runtimeとIndexedDB raw値の双方がV2となり、全項目を維持した
- world reset後はV2 revision 0 / visit 0 / routine / contact 0、初期contract、unknown Porter、closed traversal、evidence 0へ戻った
- reset後の別3訪問で、filter 1点の`partial`、残り2点で第1contractを閉じる`complete`、資源0点の`aborted`を順に実行。revision / visitは1→2→3、last outcomeは各結果へ更新し、settlementを各1回だけ適用した

### 協調・圧力

- watchfulのhostile link quality 0.782、遅延後のshared fact、初回mesh notificationを確認
- link suppression中はconnected false / quality 0でshared revisionが停止し、復旧後だけTTL内factを共有した
- shared agent factは視線喪失後1.6秒の実browser readbackでconfidence 0.964→0.820、uncertainty 0.168→0.840へ変化した。直接再視認前のlock禁止はunit + integration testで固定
- isolated agentでは一機だけがlock tokenを取得。reinforcement到着で進行lockとtokenを解除した
- interference後4秒grace中は再lockせず、期限後かつ直接視認がある場合だけ再開した
- active relay時はneedle=`sabotage-relay`、watcher=`maintain-overwatch`、reservationはrelay一件だけ。flareは直接認識時だけfact化し、確実なagent sightingがない場合のinvestigate分岐をtestで確認
- presenceはagent 1 predatory、agent 1+Porter cautious、agent 2 cautious、agent 2+Porter outnumbered、agent 3 outnumberedをbrowser readbackで確認。outnumberedでセル攻撃解除・退避、Porter relationはfriendlyのまま維持した
- opened traversalをenemy navigationへ反映し、closed pathを拒絶することをbrowser診断と自動testで照合した

### resource・console

3訪問帰還後、通常reloadした船内値です。

| 項目 | 値 |
| --- | ---: |
| Rapier bodies / colliders / contacts | 1 / 12 / 1 |
| Scene objects | 60 |
| WebGL calls / triangles | 60 / 1,416 |
| geometry / texture / program | 43 / 3 / 4 |
| DOM total / HUD / modal / transient / history | 119 / 67 / 0 / 0 / 0 |

各帰還のQA readbackでもScene 60とGPU memory 43 / 3 / 4を維持し、event、notice、settlement、DOM、物理、sceneの単調増殖を観測しませんでした。現pageのconsole error 0、page error / 未処理例外0です。warningはRapier互換package由来の `using deprecated parameters for the initialization function; pass a single object instead` 1種類だけです。強制navigationで破棄した旧WebGL contextのbrowser履歴warningはありましたが、reset後の現pageには残っていません。

QA用保存fixture、スクリーンショット、Playwright logはrepositoryへ残さず、最後にworldをresetしてV2 routineをreload確認し、dev serverを停止しました。

## 受入監査

| 区分 | 判定 |
| --- | --- |
| must-fix before technical handoff | なし |
| verified | source boundary、V2 migration、151 tests、build、実browser systems、3 outcomes、reload/reset、resource復帰、console error 0 |
| acceptable debt | Vite大chunk warning、Rapier既知warning、production device性能未計測、CI証跡なし |
| human-owned | watcher識別、chirp、lock/interference音量、圧力tempo、退避の自然さ、文言密度 |
| owner-only | push、PR、merge、deploy、release、rights、配布先、rollback承認 |

## 完成度の目安

| 対象 | 目安 | 根拠 |
| --- | --- | --- |
| Phase G technical slice | `██████████ 100%` | 指定実装、自動gate、browser、migration、reset、resource、docs、local commit |
| Phase G product acceptance | `████████░░ 80%` | 機械検証は完了、ミュートなし感覚評価が未完了 |
| 主要vertical loop | `███████░░░ 約70%` | 編成、探索、分隊、機械生態系、継続世界、敵協調が成立。第2世界、中断耐性、hardeningは未着手 |
| release readiness | `████░░░░░░ 約40%` | rights、production asset、device matrix、accessibility、CI/review、配布・rollback判断が未完了 |

目安は工数予測でも公開許可でもありません。各gateの証拠充足度です。

## 今後の目標提案

前段を通った場合だけ次段へ進む、可能な限り先の条件付きロードマップです。

| 段階 | 目的 | 完了条件 | 依存・停止条件 | 主担当 |
| --- | --- | --- | --- | --- |
| Gate G-A | Phase G人間受入 | ミュートなしでroutine→watchful、共有、孤立lock、援軍解除、outnumbered退避を通し、4観点をaccepted / tuning / blocking分類 | blockingならPhase Hへ進まずG修正 | game design / UX |
| G-Tune | 限定調整 | radius、delay、chirp、scan、UI文言だけを観察根拠で調整し、151+回帰とbrowserを維持 | 状態所有変更が必要なら別slice | gameplay tuning |
| Phase H | 契約・証拠の因果深化 | 1訪問の選択が次訪問の目的・経路・支援の1つを変え、船内要約とV2 saveが一致 | 1目的。敵数追加・新世界・途中再開を混ぜない | design + world state |
| Phase I | 第2作者定義世界 | WorldDefinition、安定ID、safe anchor、contract、Security Cell、disposeを再利用し、世界別saveを混同しない | Hで再訪動機accepted。抽象先行禁止 | content + world projection |
| Phase J | 中断耐性 | 訪問中一時snapshotをsettlementと分離し、二重精算なしでresume / discardできる | 訪問時間が実測上の問題であること | save + lifecycle |
| Phase K | save互換hardening | V2 fixture corpus、必要時のみV3 migration、backup/export、破損診断、future schema拒絶を版ごとに検証 | 実V3データ要件。runtime AI状態を保存しない | persistence |
| Phase L | 制約付きvariation | 2つ以上の作者定義世界で実証済みのsemantic ID、到達性、safe anchorを守るseeded variation | 到達性・migrationが保証不能なら作者定義へ戻す | generation + QA |
| Beta hardening | device品質 | cold/warm/revisit load、frame budget、keyboard、pointer lock、audio、save recovery、長時間resourceに数値budget | 主要loop凍結 | performance / accessibility / QA |
| Content/asset pass | 製品表現 | rights確認済みasset、GLB/glTF budget、collision proxy、LOD/audio mixを導入しprimitive contractを維持 | rights不明なら導入しない | art / tech art / owner |
| Release candidate | 配布候補 | CI、human review、save compatibility、known issues、rollback、versioning、rightsを証拠付きで承認 | push/PR/mergeは個別承認 | owner / reviewer / QA |
| Launch gate | 外部配布判断 | 配布先、署名、privacy、rights、support、rollbackをオーナーが明示承認 | 技術成功から自動承認しない | owner only |
| Post-launch | 継続運用 | crash/save corruption triage、fixture、release note、rollback基準を版ごとに維持 | 公開された場合だけ | owner / maintenance |

### ロードマップ停止条件

- 1 Phaseでworld settlement、ItemLocation、communication、navigationの2つ以上を同時再設計し始めたら分割する
- 人間観察の最大問題とPhase目的が一致しなければ着手しない
- enemyが未共有player stateを読む、watchful 2機を越える、HP・射撃へ軸を変える場合はPhase G不変条件違反として停止する
- schema変更に具体的保存fieldとfixtureがなければV2を維持する
- procedural variationがstable ID、reachability、safe anchorを保証できなければ作者定義世界へ戻す
- Vite warningだけで性能作業を始めず、実機cold / warm / revisitを先に測る
- technical PASSをrights、release、public approvalとして扱わない

## 残作業台帳

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase G感覚評価 | 技術証跡で決められない視覚・音・tempoを確定する | ミュートなしdesktop、4観点メモ | 待ち | 人間game design / UX | Gate G-Aチェックを1回実施する |
| Phase H承認 | 次sliceを最大課題へ集中する | Gate G-A結果、目的1文、受入、非対象、停止条件 | 未承認 | owner / supervising AI | acceptedならH候補を1つだけ選ぶ |
| remote portability | 別端末でPhase G HEAD/tagから再開する | local commit review、明示push権限、push後parity | local-only | owner | 承認時だけbranchとtagをpushする |
| PR / main統合 | review可能な統合単位を作る | G-A、CI方針、差分review、rollback | 未実施 | owner / reviewer | 既存draft PR更新か新PRかを選ぶ |
| device performance | chunk warningの実影響を判断する | cold / warm / revisit、frame、memoryの実機値 | 未計測・非ブロッキング | performance | 問題端末で計測する |
| Rapier warning | 開発warningを安全に除去する | dependency/API互換と全物理回帰 | 非ブロッキング | dependency maintenance | 更新専用sliceで扱う |
| CI | local gateをPRで再現する | typecheck/test/build workflow | 未設定 | repo owner | merge方針時に必要性を判断する |
| rights / assets | 製品assetを合法・予算内で導入する | provenance、license、budget、collision proxy | primitive段階 | owner / art | gameplay loop凍結後に審査する |
| deploy / release | 外部配布する | review、rights、quality、target、rollbackの明示承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIが最初に行うこと

1. `PROJECT_HANDOFF.md`、本文書、`docs/project-context.md`、READMEのPhase G節を読む。
2. `git status -sb` がclean、現branch、HEAD件名、Phase F tag参照先を確認する。
3. 必要なら5つの最終gateを直列再実行する。save fixtureやbrowser artifactをrepoへ持ち込まない。
4. Phase G人間評価メモを探す。なければ音量・scan幅・距離・delayを最終調整しない。
5. メモがあればGate G-Aを判定し、blockingならPhase Gだけを修正、acceptedならPhase Hを1目的だけ提案する。
6. push、PR、merge、deploy、releaseはそれぞれ明示権限を確認する。

## 監修役AIへの判断依頼

次の判断はPhase Gの感覚受入だけです。

**観測機の識別性、共有chirp、孤立時の圧力、援軍時の解除・退避をミュートなしで確認し、Phase Gをaccepted / tuning / blockingのどれに分類するか。**

acceptedの場合のみ、Phase H第一候補を「契約・証拠・再訪判断の因果深化」として1スライスに仕様化することを提案します。この判断にpush、PR、merge、deployment、public releaseの許可は含みません。
