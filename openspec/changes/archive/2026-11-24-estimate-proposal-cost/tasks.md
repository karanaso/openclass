# Tasks

## 1. Estimate command

- [x] 1.1 In `scripts/opsx-cost.mjs`, extend the ledger and `## Cost` renderer with an optional `estimate` object (`amount`, `low`, `high`, `tasks`, `perTaskCost`, `basis`, `samples`, `at`) rendered above the actual table, preserving recorded stages; verify `node scripts/opsx-cost.mjs show tickets/2026-11-24-split-generated-content-cards/ticket.md` still prints the existing archive snapshot.
- [x] 1.2 Add `estimate <ticket.md> --change <change-dir> [--tasks <n>]` that counts tracked checkboxes in `<change-dir>/tasks.md`, calibrates `perTaskCost` from the median apply cost per completed task when at least 3 historical samples exist, falls back to the documented baseline otherwise, and prints the estimate with its basis; verify by running it against the archived `openspec/changes/archive/2026-11-24-split-generated-content-cards` task file with a temporary ticket.
- [x] 1.3 Add `tests/opsx-cost-estimate.test.ts` covering the fallback baseline, calibrated median with 3+ samples, `--tasks` override, and preservation of the estimate across a later `record`; verify with `npm test -- tests/opsx-cost-estimate.test.ts`.

## 2. Workflow integration

- [x] 2.1 Add the estimate step to `.opencode/commands/opsx-propose.md` and `.opencode/skills/openspec-propose/SKILL.md` after the propose cost is recorded, and include the estimated implementation cost in the propose output summary; verify both files contain the `estimate` invocation and the new summary line.
- [x] 2.2 Update `.opencode/commands/opsx-apply.md` and `.opencode/skills/openspec-apply-change/SKILL.md` so the completion output shows the estimate alongside the actual apply-stage cost; verify the wording appears in both files and the instruction still treats cost as best-effort.
- [x] 2.3 Confirm the estimate stays advisory: a skipped or failed estimate prints an `opsx-cost: skipped` style line and exits zero in the propose and apply guards; verify by reading the final instruction text and running the script with a missing ticket path.

## 3. Integration checks

- [x] 3.1 Run `npm run typecheck` and `npm run lint` and confirm both pass.
- [x] 3.2 Run `npm test -- tests/opsx-cost-estimate.test.ts tests/messages.test.ts` and confirm the new estimate coverage and existing message parity pass.

## Workflow follow-up

- Archive the change after review and a successful apply run.
