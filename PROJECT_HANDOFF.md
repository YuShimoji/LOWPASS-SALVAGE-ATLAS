# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-08-04 JST

## 現在地（2026-07-29の正本）

現在の確定分類は次です。

- `PHASE_G_CANONICAL_RECONCILIATION_GREEN`
- `LOCAL_CANDIDATE_LINEAGE_ADOPTED`
- `REMOTE_GREEN_BASELINE_SUPERSEDED`
- `CANARY_RIGHTS_FAIL_CLOSED`
- `LOWPASS_CANARY_PROJECT_SCOPED_PRODUCTION_APPROVED`
- `HUMAN_SENSORY_REVIEW_DEFERRED_NON_BLOCKING`
- `PHASE_H1_IMPLEMENTATION_UNLOCKED`

`PHASE_H1_IMPLEMENTATION_UNLOCKED` は技術的な開始可能性だけを示し、実装承認ではありません。Exact procedural Canaryのproject-scoped rights/production利用は承認済みです。Phase H、main merge、deploy、releaseは未実施です。

### Canonical identity

| 項目 | 確定値 | 意味 |
| --- | --- | --- |
| implementation source | local `d2683ee` lineage | Phase G Closureの意味論を採用した系統 |
| preserved remote baseline | `f3ea10949a908236adad1d2106ff0634804fc4bd` | build可能なgreen baselineだがacceptance-equivalentではない |
| no-force merge | `65fb21f992d9b2d8f933c343f1b2ab766311bbe2` | local / remote両方を親に持つ `merge: reconcile canonical Phase G candidate` |
| corrective runtime/evidence tip | `c9c9cdc16268c60995cf82499dc59ca277d4f1ba` | script末尾正規化とfresh importer portability修正を含む |
| canonical local checkout | `feat/phase-g-guided-qa-canary-v1` | reconciliation branchへfast-forwardし、同名originをupstreamにする |
| canonical development refs | `origin/feat/phase-g-guided-qa-canary-v1`、`origin/project/frontier` | 本文書を含む最終commitへ通常fast-forwardし、live ref readbackを正とする |
| Phase F保全 | `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a` | 既存tagを変更しない |
| exact Canary source | CGAW `5d33ba89f141303072e2bc782c8f54302c6fd572` | declared-rights supply contract |
| exact GLB SHA-256 | `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102` | import / registry / fresh acceptanceで一致 |
| exact manifest SHA-256 | `9b2e9b87805456f72ca66fd0e4915bff1b23c1c4f4f4c6e7052fdfb4c8ee9f05` | rights/source identityを含むproducer manifest |
| rights | `LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1` | LOWPASS game development/build/distribution only |

### 2026-08-04 rights / production update

- Canaryは`DECLARED`、`internalOnly: false`、`distributionApproved: true`へ移行した。
- importerはproducer manifest byte identityとrights readbackを追加検証する。
- external buildはCanaryを同梱し、GLB hashとproject-scoped rightsをbuild後に検証する。
- 34 files / 203 tests、typecheck、production build、external buildがPASSした。
- UV / texture / Blender headlessと独立human rubricは未完了だが、ownerはこのexact procedural packのproduction利用を承認した。
- standalone再配布、一般第三者再利用、PR/main、release/deploy/publicationはこの判断に含まない。

merge前監査は [`artifacts/reconciliation/phase-g-canonical-v2/`](artifacts/reconciliation/phase-g-canonical-v2/) にあり、merge base、両側commit、range-diff、file分類、4 gap、競合12件のfile-specific resolutionを保存しています。repository全体のours / theirs、force push、rebase、resetは使っていません。

### 閉じた4 acceptance gap

1. Porter音は周期pulseを廃止し、auth、command accepted、carry accepted、path failure、gate rejected等の意味eventだけをrate-limit、mute、caption付きで発火する。
2. Guided Auditは22段階を独立判定し、Watcher direct detectionからflare fact expiryまで、expected / actual、tick、duration、revision、result、failure reasonを残す。
3. Canary rightsは `NOASSERTION` / `internalOnly: true` / `distributionApproved: false` をregistryとmanifestの両方で型・一致検査し、欠落・矛盾・external distributionではprimitiveへfail-closed fallbackする。external buildへ内部GLBを含めない。
4. 固定seed、watchful、1280×720、固定cameraで6状態 × primitive / Canary × PS1 OFF / ONの24条件を再生成した。

### Fresh acceptance

Dドライブのrepository外worktreeでfresh checkout → `npm ci` を行い、次を確認しました。Cドライブ一時領域は最初のprocess crashとENOSPCで使用できず、生成途中の一時`node_modules`だけを除去してDドライブで再実行しました。main worktreeの`node_modules`やユーザーデータは変更していません。

| Gate | 結果 |
| --- | --- |
| `npm ci` / `npm ls --depth=0` | PASS、55 packages added、0 vulnerabilities |
| typecheck | PASS |
| Vitest | 34 files / 202 tests PASS |
| production build | PASS、79 modules、既知の500 kB warningのみ |
| external build | PASS、Canary GLB / internal asset 0件 |
| `git diff --check` | PASS |
| Guided Audit | 22 / 22、timeout 0、duplicate 0 |
| semantic audio audit | 20 / 20 |
| browser | console error 0、unhandled rejection 0、external request 0 |
| A/B | 24 screenshots、contact sheet、index、readback PASS |
| lifecycle | 3 ship→mission→ship。scene 60、geometry 47、texture 3、program 4、draw calls 66、DOM 238、HUD 41で全cycle一定 |
| rights fallback | external contextでrequested Canary、active primitive、structured reasonを確認 |
| source cleanliness | fresh側の差分は再生成したtracked evidenceだけ。source、manifest、lockfile差分0 |

ローカル技術greenはhuman sensory、remote CI、PR review、main統合、rights承認、production、公開完了を意味しません。

### 再現

```powershell
npm ci
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
npm run build:external
npm run evidence:phase-g
npm run dev -- --host 127.0.0.1
```

- primitive: `http://127.0.0.1:5173/?qa=1&security-posture=watchful&asset-mode=primitive`
- Canary: `http://127.0.0.1:5173/?qa=1&security-posture=watchful&asset-mode=canary-v1`
- `Run full guided audit` で22段階、`Advanced / Raw Controls` で20 cue、asset selection、fallback reasonを確認する。
- plain `npm run dev` が `[::1]` のみにbindした場合は `localhost` を使うか、上の明示hostコマンドで再起動する。

portableなのはtracked source、tests、import済みCanary、registry / manifest、reconciliation artifacts、closure evidence、正本文書です。`node_modules`、`dist`、`.serena`、IndexedDB save、音量設定、実行中Vite、Chrome profileは端末ローカルで、remote受入証拠にしません。

## Phase Gの実装境界

- V2はV1全fieldと永続security summaryだけを保存する
- runtime位置、task、lock、cooldown、local/shared knowledgeを保存しない
- routineはneedle 1機、watchfulはneedle + watcherの固定2機
- 確認contactは帰還settlementだけで永続化する
- enemyは直接観測または敵linkで共有済みのfactだけを使う
- watcherはobserve / overwatch、needleは再視認後interdict / sabotage
- simultaneous lock / interdict / relay sabotageは各1、interference後graceは4秒
- cautiousは新規攻撃保留、outnumberedは全攻撃解除・共通退避
- `ItemLocation`、revision、settlement冪等性、dynamic import、disposeを維持する
- HP、死亡、射撃、無制限敵、偽通信、音声模倣を導入しない

## 残作業

| 目的 | 効果 | 必要条件 | 現在状態 | owner | 次の動き |
| --- | --- | --- | --- | --- | --- |
| Phase G人間感覚レビュー | cueの音量・音色・疲労感と最終game feelを製品判断できる | ミュートなしdesktop、観察メモ | deferred / non-blocking。自動受入を止めない | human game design / UX | 問題が実観測された場合だけG-TUNE sliceを提案する |
| Draft PR #4 review | canonical Phase Gをmain統合前に人間レビューできる | remote checks、review方針、rollback判断 | Draft維持。ready / mergeは未許可 | owner / reviewer | reviewを行い、ready化・mergeは別承認する |
| Authority Guard PR #3 | live frontierと静的snapshotの優先関係を維持する | `origin/project/frontier` readback、docs-only guard | readyのまま維持、merge未許可 | owner / reviewer | frontier drift時だけCURRENT_FRONTIERを更新する |
| Phase H1開始判断 | 契約・証拠・再訪判断の因果を1 sliceへ限定する | accepted canonical base、完全Prompt、目的・受入・非対象・停止条件の明示承認 | technical unlock、実装未開始 | owner / supervising AI | 本報告の次Promptを明示承認してから開始する |
| Canary texture / independent rubric | 承認済みprocedural packのvisual depthを上げる | UV / texture tool、performance budget、比較rubric | rights / production利用承認済み、flat material / texture 0 | asset / art owner | 1 assetだけでtexture/LOD thin sliceを切る |
| device / performance | physical Gamepadと大容量warningの実影響を判断する | 実機、cold / warm / revisit計測 | mock controller green、物理Gamepad未確認、warning非ブロッキング | QA / performance | 問題端末がある場合だけ専用計測sliceを作る |
| deploy / release | 製品を外部配布する | review、rights、品質、target、rollbackの明示承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIが最初に行うこと

1. `git fetch --prune --tags origin` 後、`origin/feat/phase-g-guided-qa-canary-v1` と `origin/project/frontier` が同一commitであることを確認する。
2. そのlive HEADが `d2683ee` と `f3ea109` の双方を祖先に持ち、`65fb21f`、`bf6341b`、`c9c9cdc` を含むことを確認する。
3. [`docs/evidence/phase-g-closure/index.html`](docs/evidence/phase-g-closure/index.html)、guided / audio / browser / rights readback、24条件contact sheet、3 lifecycleを読む。
4. code変更を始める前に `npm ls --depth=0`、typecheck、全Vitest、build、diff checkを再実行する。fresh acceptanceは上記SHA-bound証拠として扱う。
5. Phase Gの距離、delay、scan、lock、pressure、音量・文言を観測なしに調整しない。Phase Hは完全Promptのowner承認前に開始しない。
6. PR ready化、merge、tag、deploy、release、access / public visibility、rights昇格はそれぞれ別gateとする。

## 次の開発判断

Phase G canonical reconciliationの技術blockerはありません。次の唯一の製品開発候補はPhase H1「契約・証拠・再訪判断の因果深化」です。既存V2 schemaとstatic definition / persisted state境界を維持し、帰還済みevidenceを次訪問のrouteまたはsupport差へ1つだけ結び付け、ブラウザで因果を説明できることを受入条件にします。第2world、途中再開、敵追加、WorldState migration、契約大量追加を同時に行いません。
