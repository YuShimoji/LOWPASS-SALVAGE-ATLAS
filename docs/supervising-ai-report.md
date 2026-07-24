# 監修役AI向け現状報告

更新日: 2026-07-24 JST

## 監修結論

`LOWPASS: SALVAGE ATLAS` は、remoteにもpush済みの `feat/phase-g-security-cell` のPhase G実装commit `6df8ba0621baf8976fc56373863cf57565cc12ba` から開発再開可能です。2026-07-24にremoteを `git fetch --prune --tags origin` で再取得し、branch/tag push後のparity、依存整合、型検査、26ファイル151テスト、production build、diff check、開発URLのHTTP 200をライブ再確認しました。

remoteにはPhase G branchとPhase F tagが存在します。push前のローカルPhase Gは `origin/feat/phase-f-world-persistence` を4commit分包含していました。push後、現branchと `origin/feat/phase-g-security-cell` はremote unique 0 / local unique 0で、今回もmerge、rebase、branch切替、履歴書換えは不要でした。

技術的なrestart blockerはありません。ただし、Phase Gを製品としてacceptedとする前に、人間がミュートなしでwatcherの識別性、共有chirp、孤立時の圧力、援軍時のlock解除・退避を評価するGate G-Aが残っています。今回の明示依頼でbranch/tag pushは実施済みですが、PR更新、main統合、deploy、releaseは実施していません。

## 今回ライブ確認した事実

### Git・remote

| 項目 | 2026-07-24確認値 | 判定 |
| --- | --- | --- |
| repository | `YuShimoji/LOWPASS-SALVAGE-ATLAS` | public / archived=false |
| origin | `https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS.git` | fetch成功 |
| default branch | `main` | GitHubとlocalで一致 |
| local branch | `feat/phase-g-security-cell` | clean |
| Phase G implementation | `6df8ba0621baf8976fc56373863cf57565cc12ba` | 現branchの実装基準 |
| remote Phase G branch | `origin/feat/phase-g-security-cell` | localと0 / 0 |
| remote Phase F branch | `d25a9c04c277d5d4728904a11429f45413599a83` | remote最新 |
| local vs remote Phase F | remote unique 0 / local unique 4 | 本報告commit込み、remote未取込なし |
| local `main` vs `origin/main` | 0 / 0 | parity PASS |
| remote Phase F tag | `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` | local tagと同一 |
| local Phase F tag | `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` | 保全済み |
| draft PR #1 | OPEN / DRAFT / mergeable | Phase C〜Fのみ、Phase G未反映 |
| PR #1 checks | 0件 | CI証跡なし |

GitHub上のremote branchは `main`、Phase C〜G、およびPhase E途中branchです。今回の明示依頼によりPhase G branchとPhase F tagのpushは完了しました。PR更新、main統合、deploy、release、rights、rollbackは別gateであり、このpushから推論しません。

### 開発環境

| Gate | 結果 | 実測 |
| --- | --- | --- |
| Node | PASS | `v24.13.0` |
| npm | PASS | `11.6.2` |
| `npm ls --depth=0` | PASS | top-level 6依存整合 |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm test -- --run` | PASS | 26 files / 151 tests |
| `npm run build` | PASS | Vite 8.1.5 / 69 modules |
| `git diff --check` | PASS | whitespace error 0 |
| dev server | PASS | Vite ready / `127.0.0.1:5173` |
| QA URL HTTP | PASS | status 200 |
| HTML entry | PASS | title一致、module entryあり |
| server stop | PASS | smoke後に停止 |

`node_modules` は再インストール不要と判断しました。`npm ls` と実gateがすべて正常で、package manifest / lockにremote差分もないためです。

### production build

| chunk | minified | gzip |
| --- | ---: | ---: |
| initial `index` | 2,904.36 kB | 1,019.06 kB |
| `SecurityCellController` | 44.38 kB | 11.89 kB |
| `MachineFeedbackAudio` | 1.75 kB | 0.80 kB |
| `MissionSession` | 7.88 kB | 2.90 kB |
| `PorterAndroidController` | 9.18 kB | 3.25 kB |
| `floodedMarket` | 9.80 kB | 2.68 kB |
| `createFloodedMarket` | 9.81 kB | 3.54 kB |

Security Cell、機械audio、mission logic、固定map、探索viewのdynamic import境界は維持されています。Viteの500 kB warningは継続していますが、build errorではありません。warningを隠すための閾値変更はしていません。Rapier初期化warningはブラウザ実行時の既知dependency warningであり、今回HTTP smokeではブラウザruntimeを再操作していません。

## 現在の完成状態

### Phase Gで実装済み

- `PersistedWorldStateV2` とV1→V2明示migration
- 契約、Porter関係、traversal、残置relay、evidence、applied settlement ID、visitCount、revisionの維持
- 永続 `routine` / `watchful` と固定1機 / 2機上限
- needle `machine:security:needle-01` とwatcher `machine:security:watcher-01`
- 個体 `HostileMachineKnowledge`、pending broadcast、confidence / uncertainty / TTL
- player通信から独立した `HostileMachineLinkGraph`
- 遅延共有、link断中のlocal保持、再接続時TTL内flush
- `SecurityBlackboard`、決定論的task allocation、target / relay reservation
- 同時lock、interdiction、relay sabotage各1、干渉後4秒grace
- cautious時の新規攻撃保留、outnumbered時の全攻撃解除と共通退避
- opened traversalの敵A*反映と、render / Rapier / 味方A*との状態一致
- watcherの別silhouette、高高度、広角scan、共有chirp、初回mesh通知、F1診断
- `complete` / `partial` / `aborted` 帰還settlementでだけsecurity deltaを永続化
- world-only resetでV2 routineへ復帰

### 現在の主要不変条件

1. `ExpeditionManifest` は不変で、`MissionSession` を敵AI全責務へ肥大化させない。
2. `ItemLocation` はitem所在の唯一の真実源である。
3. Three.js UUID、Rapier handle、配列index、runtime task / knowledgeをsaveへ書かない。
4. 帰還settlementだけを永続化し、未精算visitを確定WorldStateへ混ぜない。
5. settlement revision / IDによる原子性と冪等性を維持する。
6. 敵は直接観測または敵linkで共有済みの情報だけを使い、古い共有位置だけではlockしない。
7. 通常敵数はroutine 1 / watchful 2を上限とする。
8. HP、死亡、射撃、Porter破壊、偽通信、音声模倣を追加しない。
9. render、physics、味方A*、敵A*、communicationは同じsimulation stateの投影である。
10. dynamic importと帰還時disposeを維持する。

## 既存のPhase Gブラウザ証跡

以下はPhase G実装commitを作成した2026-07-23の正本証跡です。今回の2026-07-24再開検証では再実施せず、コードが同じ `6df8ba0` であることと全自動gateを再確認しました。

- V1 fixtureからV2へ移行し、契約、Porter、opened traversal、relay、evidence、revisionを維持
- routineでneedle 1機、確認接触後の帰還でwatchfulへ移行
- reload後もwatchfulを維持し、needle + watcherの2機上限
- hostile link 0.782、遅延共有、link断中の非共有、復旧後のTTL内共有
- 視線喪失後1.6秒でshared fact confidence `0.964 → 0.820`、uncertainty `0.168 → 0.840`
- needleのrelay sabotageとwatcherのoverwatchを並行実行
- agent 1=`predatory`、agent 1+Porter / agent 2=`cautious`、agent 2+Porter / agent 3=`outnumbered`
- reinforcement到着でlockとpressure tokenを解除
- interference後4秒grace中の再lock禁止
- `partial → complete → aborted` の3visitでrevision / visit `1 → 2 → 3`
- world reset後にV2 routine / revision 0 / visit 0
- console error、page error、未処理例外0

3visit帰還後の通常reload値:

| 項目 | 値 |
| --- | ---: |
| Rapier bodies / colliders / contacts | 1 / 12 / 1 |
| Scene objects | 60 |
| WebGL calls / triangles | 60 / 1,416 |
| geometry / texture / program | 43 / 3 / 4 |
| DOM total / HUD / modal / transient / history | 119 / 67 / 0 / 0 / 0 |

詳細な手順と場面別結果はREADMEの「フェーズG Security Cellの検証結果 — 2026-07-23」を正本とします。

## 受入監査

| 区分 | 判定 |
| --- | --- |
| must-fix before development restart | なし |
| 今回verified | remote fetch、branch/tag/PR metadata、依存、型、151 tests、build、diff、HTTP entry、server stop |
| 既存証跡を再利用 | V1→V2 browser migration、3visit、敵cell分業、presence、grace、resource復帰 |
| acceptable debt | Vite大chunk warning、Rapier既知warning、PR CI未設定、production device性能未計測 |
| human-owned | watcher識別、chirp、lock/interference音量、圧力tempo、退避の自然さ |
| owner-only | PR方針、merge、deploy、release、rights、rollback |

## 完成度の目安

これは工数予測ではなく、証拠gateの充足度です。

| 対象 | 目安 | 根拠 |
| --- | --- | --- |
| Phase G technical slice | `██████████ 100%` | 実装、151 tests、build、browser証跡、save migration、resource復帰 |
| Phase G product acceptance | `████████░░ 80%` | 技術gate済み、ミュートなし人間評価待ち |
| development restart readiness | `██████████ 100%` | remote未取込0、clean、依存・自動gate・HTTP PASS |
| remote portability | `██████████ 100%` | Phase G branchとPhase F tagをpush済み、現branchとのparity 0 / 0 |
| major vertical loop | `███████░░░ 約70%` | 編成、探索、分隊、機械生態系、継続世界、敵協調が成立 |
| release readiness | `████░░░░░░ 約40%` | device matrix、accessibility、rights、CI/review、配布・rollback未完了 |

## 推奨する次の開発目標

### Gate G-A — Phase G人間受入

最優先です。ミュートなしdesktopで次を1回通し、各項目を `accepted` / `tuning` / `blocking` に分類します。

- routineとwatchfulでneedle / watcherを即時識別できるか
- 共有chirpが「敵同士の情報共有」として理解でき、音量が疲労を生まないか
- 孤立時のlock圧力に判断時間があり、理不尽な連続interferenceにならないか
- reinforcement / Porterでcautious、outnumberedへの変化を視覚・音・動きから理解できるか
- watcherのoverwatchとneedleのsabotageが役割分担として読めるか

blockingがあればPhase Hへ進まずPhase Gを修正します。tuningなら距離、delay、scan、chirp、UI文言だけを限定変更し、状態所有変更は別sliceへ送ります。

### Phase H候補 — 人間評価後に1つだけ選択

推奨順は次のとおりです。

| 候補 | 目的 | 強くなるもの | 主なtradeoff | 選ぶ条件 |
| --- | --- | --- | --- | --- |
| H1 契約・証拠の因果深化 | 1visitの選択が次visitの目的・経路・支援を変える | 継続世界と再訪判断 | content追加だけになりやすい | Phase Gがacceptedで、再訪動機が次の主要gap |
| H2 第2作者定義世界 | `WorldDefinition` とSecurity Cell再利用を実証する | content幅、抽象の実証 | contentと基盤変更が膨らむ | 固定world反復が主要な退屈要因 |
| H3 ミッション途中再開 | 長いvisitの中断負担を下げる | accessibility、生活適合 | runtime snapshotとsettlement混同 | 実測visit時間と中断負担が主要問題 |
| H4 実機hardening先行 | load、frame、input、audioの端末差を閉じる | production readiness | gameplay前進が止まる | 実機でcold startやframeがblocking |

現時点の第一提案はH1です。Phase Fの継続世界とPhase Gの敵警戒を、次visitの優先順位へ結び付けられるためです。ただしGate G-Aの観察が別の主要問題を示した場合は、その証拠を優先します。

## 条件付き長期ロードマップ

| 段階 | 目標 | 完了条件 | 依存・停止条件 | 主担当 |
| --- | --- | --- | --- | --- |
| Gate G-A | Phase G感覚受入 | 5観点をaccepted / tuning / blocking分類 | blockingならG修正 | game design / UX |
| G-Tune | 限定調整 | 観察根拠のある値・音・表示だけ変更し全gate維持 | architecture変更は別slice | gameplay tuning |
| Phase H | 再訪判断の因果 | 選択が次visitの目的・経路・支援を変え、summaryとsaveが一致 | 1目的だけ | design + world state |
| Phase I | 第2作者定義world | stable ID、safe anchor、contract、Security Cell、disposeを再利用 | Hの再訪動機accepted | content + projection |
| Phase J | 中断耐性 | temporary visit snapshotをsettlementと分離し、二重精算なくresume / discard | visit時間が実測問題 | save + lifecycle |
| Phase K | save compatibility hardening | V2 fixture corpus、backup/export、破損診断、必要時のみV3 migration | 具体的V3 field必須 | persistence |
| Phase L | 制約付きvariation | semantic ID、reachability、safe anchorを守るseeded variation | 2つ以上の作者worldで抽象実証 | generation + QA |
| Beta hardening | 実機品質 | cold/warm/revisit、frame、keyboard、pointer lock、audio、save recoveryに数値budget | major loop凍結 | performance / accessibility / QA |
| Content / asset pass | 製品表現 | rights確認済みasset、GLB/glTF budget、collision proxy、audio mix | rights不明なら導入しない | art / tech art / owner |
| Release candidate | 配布候補 | CI、human review、save互換、known issues、rollback、rights承認 | push/PR/merge別承認 | owner / reviewer / QA |
| Launch gate | 外部配布判断 | 配布先、version、privacy、support、rollbackを明示承認 | 技術PASSから自動承認しない | owner only |
| Post-launch | 継続運用 | crash/save破損triage、fixture、release note、rollback基準 | 公開された場合だけ | owner / maintenance |

### 停止条件

- 1 Phaseでworld settlement、ItemLocation、communication、navigationの2つ以上を同時再設計し始めたら分割する
- 人間評価の最大問題とPhase目的が一致しなければ着手しない
- enemyが未共有player stateを読む、watchful 2機を超える、HP・射撃へ軸を変える場合は停止する
- schema変更に具体的保存fieldとfixtureがなければV2を維持する
- procedural variationがstable ID、reachability、safe anchorを保証できなければ作者定義worldへ戻す
- Vite warningだけで性能作業を始めず、cold / warm / revisitの実機値を先に測る
- technical PASSをrights、public release、production approvalとして扱わない

## 残作業台帳

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase G感覚評価 | 視覚・音・tempoを製品判断できる | ミュートなしdesktop、5観点メモ | 待ち | human game design / UX | Gate G-Aを1回実施 |
| Phase H選定 | 次sliceを最大の実測gapへ集中する | Gate G-A結果、目的1文、受入、非対象、停止条件 | 未承認 | owner / supervising AI | 4候補から1つだけ承認 |
| Phase G remote portability | 別端末で同じHEADから再開する | branch/tag内容確認、明示push権限、push後parity | 完了・parity 0 / 0 | owner | 別端末でfetch後に同じbranchをcheckout |
| draft PR #1 | Phase C〜Fをreview可能にする | human review、CI方針、merge/rollback | OPEN / DRAFT / mergeable | owner / reviewer | G-A後にPR維持・更新・分離を判断 |
| CI | local gateをPRで再現する | typecheck/test/build workflow | 未設定 | repo owner | merge方針決定時に導入判断 |
| device performance | chunk warningの実影響を判断する | cold/warm/revisit、frame、memoryの実機値 | 未計測・非ブロッキング | performance | 問題端末で計測 |
| Rapier warning | 既知warningを安全に解消する | dependency/API互換と物理回帰 | 非ブロッキング | dependency maintenance | 更新専用sliceで扱う |
| rights / assets | 製品assetを合法・予算内で導入する | provenance、license、budget、collision proxy | primitive段階 | owner / art | gameplay loop凍結後に審査 |
| deploy / release | 外部配布する | review、rights、quality、target、rollbackの明示承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIが最初に行うこと

1. `PROJECT_HANDOFF.md`、本文書、`docs/project-context.md`、READMEのPhase G節を読む。
2. `git status -sb`、`git rev-parse HEAD`、Phase F tag参照先を確認する。
3. `git fetch --prune --tags origin` 後、remote Phase G branchの有無とdivergenceを再確認する。
4. Phase G人間評価メモを探す。なければ音量、scan幅、距離、delayを最終調整しない。
5. メモがあればGate G-Aを判定し、blockingならGだけを修正、acceptedならPhase Hを1目的だけ仕様化する。
6. 追加push、PR、merge、deploy、releaseはそれぞれ明示権限を確認する。今回のbranch/tag pushは完了済み。

## 監修役AIへの判断依頼

現時点の必須判断は1つです。

**Phase Gをミュートなしで評価し、watcher識別、共有chirp、孤立圧力、reinforcement解除、役割分担を `accepted` / `tuning` / `blocking` のどれに分類するか。**

acceptedの場合のみ、Phase Hを「契約・証拠・再訪判断の因果深化」に限定して仕様化することを推奨します。この判断にPhase G push、PR更新、merge、deploy、releaseの許可は含みません。
