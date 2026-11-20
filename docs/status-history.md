# Status history

`PROJECT_HANDOFF.md` と `docs/project-context.md` から、完了済みの節を原文のまま移した履歴です。現在地は元の文書を正とします。2026-11-21に移動。

## PROJECT_HANDOFF.md から

### 2026-07-29に閉じた4 acceptance gap（Canary 承認前）

1. Porter音は周期pulseを廃止し、auth、command accepted、carry accepted、path failure、gate rejected等の意味eventだけをrate-limit、mute、caption付きで発火する。 Guided Auditは22段階を独立判定し、Watcher direct detectionからflare fact expiryまで、expected / actual、tick、duration、revision、result、failure reasonを残す。
2. Canary rightsは `NOASSERTION` / `internalOnly: true` / `distributionApproved: false` をregistryとmanifestの両方で型・一致検査し、欠落・矛盾・external distributionではprimitiveへfail-closed fallbackする。external buildへ内部GLBを含めない。 固定seed、watchful、1280×720、固定cameraで6状態 × primitive / Canary × PS1 OFF / ONの24条件を再生成した。
### 2026-07-29 の Fresh acceptance（Canary 承認前）

Dドライブのrepository外worktreeでfresh checkout → `npm ci` を行い、次を確認しました。Cドライブ一時領域は最初のprocess crashとENOSPCで使用できず、生成途中の一時`node_modules`だけを除去してDドライブで再実行しました。main worktreeの`node_modules`やユーザーデータは変更していません。
| Gate | 結果 |
| --- | --- |
| 依存・型・テスト | `npm ci` / `npm ls --depth=0` PASS、55 packages added、0 vulnerabilities。typecheck PASS。Vitest 34 files / 202 tests PASS |
| production / external build | PASS、79 modules、既知の500 kB warningのみ。externalはCanary GLB / internal asset 0件 |
| Guided Audit / semantic audio audit | 22 / 22、timeout 0、duplicate 0。audio 20 / 20 |
| browser / A/B | console error 0、unhandled rejection 0、external request 0。24 screenshots、contact sheet、index、readback PASS |
| lifecycle | 3 ship→mission→ship。scene 60、geometry 47、texture 3、program 4、draw calls 66、DOM 238、HUD 41で全cycle一定 |
| rights fallback | external contextでrequested Canary、active primitive、structured reasonを確認 |
| source cleanliness | fresh側の差分は再生成したtracked evidenceだけ。source、manifest、lockfile差分0。`git diff --check` PASS |

## docs/project-context.md から

## 2026-07-28 Phase G UX Closure

- 人間確認済みのmovement、wheel zoom、cart、Watcher / Needle appearanceはPASSとして保持した
- canvas右drag yaw / pitch、clamp、click threshold、modal / QA exclusion、Pointer Lock fallback、wheel / Gamepad regressionを自動固定した。physical Gamepadは未接続
- Guided QAはraw button列をdrawerへ置き換え、孤立復帰の目的、before / expected / actual、現在状態を表示する。raw controlは削除せず折り畳んだ
- one-click Guided Auditはwatchful開始からflare fact失効まで22 / 22 PASS、timeout 0、duplicate 0
- semantic audioは20 cue、AudioContext状態、単独試聴、同時字幕を提供し、waveform / peak / duration / distinctness / mute / resume / rate-limitを自動監査した。Porterは意味event-onlyで周期pulseを持たない
- CGAWのproducer commit `5d33ba89f141303072e2bc782c8f54302c6fd572`、exact GLB SHA-256 `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102`、manifest SHA-256 `9b2e9b87805456f72ca66fd0e4915bff1b23c1c4f4f4c6e7052fdfb4c8ee9f05` を検証し、決定論的importを追加した
- rightsは `DECLARED`、LOWPASS project-scoped、distribution承認済み。UV、low-resolution texture、Blender headless、独立human rubricは未完了だが、exact procedural packのproduction利用は承認済み
- A/B 24枚、contact sheet、console / performance readback、3 lifecycleを [`evidence/phase-g-closure/`](evidence/phase-g-closure/) へ保存した
- Phase H、WorldState schema、Security Cell規則、contract進捗は変更していない

## 2026-07-26 playability recovery

Gate G-Aは `GATE_G_A_BLOCKED_BY_PLAYABILITY_BASELINE` で中断されました。確認した構造的欠陥は、ArrowLeft / ArrowRightの欠落と、aliasをlogical action単位のSetで保持していたため片方のkeyupが残る物理キーのactionを解除し得ることです。実機報告時のW不反応そのものを旧buildで再捕捉できていないため、推測で単一原因へ断定せず、F1診断と物理key stateへの変更で観測可能性と正しさを同時に回復しました。

現在はWASD、矢印、alias混用、Shift、blur / visibility / modal / editable target clear、pointer lock拒否時のkeyboard移動、Gamepad標準mapping、wheel zoom、push-cart、積載・抽出、UI resource解放が自動・ブラウザ証拠を持ちます。Security Cellの状態所有、WorldState V2、migration、settlement、ItemLocation、敵知識、圧力予算と感覚調整値は変更していません。

### 2026-07-27 snapshot（履歴）

- 2026-07-27に `git fetch --prune --tags origin` を実施した。現branch `fix/phase-g-playability-recovery` のHEADとupstreamはともに `a3b5e73d60637c00b9bbb32a869bbf2763eb9b90`、ahead / behindは0 / 0で、取り込むremote commitがないためpullは不要だった
- fetch前のworktreeはcleanで、staged / unstaged / untrackedは0件、進行中のmerge / rebase / cherry-pick等もなかった。ゲーム実装、manifest、lockfile、保持中のreview成果物に差分はない
- 現branchは `origin/feat/phase-g-security-cell` より2commit先、`origin/main` より16commit先である。これは現在のrecovery履歴であり、main統合やPhase G受入を意味しない
- Node `v24.13.0` / npm `11.6.2` で `npm ls --depth=0`、型検査、28ファイル176テスト、production build、`git diff --check` を再確認した
- 同一HEADを既存Vite serverで `http://localhost:5173/?qa=1&security-posture=watchful` から開き、scene描画、固定60 Hz、console error 0を確認した。既知のRapier警告だけが残る
- Windows上のplain `npm run dev` は今回 `[::1]:5173` にbindし、`127.0.0.1` では接続できなかった。再現可能な正規コマンドは `npm run dev -- --host 127.0.0.1` とする。これは端末の名前解決・listener境界で、ゲーム描画障害ではない
- portableな状態はtracked source、lockfile、正本文書、remote branchである。`node_modules`、`dist`、`.serena`、IndexedDB、実行中Vite processはignoredまたは端末ローカルで、commit対象・remote証拠にしない
- V1→V2 browser migrationと3visit resource計測は同じ `6df8ba0` の2026-07-23証跡を参照する。物理GamepadとミュートなしGate G-Aは未検証のまま
- Vite大容量warningとRapier初期化warningは既知・非ブロッキング。警告隠しは行わない
- PR更新、main統合、deploy、release、rights判断は未実施でオーナー所有。現在のbottleneckは `GATE_G_A_RETEST_REQUIRED` だけで、次の具体手はコードを変えずミュートなし人間評価を最初から1回行うこと
- 最短コマンド、残作業のpurpose / effect / requirements / state / owner / nextはルート `PROJECT_HANDOFF.md` を参照する
