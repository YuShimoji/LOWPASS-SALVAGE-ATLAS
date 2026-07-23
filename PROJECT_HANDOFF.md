# LOWPASS: SALVAGE ATLAS — 再開引き継ぎ

更新日: 2026-07-24

## 現在地

- 現行branch: `feat/phase-g-security-cell`
- Phase G実装commit: `6df8ba0621baf8976fc56373863cf57565cc12ba`
- Phase F保全tag: `phase-f-world-persistence` → `1e98860597ac940ff8d47505a5b00736d852c43a`
- Phase G到達点: Security Cell、V2 migration、自動151 tests、実browser migration / 3visit / resource検証まで完了
- 2026-07-24再開検証: remote fetch、GitHub metadata、依存、型、151 tests、build、diff、HTTP smokeを再確認してPASS
- remote未取込: 0
- local先行: `origin/feat/phase-f-world-persistence` に対して4commit（本引継ぎcommit込み）
- remote Phase G branch: なし
- remote Phase F tag: なし
- 次の必須gate: Phase Gミュートなし人間受入
- push、PR更新、main統合、deploy、release: 未実施

監修役AIは最初に [`docs/supervising-ai-report.md`](docs/supervising-ai-report.md) を読み、今回ライブ確認した事実、2026-07-23の既存browser証跡、人間所有の感覚評価、条件付きroadmapを分離してください。

## remote状態

| ref | remote値 | localとの関係 |
| --- | --- | --- |
| `origin/main` | `c5ae3b9a168eb81c41886aab93699980be4c90df` | local `main` と0 / 0 |
| `origin/feat/phase-f-world-persistence` | `d25a9c04c277d5d4728904a11429f45413599a83` | 現branchが4commit先行 |
| `origin/feat/phase-g-security-cell` | なし | local-only |
| remote `phase-f-world-persistence` tag | なし | local-only |

draft PR [#1](https://github.com/YuShimoji/LOWPASS-SALVAGE-ATLAS/pull/1) はOPEN / DRAFT / mergeableで、Phase C〜Fを `main` へ向けています。headは `d25a9c0`、checksは0件で、Phase Gは含みません。

## 最短再開

```powershell
git status -sb
git rev-parse HEAD
git show-ref --verify refs/tags/phase-f-world-persistence
git fetch --prune --tags origin
git rev-list --left-right --count HEAD...origin/feat/phase-f-world-persistence
npm ls --depth=0
npm run typecheck
npm test -- --run
npm run build
git diff --check
npm run dev
```

期待値:

- branch: `feat/phase-g-security-cell`
- implementation ancestor: `6df8ba0621baf8976fc56373863cf57565cc12ba`
- divergence: local側だけが先行し、remote側は0
- tests: 26 files / 151 tests
- build: initial 2,904.36 kB / gzip 1,019.06 kB
- Security Cell dynamic chunk: 44.38 kB / gzip 11.89 kB

QA URLは `http://127.0.0.1:5173/?qa=1&audio=muted` です。訪問限定構成は `&security-posture=routine` / `watchful` を使えます。音の人間評価では `audio=muted` を外します。npm操作は直列で実行します。

## 2026-07-24 live verification

- `git fetch --prune --tags origin`: PASS、remote変更なし
- GitHub repository: public / default `main` / archived=false
- Node `v24.13.0`
- npm `11.6.2`
- `npm ls --depth=0`: PASS
- `npm run typecheck`: PASS
- `npm test -- --run`: PASS、26 files / 151 tests
- `npm run build`: PASS、69 modules
- `git diff --check`: PASS
- `http://127.0.0.1:5173/?qa=1&audio=muted`: HTTP 200
- HTML title / module entry: PASS
- smoke後server停止: PASS

今回browser gameplayは再実施していません。V1→V2、routine→watchful、敵cell分業、presence、grace、`partial → complete → aborted`、resource / DOM復帰は、同じPhase G implementation commitを使用したREADMEの2026-07-23証跡を正本とします。

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

| 目的 | 効果 | 要件 | 状態 | 担当 | 次の一手 |
| --- | --- | --- | --- | --- | --- |
| Phase G感覚評価 | watcher、chirp、圧力、退避を製品判断する | ミュートなしdesktop、5観点、accepted/tuning/blocking | 技術検証済み・人間待ち | human game design / UX | Gate G-Aを1回実施 |
| Phase H選定 | 次sliceを最大gapへ集中する | G-A結果、目的1文、受入、非対象、停止条件 | 未承認 | owner / supervising AI | 4候補から1案だけ承認 |
| Phase G remote portability | 別端末でPhase Gを取得可能にする | branch/tag確認、明示push権限、push後parity | local-only | owner | 承認時だけbranchとtagをpush |
| draft PR #1 | Phase C〜Fをreview可能にする | human review、CI方針、merge / rollback | OPEN / DRAFT / mergeable | owner / reviewer | G-A後に維持・更新・分離を判断 |
| CI | local gateをPR上で再現する | typecheck/test/build workflow | 未設定 | repo owner | merge方針時に導入判断 |
| device performance | Vite warningの実影響を判断する | cold/warm/revisit、frame、memory実測 | warningのみ・非ブロッキング | performance | 問題端末で計測 |
| Rapier warning | 既知warningを安全に解消する | dependency/API互換、物理回帰 | 非ブロッキング | dependency maintenance | 更新専用sliceで扱う |
| rights / assets | 製品assetを合法・予算内で導入する | provenance、license、budget、collision proxy | primitive段階 | owner / art | major loop凍結後に審査 |
| deploy / release | 外部配布する | review、rights、quality、target、rollback承認 | 未許可 | owner only | 現段階では実施しない |

## 次のAIの開始順

1. 本文書、`docs/supervising-ai-report.md`、`docs/project-context.md`、README Phase G節を読む。
2. clean state、HEAD、Phase F tag、remote divergenceを確認する。
3. 人間のGate G-Aメモを探す。
4. メモがなければ音量、scan、距離、delayを最終調整しない。
5. blockingならPhase Gだけを修正する。acceptedならPhase Hを1目的だけ仕様化する。
6. push、PR、merge、deploy、releaseは個別の明示権限を確認する。

未解決の設計質問は、「Phase Gの人間評価で観測された最大gapを、次の1スライスでどのプレイヤー判断へ変えるか」です。現時点の第一候補は、契約・証拠・再訪判断の因果深化です。
