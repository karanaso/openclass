# Estimate the currency cost of each proposal

- Change: `estimate-proposal-cost`
- Created: `2026-11-24`
- Status: implemented
- Implemented: `2026-11-24`

## Request

update openspec to estimate the ammount of currency required for each proposal

## Implementation

- Completed: 2026-11-24
- Tasks: 8/8
- Verification: `npm run typecheck`, `npm run lint`, `npm test -- tests/opsx-cost-estimate.test.ts tests/messages.test.ts` (6 tests), an `estimate` run against the archived split-change tasks (7 tasks, fallback baseline), and a missing-ticket skip check (prints `opsx-cost: skipped`, exits 0).

## Cost

<!-- opsx-cost:{"version":1,"stages":[{"stage":"propose","session":"ses_df371cdfeffeXP4356yeH570NE","sessionCost":0.06839111,"input":111379,"output":22061,"reasoning":23234,"at":"2026-11-24T12:44:54.479Z"},{"stage":"apply","session":"ses_df371cdfeffeXP4356yeH570NE","sessionCost":0.10398441,"input":130375,"output":33876,"reasoning":35532,"at":"2026-11-24T12:50:17.575Z"},{"stage":"archive","session":"ses_df371cdfeffeXP4356yeH570NE","sessionCost":0.10924717,"input":136477,"output":35043,"reasoning":36677,"at":"2026-11-24T12:53:02.780Z"}],"estimate":{"amount":0.4,"low":0.2,"high":0.6,"tasks":8,"perTaskCost":0.05,"basis":"default baseline ($0.05/task)","samples":0,"at":"2026-11-24T12:50:17.390Z"}} -->

Total (propose → apply → archive): **$0.1092**. Updated 2026-11-24T12:53:02.781Z.

Estimate: **$0.40** (range $0.20–$0.60) for 8 tasks.
Basis: default baseline ($0.05/task); 0 historical apply samples.

Estimated from OpenCode session cost, including subagent sessions. A session shared with unrelated work is counted in full, so treat this as an upper-bound estimate.

| Stage | Cost | Tokens (in / out / reasoning) | Session |
| --- | ---: | ---: | --- |
| Propose | $0.0684 | 111,379 / 22,061 / 23,234 | `ses_df371cdfeffeXP4356yeH570NE` |
| Apply | $0.0356 | 18,996 / 11,815 / 12,298 | `ses_df371cdfeffeXP4356yeH570NE` |
| Archive | $0.0053 | 6,102 / 1,167 / 1,145 | `ses_df371cdfeffeXP4356yeH570NE` |
| **Total** | **$0.1092** | 136,477 / 35,043 / 36,677 | |
