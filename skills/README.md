# skills — the Claude Code skills that ship with the base

Claude Code skills live in a user's `~/.claude/skills/` folder, not inside a repo — so
cloning the base alone doesn't hand you the skill, it hands you a *copy* of it here. This
folder is that copy: the base's own build skills travel **with the clone**, so one GitHub
link carries everything — code, docs, tests, and the skills that operate on them.

## What's here

- **`new-app/`** — the one-shot foundation builder. Given an app name, it clones the base,
  runs the fork sweep (renames the `brimba-` prefix everywhere), stands the whole base up
  on Cloudflare command-by-command (core DB + migrations → R2 → secrets → realtime-first
  deploy of all seven workers → seed → smoke), creates the GitHub repo, runs the three
  quality gates, and hands over a ready-to-brand checklist. This is `BOOTSTRAP.md`
  automated. Read it: [new-app/SKILL.md](new-app/SKILL.md).

## Install (make a skill runnable in your Claude Code)

Copy the skill into your personal skills folder, then it's invokable by name:

```
cp -R skills/new-app ~/.claude/skills/new-app
```

After that, tell Claude Code **"new app"** (or "fork the base", "set up a new app") and it
runs the skill. You only need to do this once per machine; the skill then works against
any clone of the base.

> Without installing, you can still do everything by hand — the skill is just the checklist
> for `BOOTSTRAP.md`, which is in the repo root. Installing it gives you the one-command
> version.

## Note

These are copies for distribution. The author's live, edited copies stay in their
`~/.claude/skills/`; update those and re-copy here when a skill changes, so the in-repo
copy and the working copy don't drift.
