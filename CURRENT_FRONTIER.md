# LOWPASS: SALVAGE ATLAS — Current Development Frontier

更新日: 2026-07-29 JST

| 項目 | 現在値 |
| --- | --- |
| canonical development ref | `origin/project/frontier` |
| canonical product ref | `origin/feat/phase-g-guided-qa-canary-v1` |
| last verified snapshot | `33fe90c2be7665fc22367e05a6e02b65a02a3818` |
| reconciliation merge | `65fb21f992d9b2d8f933c343f1b2ab766311bbe2`、local `d2683ee` / remote `f3ea109` の両系統を祖先に持つ |
| current product state | Phase G canonical reconciliation green |
| completion classification | `PHASE_G_CANONICAL_RECONCILIATION_GREEN` / `CANARY_RIGHTS_FAIL_CLOSED` |
| next active artifact | Phase H1 causal follow-up「契約・証拠・再訪判断の因果深化」。owner承認前は未実装 |
| `main` status | Phase B integration baseline |

この静的SHAは2026-07-29のsnapshotです。実装開始時は必ずfetchし、live `origin/project/frontier` とfrontier側の `PROJECT_HANDOFF.md` を最終authorityとして読み、静的SHA・このbranch・`main`より優先してください。

`main` からPhase C以降を再開しないでください。製品branchはlive `origin/project/frontier` から作成します。Phase H1はtechnical unlockですが、完全Promptのowner承認、目的、受入、非対象、停止条件が揃う前に開始しません。

Phase Gのlocal candidate / remote baseline選定は完了しています。remote `f3ea109` はgreen baselineとしてancestryに保全されましたがacceptance-equivalentではなく、canonicalはno-force reconciliation後のlive frontierです。force push、history rewrite、既存tag上書きでfrontierを合わせてはいけません。

human sensory review、PR review / merge、rights昇格、main統合、deploy、release、public visibility変更はそれぞれ別gateです。ローカルgreenやこのsnapshotから完了を推論しないでください。
