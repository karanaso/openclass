# Proposal

## Why

The `opsx-cost` tooling already records what a change actually cost across propose, apply, and archive, but only after the money has been spent. When reviewing a proposal, the user has no number to decide whether the implementation is worth its likely cost. Adding an estimated implementation cost to every proposal makes that trade-off visible before `/opsx-apply` starts.

## What Changes

- Add an `estimate` command to `scripts/opsx-cost.mjs` that writes an estimated implementation cost, a low/high range, and the basis for the estimate into the ticket's `## Cost` section, clearly separated from the recorded actual costs.
- Derive the estimate from the proposal's task count: count tracked task checkboxes in the change's `tasks.md`, multiply by a per-task cost, and fall back to a documented default when no history exists. Calibrate the per-task cost from the median recorded apply cost per completed task across existing tickets when samples are available.
- Run the estimate automatically at the end of the `/opsx-propose` workflow, after the artifacts are complete and the propose cost is recorded, and report the estimate in the proposal summary.
- Show the estimate alongside the actual cost when the apply workflow records its cost, so the user can see how the prediction held up (no change to cost tracking itself).
- Keep the estimate advisory: a failed or skipped estimate never blocks proposing, applying, or archiving.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is developer-tooling behavior in the OpenSpec workflow; no product or system capability changes. The change declares `skip_specs: true`.

## Impact

- `scripts/opsx-cost.mjs` — new `estimate` command, task counting, historical calibration, and estimate rendering in the ticket `## Cost` section.
- `.opencode/commands/opsx-propose.md` and `.opencode/skills/openspec-propose/SKILL.md` — add the estimate step and output line.
- `.opencode/commands/opsx-apply.md` and `.opencode/skills/openspec-apply-change/SKILL.md` — show estimate vs actual when recording the apply cost.
- `tests/opsx-cost-estimate.test.ts` — CLI-level coverage for task counting, calibration, fallback, and ticket rendering.
- Builds on the existing (currently uncommitted) `opsx-cost` ledger work: `scripts/opsx-cost.mjs`, the `opsx-cost` package script, and the propose/apply/archive cost-recording steps.
- No application code, API, data model, dependency, or student-facing changes.
