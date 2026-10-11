# Working with AI on this repo

How to get accurate output from Claude/other assistants here. For humans *and* for the AI to read.

## Loop per task
1. **Point at the task:** "Do M2 task 'POST /v1/appointments' (FR-1)." — not "build the appointment feature".
2. **Plan first** for anything over ~1 file: ask for files to touch, approach, test cases. Correct the plan before code (use plan mode).
3. **Implement + tests together.** Ask for the failing-case tests explicitly.
4. **Verify:** lint, typecheck, tests must run green — the AI should run them, not claim them.
5. **Review the diff** yourself (or `/code-review`). Then tick the milestone and commit.

## Prompt patterns that work
- Give the *why* and the constraint: "A technician can't have overlapping appointments (BR-10); enforce in the domain and with a DB exclusion constraint."
- Reference docs instead of restating: "Follow conventions.md errors section."
- Ask for edge cases: "List the edge cases for this rule before implementing."
- When output is wrong, say what rule it broke so it can be added to `CLAUDE.md` / `conventions.md` — fix the doc, not just the code.

## Keeping the AI accurate
- `requirements.md` holds the brief verbatim + assumptions. Ambiguity → assumption logged, never silently invented.
- `milestones/` is the shared memory of progress between sessions; keep it current.
- Keep `CLAUDE.md` short; move detail to docs. If you repeat an instruction twice in chat, it belongs in a doc.
- Start a fresh session per milestone to avoid stale context.

## Claude Code setup (`.claude/`)
- `settings.json`: safe project commands are auto-allowed; risky ones ask (`pnpm add`, `docker compose down`, `git push`); secrets and destructive commands are denied (`.env`, Terraform state, force-push, host `terraform apply`).
- `skills/next-task`: `/next-task` picks the next milestone task and runs plan → implement → test → verify → tick.

Add after M0a, once real code exists:
- hooks: Prettier on edited files, typecheck/lint before finishing a turn
- skills: `add-use-case`, `add-module`, using the first real module as the template
- a reviewer subagent that checks diffs against the architecture rules
