# Legacy lint refactor plan

This runbook lets repository owners reduce the ESLint bulk-suppression baseline
in small, behavior-preserving changes. It is designed for repeated use by coding
agents over time, not for a single repository-wide rewrite.

## Current baseline snapshot

As of 2026-08-27, `eslint-suppressions.json` records 1,621 violations across
523 files. Treat these numbers as a snapshot and calculate the live totals at
the start and end of every batch.

| Phase | Rules | Snapshot count | Risk |
| --- | --- | ---: | --- |
| Mechanical cleanup | `prefer-const`, `object-shorthand`, `no-unneeded-ternary`, `@typescript-eslint/no-unused-expressions`, `@typescript-eslint/no-unused-vars`, `no-console`, `@typescript-eslint/no-explicit-any`, `react/no-unescaped-entities` | 154 | Low to medium |
| Next.js correctness | `@next/next/no-location-assign-relative-destination`, `@next/next/no-img-element` | 33 | Medium |
| React hooks | `react-hooks/set-state-in-effect`, `purity`, `static-components`, `immutability`, `preserve-manual-memoization`, `refs`, `exhaustive-deps` | 148 | Medium to high |
| Structural complexity | `complexity`, `no-nested-ternary`, `max-depth`, `max-lines`, `max-nested-callbacks`, `max-params` | 1,286 | High |

The largest individual groups are `complexity` (824), `no-nested-ternary`
(276), `react-hooks/set-state-in-effect` (129), `max-depth` (97),
`@typescript-eslint/no-unused-vars` (68), `no-console` (64), and `max-lines`
(60).

## Operating model

1. Start each batch from the latest branch that contains the strict ESLint
   baseline. Once that work is merged, start from the latest `main`.
2. Use a dedicated branch named `refactor/lint-<rule>-<scope>`. Keep one logical
   rule and application area per branch.
3. Limit a batch to about 5 to 25 violations and no more than 15 source files.
   Use a smaller batch for React hooks, authentication, payments, webhooks,
   database writes, and other behavior-sensitive code.
4. Fix low-risk rules before structural rules. Structural refactors require
   focused tests that demonstrate behavior before and after the change.
5. Run agents sequentially by default. `eslint-suppressions.json` is a shared
   merge-conflict hotspot, so every new branch should include the latest pruned
   baseline.
6. If code work must happen in parallel, partition agents by non-overlapping
   directories. Have one integrator rebase the code commits, run
   `pnpm lint:prune` once, and commit the resulting baseline update.
7. Keep each branch independently reviewable. Do not combine feature work,
   dependency updates, formatting sweeps, or unrelated cleanup with lint debt.

## Recommended queue

Work through these stages in order while allowing owners to pause after any
merged batch:

1. Resolve the 17 straightforward violations from `prefer-const`,
   `object-shorthand`, `no-unneeded-ternary`, and
   `@typescript-eslint/no-unused-expressions`.
2. Resolve the two `no-explicit-any` findings and three
   `react/no-unescaped-entities` findings in focused batches.
3. Address `@typescript-eslint/no-unused-vars` by directory. Confirm whether an
   unused value exposes incomplete behavior before deleting it.
4. Address `no-console` by runtime boundary. Preserve intentional operational
   logging through the project's approved logger or allowed `warn` and `error`
   methods; do not blindly delete useful diagnostics.
5. Address the Next.js rules by route or feature, verifying navigation and image
   behavior in a browser where relevant.
6. Address React hook rules one component or feature flow at a time. Add or
   strengthen tests before changing state synchronization or dependency arrays.
7. Address structural rules from the smallest groups upward: `max-params`,
   `max-nested-callbacks`, `max-lines`, `max-depth`, `no-nested-ternary`, then
   `complexity`. Extract code only when the new boundary has a clear name and a
   focused contract.

## Live inventory commands

Run these commands before selecting a batch:

```sh
pnpm lint:strict
jq 'length' eslint-suppressions.json
jq '[to_entries[].value | to_entries[].value.count] | add' eslint-suppressions.json
jq -r '[to_entries[].value | to_entries[] | {rule: .key, count: .value.count}] | group_by(.rule) | map({rule: .[0].rule, count: (map(.count) | add)}) | sort_by(-.count)[] | "\(.count)\t\(.rule)"' eslint-suppressions.json
```

To find the highest-debt files:

```sh
jq -r 'to_entries[] | [.key, ([.value | to_entries[].value.count] | add)] | @tsv' eslint-suppressions.json | sort -t $'\t' -k2,2nr
```

## Reusable agent prompt

Copy the prompt below into a coding agent. Replace the bracketed selection only
when the owner wants a particular rule or feature; otherwise let the agent choose
the next safe batch from the recommended queue.

```text
Refactor one safe, reviewable batch of legacy ESLint violations in this
repository.

Selection:
- Preferred rule or feature: [NEXT SAFE BATCH, or name a rule/directory]
- Maximum scope: 5 to 25 suppressed violations and no more than 15 source files

Objective:
Reduce eslint-suppressions.json without changing application behavior. Finish
one coherent batch, validate it, and leave a clear handoff for the next agent.

Before editing:
1. Read AGENTS.md and repository contribution instructions.
2. Verify the current branch, working tree, remotes, and latest base branch.
3. Run pnpm lint:strict and calculate the current suppression total, affected
   file count, and counts grouped by rule.
4. Inspect relevant tests and callers before choosing the batch.
5. If no preferred selection was supplied, choose the earliest safe unfinished
   item in docs/legacy-lint-refactor-plan.md.
6. Create a dedicated branch named refactor/lint-<rule>-<scope> unless the owner
   has already created one.

Implementation rules:
- Fix the underlying code. Do not disable or weaken lint rules, add eslint-disable
  comments, add new bulk suppressions, replace useful types with any, or silence
  TypeScript errors.
- Preserve runtime behavior, public APIs, rendering, data flow, authorization,
  error handling, and operational logging.
- Avoid generated files, vendored code, migrations, snapshots, and unrelated
  user changes.
- Prefer narrow edits. Do not turn a lint batch into an architectural rewrite.
- For hooks and structural rules, add or strengthen focused tests before changing
  behavior-sensitive logic.
- If a finding indicates a possible product defect, stop that finding and report
  it separately instead of silently changing behavior.

Baseline update:
1. Run pnpm lint:strict after the source changes.
2. Run pnpm lint:prune to remove only obsolete suppression counts.
3. Confirm the total suppression count decreased by exactly the number of resolved
   findings and did not increase for any rule.
4. Review eslint-suppressions.json and the full diff for unrelated churn.

Validation:
- Always run pnpm lint:strict and pnpm typecheck.
- Run focused tests for every changed feature.
- Run pnpm check for a normal batch.
- Run pnpm preflight when the batch affects runtime boundaries or is ready for a
  pull request.
- Report any unrelated pre-existing failure with evidence; do not hide or bypass
  it.

Delivery:
- Commit only the coherent lint batch and its smaller suppression baseline to
  the dedicated refactor branch.
- Do not push, open a pull request, or merge unless the owner requested those
  actions.
- Never claim completion unless strict lint passes and the baseline decreases.

Final handoff:
- Rule and application area addressed
- Files changed
- Suppression count before and after, including the exact decrease
- Tests and checks run with results
- Behavior-preservation evidence and remaining risks
- Recommended next batch
```

## Per-batch acceptance criteria

A batch is complete only when all of the following are true:

- The selected findings are fixed at their source.
- No lint rule or threshold was weakened.
- No new suppression or inline disable was added.
- `pnpm lint:strict` passes with zero errors and zero warnings.
- `pnpm lint:prune` produces a strictly smaller baseline.
- Type checking and relevant tests pass.
- Behavior-sensitive changes have focused regression coverage.
- The diff contains no unrelated edits.
- The handoff records before and after counts so the next agent starts from live
  state rather than this document's snapshot.

## Owner checkpoint

After each batch, decide whether to merge, request more validation, or pause.
Always merge or rebase the latest baseline before starting the next branch. This
keeps the work optional, incremental, and safe to resume at any time.
