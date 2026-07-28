# 監修役AI向け現状報告

更新日: 2026-07-29 JST

## 2026-07-29 優先監修結論（現行正本）

Phase G正本はlocal `d2683ee` lineageを実装採用元として確定し、remote `f3ea10949a908236adad1d2106ff0634804fc4bd` は履歴を保全した `GREEN_BUT_NOT_ACCEPTANCE_EQUIVALENT` baselineへ降格しました。no-force merge `65fb21f992d9b2d8f933c343f1b2ab766311bbe2` は両系統を祖先に持ち、merge commitを書き換えずcorrective `bf6341b` と `c9c9cdc16268c60995cf82499dc59ca277d4f1ba` を追加しました。

現在の分類は次です。

- `PHASE_G_CANONICAL_RECONCILIATION_GREEN`
- `LOCAL_CANDIDATE_LINEAGE_ADOPTED`
- `REMOTE_GREEN_BASELINE_SUPERSEDED`
- `CANARY_RIGHTS_FAIL_CLOSED`
- `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING`
- `PHASE_H1_IMPLEMENTATION_UNLOCKED`

最後の分類はtechnical unlockで、Phase H実装の承認ではありません。Phase H、main変更、PR ready化、PR merge、deploy、release、public visibility変更、rights昇格は行っていません。

### Canonical ancestryとrange-diff分類

開始時はlocal documentation HEAD `5db2000`、local / remote unique 3 / 3、merge base `52f0cf9`、両remote ref `f3ea109` でした。local側は`d2683ee`のPhase G Closureと正本推薦文書、remote側は`42c8b8a`のQA / audio別実装、`e1207b2`のCanary統合、`f3ea109`のgreen baseline mergeでした。patch-equivalentではなく、localの22段階因果、状態別A/B、波形監査、明示rights境界と、remoteの18段階汎用監査、周期Porter pulse、別asset runtimeが競合するため、単純ff / rebase / tree上書きは不適切でした。

merge前に [`artifacts/reconciliation/phase-g-canonical-v2/`](../artifacts/reconciliation/phase-g-canonical-v2/) へancestry、range-diff、file分類、acceptance gap matrixを保存し、local候補HEADを `archive/phase-g-local-candidate-d2683ee` で保護しました。force、force-with-lease、rebase、reset、repository全体のours / theirsは不使用です。

### Merge conflictsと解決

12件の競合をfile-specificに解決しました。完全なcontract、却下案、risk、validationは `conflict-resolution.json` が正本です。

| 対象 | canonical resolution | 保持したremote価値 | 回帰防止 |
| --- | --- | --- | --- |
| `.gitignore` | local evidence / cache境界を維持 | remoteで必要な生成物除外を重複なく統合 | `git status --ignored`分類 |
| 3 authority docs | candidate表現をcanonical確定状態へ更新 | remote baselineの履歴を保全 | stale candidate検索、diff check |
| `package.json` | local scriptsにexternal boundary / browser evidenceを追加 | remote依存・lockの意図しない変更なし | `npm ls`、build、fresh `npm ci` |
| Canary importer | exact hash / schema / stable node / bounds / rightsをrepo-contained fixtureで検証 | remoteのconsumer contract観点 | portable importer test |
| InputController / tests | local physical-key / Guided QA契約 | remote-onlyの有効なcamera pitch clamp testを保持 | controller / camera tests |
| `src/main.ts` | local runtime authority、command accepted cue、rights fallback | remoteの有用なUI投影は意味等価部分だけ | typecheck、browser audit |
| ThirdPersonCamera | local desired/effective distance、drag orbit | remote pitch-clamp coverage | unit tests |
| MachineFeedbackAudio | local semantic event-onlyを採用、20 cues | remoteのcue追加意図を周期loopなしで吸収 | waveform / rate-limit / mute / caption tests |
| flooded market factory | local visual adapter / lifecycle authority | remote-onlyで非競合なscene価値 | 3 lifecycle readback |
| CSS | local Guided QA drawer / current labels | remoteの非競合layout意図 | 1280×720 evidence |

WorldState V2、ExpeditionManifest、gate evaluator、ItemLocation、settlement、SecurityBlackboard / knowledge authority、distance、delay、scan、lock、pressure budget、exact Canary hashは意味変更していません。

### Four acceptance gaps

| Gap | local before | remote before | canonical after | compatibility / user impact | evidence |
| --- | --- | --- | --- | --- | --- |
| Porter audio | semantic event中心、17 cues | 1.6秒周期operational pulse | 20 cues。auth、command accepted、carry accepted、path failure、gate rejected等のtransitionだけ | mute / caption / rate-limit維持、AI判断非所有 | MachineFeedbackAudio tests、audio audit 20 / 20 |
| Guided Audit | Security Cell因果22段階 | 汎用controller 18段階 | 22段階を独立判定しexpected / actual / tick / duration / revision / failure reasonを保持 | runtime stateを直接PASSへ書換えずsave migrationなし | guided JSON / HTML、controller tests |
| rights fail-closed | internal-only flagsあり | `NOASSERTION`中心で外部境界不足 | boolean存在 / 型、status、NOASSERTION整合、registry / manifest一致、external拒否、structured warning、primitive継続 | internal reviewは維持、external buildからGLB除外 | registry / loader tests、rights fallback readback、build:external |
| A/B evidence | 6状態 × 4条件 | 4条件のみ | Needle / Watcher、Porter / coil、cart handle、terminal、share、disengageの24条件 | simulation authority、固定seed / camera / posture / viewport | 24 PNG、contact sheet、index、visual readback |

### Local gateとfresh environment

main worktreeのmerged stateで依存整合、typecheck、34 files / 202 tests、production build、external build、diff check、browser evidenceを通しました。その後、Dドライブのrepository外fresh worktreeで `npm ci` から再実行しました。

| Gate | fresh結果 |
| --- | --- |
| dependency install | 55 packages added、0 vulnerabilities、`npm ls --depth=0` PASS |
| typecheck | PASS |
| Vitest | 34 files / 202 tests PASS。開始基準199を3件増加 |
| production / external build | 両方PASS、79 modules。external outputにCanary GLB / internal file 0 |
| diff check | PASS |
| exact Canary hash | `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102` 一致 |

Cドライブfresh試行は一度process crash、次にENOSPCとなりました。これはgame failureとして隠さず、生成途中の一時worktreeだけを除去し、容量のあるDドライブで同一HEADをfresh検証しました。main `node_modules`、save、credentialsは変更していません。

### Guided Audit / rights / A/B / lifecycle

- Guided Audit: 22 / 22、timeout 0、duplicate 0。Watcher direct detection、fact share、Needle response / reacquisition、lock start、reinforcement presence、lock release、cautious、outnumbered、disengage、relay sabotage / disabled / restart、flare created / shared / expiredを独立観測
- rights: external contextでCanaryを要求するとactive packはprimitive、reasonは `RIGHTS_EXTERNAL_DISTRIBUTION_BLOCKED` を含み、session継続
- A/B: fixed seed `atlas-01`、watchful、1280×720、各captureでcameraを既定化し24条件を再生成
- browser: console error 0、unhandled rejection 0、external request 0、event duplication 0
- lifecycle: 3回のship→mission→shipでscene 60、geometry 47、texture 3、program 4、draw calls 66、DOM 238、HUD 41が全回一致し、accumulation deltaは全0

ブラウザ自動captureとreadbackはgreenです。ただしこの環境の画像viewerもWindows ACL helperで起動できなかったため、今回の24枚を人間が目視して美的に承認したとは主張しません。各PNGが生成され、readback、サイズ、console、runtime stateが成立したことと、human visual / audio tasteを分離します。

### 開発可能性、portable境界、次の具体手

canonical source、tests、Canary copy、registry / manifest、reconciliation artifacts、closure evidence、正本文書はportableです。`node_modules`、`dist`、`.serena`、IndexedDB、音量、実行中Vite / Chrome、C / D一時worktreeは端末ローカルです。remote CI、human sensory、rights、production、main integration、deploy / releaseは別gateです。

正本選定のbottleneckは解消しました。次の開発候補はPhase H1「契約・証拠・再訪判断の因果深化」だけです。既存V2 schemaを維持し、static definitionとpersisted stateの境界を変えず、帰還済みevidenceから次訪問のrouteまたはsupport差を1つだけ説明可能にします。完全Promptのowner承認前には開始しません。

## 残作業台帳

| 目的 | 効果 | 必要条件 | 現在状態 | owner | 次の動き |
| --- | --- | --- | --- | --- | --- |
| Phase G人間感覚レビュー | cueの音量・音色・疲労感、visual taste、最終game feelを製品判断できる | ミュートなしdesktop、画像 / 操作の人間観察 | deferred / non-blocking。今回の自動greenを否定しない | human game design / UX | 実観測の問題がある場合だけG-TUNE候補を限定する |
| Draft PR #4 | canonical Phase Gをmain統合前にreviewする | remote checks、review / rollback方針 | Draftを維持。ready / merge未許可 | owner / reviewer | reviewを行い、ready化・mergeは別承認する |
| Authority Guard PR #3 | live frontier authorityを静的snapshotより優先する | `origin/project/frontier` readback、docs-only guard | ready維持、merge未許可 | owner / reviewer | frontier変更時だけguard snapshotを更新する |
| Phase H1 | 帰還済みevidenceを次訪問のroute / support判断へ因果接続する | accepted canonical base、完全Prompt、1目的、受入 / 非対象 / 停止条件のowner承認 | technical unlock、未実装 | owner / supervising AI | 下記Promptを明示承認後にthin sliceを開始する |
| rights / production asset | Canaryを外部配布可能なassetへ昇格する | provenance、license、UV / texture、Blender validation、production approval | NOASSERTION / internal-only、external outputから除外 | owner / art / legal | 権利宣言まではprimitiveを外部既定にする |
| physical Gamepad / performance | 実機操作とbundle warningの影響を判断する | device、cold / warm / revisit計測 | mock green、実機未確認、warning非ブロッキング | QA / performance | 問題端末がある場合だけ計測sliceを作る |
| main / deploy / release | accepted変更を製品配布へ進める | review、rights、CI、target、rollbackの明示承認 | 未許可・未実施 | owner only | 現段階では進めない |

## 条件付き長期ロードマップ

以下は優先順を固定する設計地図で、後続Phaseの一括承認ではありません。各段階で1つのthin slice、独立受入、owner判断を必要とします。

| 段階 | 目的 | 期待効果 | 開始条件 | 停止条件 / 非対象 | 次の判断 |
| --- | --- | --- | --- | --- | --- |
| H1 causal follow-up | 帰還済みevidenceを次訪問のrouteまたはsupport差1つへ接続 | 継続世界の因果をプレイヤーが説明できる | canonical Phase G、完全Prompt、V2で表現可能な1判断 | schema migration、第2world、敵追加、複数契約同時追加 | browser proofとhuman理解を見てaccept / bounded repair / reject |
| H2 consequence depth | H1で選ばなかったroute / support側に対価と再訪理由を1つ追加 | 単なるcontent増加でなく選択の緊張を作る | H1 accepted、metrics / observationで判断価値を確認 | 無限分岐、hidden state、説明不能な自動難化 | 2回の再訪で因果が維持されるか判定 |
| H3 world expansion | stable ID / reachability / safe anchor契約を満たす第2作者定義world候補を検証 | 既存loopの転用性を証明 | H1-H2 green、content / asset予算、rights | procedural生成、V2破壊、同時asset全面置換 | definition追加だけで成立するかpreflight |
| H4 interruption resilience | mission途中再開の必要性と最小snapshot境界を判断 | 長時間sessionの復旧性 | 実ユーザー需要、save isolation、migration / rollback設計 | runtime task / physics / transient knowledgeの無差別保存 | prototype前にschema costとfailure modeを承認 |
| A1 production asset | Canaryを権利・UV・texture・validation済み製品assetへ置換 | 外部配布可能なvisual quality | provenance / license、Blender validation、予算、rollback | NOASSERTIONの昇格推測、collision authority移譲 | primitive A/Bとperformanceを再受入 |
| Q1 delivery hardening | CI、physical Gamepad、問題端末性能、bundle戦略を必要箇所だけ固める | merge / release判断の再現性 | target device、CI方針、測定値 | warningだけを理由に大規模refactor | main / release gateをownerが個別承認 |
## 次のAIが最初に行うこと

1. `PROJECT_HANDOFF.md`、本文書の2026-07-29節、`docs/project-context.md`、READMEのPhase G canonical節、decision logを読む。
2. `git fetch --prune --tags origin` 後、product refと`origin/project/frontier`のlive identity、worktree、upstream、ahead / behindを確認する。
3. live HEADが `d2683ee` と `f3ea109` の双方を祖先にし、no-force merge `65fb21f` とcorrective `bf6341b` / `c9c9cdc` を含むことを確認する。
4. reconciliation artifacts、Guided Audit、audio、rights、24条件index / contact sheet、3 lifecycleを読む。
5. code変更前に依存整合、typecheck、全Vitest、build、diff checkを再実行する。fresh evidenceはSHA-boundで、remote CIや人間受入へ読み替えない。
6. Phase Hは下記完全Promptのowner承認前に開始しない。PR ready化、merge、tag、deploy、release、rights / visibility変更も別承認とする。

## 監修役AIへの次の判断依頼

Phase G canonical reconciliationに残る技術blockerはありません。Phase H1のobjectiveは、既存V2 schemaとstatic / persisted境界を維持したまま、帰還済みの契約・証拠が次訪問のrouteまたはsupport差を1つ生み、プレイヤーがその因果をブラウザ上で説明できるようにすることです。第2world、途中再開、敵追加、WorldState migration、複数契約の同時追加、Phase G感覚値の無根拠調整は非対象です。
