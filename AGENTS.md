# LOWPASS: SALVAGE ATLAS — Development Authority Guard

このリポジトリで製品実装を始める前に、次の順序を必ず守ってください。

1. `git fetch --prune --tags origin` を実行する。
2. `origin/project/frontier` の存在と参照先を確認する。
3. `origin/project/frontier` の `PROJECT_HANDOFF.md` と、そこから参照される最新の状態文書を読む。
4. current `HEAD` と `origin/project/frontier` のcommit ancestryを確認する。

`main` は統合基準であり、常に開発フロンティアであるとは限りません。current `HEAD` がfrontierと異なる場合、製品実装を開始してはいけません。phase番号や次スライスをmainのREADMEだけから推定せず、open PR、remote branch、commit ancestry、handoffを併せて確認してください。

mainから既に実装済みのphaseを再開したstale phase replayを検出した場合は、そのbranch上で次phaseへ進めません。重複差分を監査し、固有価値だけを現行frontierへ最小移植してから、重複レーンをreconciliationとして閉じてください。

製品branchは `origin/project/frontier` から作成します。push、PR、merge、deploy、release、権利判断は各タスクで明示されたauthorityに従ってください。history rewrite、force push、既存tagの上書きでfrontierを合わせてはいけません。

`CURRENT_FRONTIER.md` は人間向けの入口です。refの最終判断はfetch後のremote readbackと `PROJECT_HANDOFF.md` を正本にしてください。
