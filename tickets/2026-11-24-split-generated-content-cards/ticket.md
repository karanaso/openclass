# Split Generated content and edit actions into side-by-side cards

- Change: `split-generated-content-cards`
- Created: `2026-11-24`
- Status: implemented
- Implemented: `2026-11-24`

## Request

I would like to separate the "Generated content", "Edit Cards" and "Edit Questions" as two separate cards. side by side

## Implementation

- Completed: 2026-11-24
- Tasks: 7/7
- Verification: `npm run typecheck`, `npm run lint`, `npm test -- tests/generated-content-editor.test.tsx tests/messages.test.ts` (4 tests), and `npm run test:e2e -- e2e/card-editing.spec.ts e2e/question-editing.spec.ts` (2 tests). A Playwright layout check at 1280px and 600px confirmed the cards render side by side at `md` and stack on narrow screens, with the editors spanning the full grid width.

## Cost

<!-- opsx-cost:{"version":1,"stages":[{"stage":"archive","session":"ses_df371cdfeffeXP4356yeH570NE","sessionCost":0.04286083,"input":82732,"output":15760,"reasoning":14289,"at":"2026-11-24T09:47:02.849Z"}]} -->

Total (propose → apply → archive): **$0.0429**. Updated 2026-11-24T09:47:02.850Z.

Estimated from OpenCode session cost, including subagent sessions. A session shared with unrelated work is counted in full, so treat this as an upper-bound estimate.

Propose cost was not recorded for this change; this total covers the recorded stages only.

| Stage | Cost | Tokens (in / out / reasoning) | Session |
| --- | ---: | ---: | --- |
| Archive | $0.0429 | 82,732 / 15,760 / 14,289 | `ses_df371cdfeffeXP4356yeH570NE` |
| **Total** | **$0.0429** | 82,732 / 15,760 / 14,289 | |
