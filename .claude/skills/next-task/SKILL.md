---
name: next-task
description: Pick up the next milestone task in this repo and run it through the project workflow (plan → implement → test → verify → tick). Use when the user says "next task", "continue", "what's next", or names a milestone task to work on.
---

# Next task

Follow these steps in order. Do not skip the plan or the verification.

## 1. Find the task
1. Read `docs/milestones/README.md` and open **only** the milestone file linked as "Current milestone".
2. Take the first unchecked `- [ ]` task, unless the user named a specific one.
3. If the task depends on `docs/requirements.md` content that is still TODO, stop and ask the user for it. Don't invent requirements.

## 2. Load only the relevant docs
Use the "Doc index" table in `CLAUDE.md`. Always read `docs/architecture/README.md` for any code task, plus the one layer file the task touches. Don't load every doc.

## 3. Plan (short, before editing)
State in a few lines:
- the task and the requirement IDs it covers (FR-x / NFR-x)
- the files to create or change, by layer
- the tests to add (happy path, each failure branch, boundaries)
- any assumption needed. Record it in `docs/requirements.md` › Assumptions.

For changes touching more than ~3 files or adding a dependency, wait for the user to confirm the plan.

## 4. Implement
- Follow the layer and dependency rules and the conventions. Keep to this task only; no drive-by refactors.
- Write tests together with the code.

## 5. Verify
Run what the Definition of Done in `CLAUDE.md` requires for this change (`pnpm lint`, `pnpm typecheck`, `pnpm test`, plus `test:int` / `test:e2e` when touching DB or API). Report real results. If something fails, fix it or say so; never claim it passed.

## 6. Close out
- Tick the task in the milestone file. If the milestone is now complete, set its status to `done` in both the milestone file and `docs/milestones/README.md`, and move the "Current milestone" link.
- Update `docs/api.md` if endpoints changed. Add an ADR in `docs/decisions/` for any non-obvious design choice.
- Note gotchas or deferred work in the milestone file's **Notes**.
- Summarise: what changed, test results, anything left open. Suggest a conventional-commit message; don't commit unless asked.
