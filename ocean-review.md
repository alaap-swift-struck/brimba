# If the mac fell in the ocean — brimba · 2026-08-12

**Verdict: a stranger gets this running in about 25 seconds and can carry it forward.** 95/100, up from 76. The drill is the proof: a bare `git clone` of the remote, `npm install`, `npm run check` — 518 tests green, 24 seconds, nothing from this machine and nothing from memory.

What did NOT survive before this pass: the legal right to touch it, any named owner, any rollback procedure, and the knowledge of which secrets exist by convention.

## The drill — the falsifiable part

| Step | Command | Result |
|---|---|---|
| 1 | `git clone <remote>` | 1.7s — 360 files, 34 documents |
| 2 | `npm install` | 9s — 303 packages, 0 vulnerabilities |
| 3 | `npx tsc --noEmit` *(as the README said)* | **exited 0 having checked NOTHING** |
| 4 | `npm run check` | 13s — 518 tests, 8 suites, all green |

**Time to verified: ~24 seconds.**

**The drill's own finding, now fixed.** Step 3 is the command the README told a stranger to run before every commit. There is no root `tsconfig.json` — each workspace has its own — so `tsc` found no inputs, printed its help text and **exited 0**. It looked exactly like a pass. Anyone following the instructions would have believed they had verified a change they had not. The README now names `npm run check` and warns about the other explicitly.

## Scores

| # | Criterion | Score | Weight | Points |
|---|---|---|---|---|
| 1 | A remote copy exists and is current | 95 | 14 | 1330 |
| 2 | The stored tree is complete | 100 | 9 | 900 |
| 3 | Clone to running, reproducibly | 90 | 11 | 990 |
| 4 | A stranger can prove it works | 100 | 8 | 800 |
| 5 | The README is a real front door | 100 | 8 | 800 |
| 6 | Architecture and decisions written down | 95 | 12 | 1140 |
| 7 | Operating it: deploy, environments, rollback | 100 | 9 | 900 |
| 8 | The code explains itself | 91 | 8 | 728 |
| 9 | The history tells the story | 100 | 5 | 500 |
| 10 | Bus factor and ownership | 60 | 5 | 300 |
| 11 | The legal right to reuse it | 100 | 5 | 500 |
| 12 | The non-code inventory | 95 | 6 | 570 |

`total = 9458 / 100 = 95` · criterion 1 is 95, well above the gate of 70, so no cap applies.

## What was written this pass

| File | Why it mattered |
|---|---|
| `LICENSE` | proprietary, © 2026 Swift Struck. Without it nobody — including a developer you hire — had any legal right to touch the code. |
| `.dev.vars.example` | the eight secrets by NAME, no values. `SECRETS.md` already listed them; a stranger had no reason to look there. |
| `.nvmrc` + `engines` | Node 24. Nothing said which runtime this was built against. |
| `.github/CODEOWNERS` | one owner, named, with the contact for the Cloudflare account and the domain. |
| `CONTRIBUTING.md` | how to make a first change safely, including the sabotage discipline and the two ways a check has silently failed here before. |
| `CHANGELOG.md` | 215 commits reduced to the milestones a successor needs, with BREAKING marked for forks. |
| `INVENTORY.md` | every service, account, database, domain and cron job — and the three single points of failure, named. |
| `OPERATIONS.md` § rollback | the trigger, the command, the reverse deploy order, and what does NOT roll back (migrations, and data written since). |
| `README.md` | all nine front-door sections; the broken verify command replaced and called out. |

## Two probe results I scored against

**`envExample: false`.** The probe looks for `.env.example`. This is a Cloudflare Workers project — it uses `.dev.vars`, and nothing anywhere reads a `.env` file. `.dev.vars.example` is the correct name, and the rubric says "or equivalent". I scored the 25 points rather than create a decoy file to satisfy a regex.

**Truck factor 1.** One author, 366 files, by the Avelino Degree-of-Authorship calculation. That is a fact and the normal state of a solo project, not a fault — and it is exactly what this review exists to price. The mitigation is documentation, which is why `BOOTSTRAP.md`, `SECRETS.md` and `INVENTORY.md` carry the weight here.

## Recommendations — yours to run, I did not do these

**A second remote (+5, criterion 1).** GitHub is the only copy of everything. One command:

```bash
git remote add mirror https://gitlab.com/<you>/brimba.git && git push mirror --all
```

**Tags for meaningful versions (criterion 9).** The changelog now marks the milestones; tagging them makes them checkoutable:

```bash
git tag -a v2026.08.12 -m "operations database; scaling 94" && git push origin --tags
```

**The vault is still unsealed.** `secrets.vault` does not exist yet, so the credentials remain on one machine — the one thing in this review that is genuinely not backed up:

```bash
npm run vault:save && git add secrets.vault && git commit -m "chore: seal the secrets vault" && git push
```

## The verdict, in one sentence

If this laptop went into the ocean tonight, a stranger could clone the repository, have it verified in under half a minute, understand why every major decision was made, deploy it, roll it back, and know which accounts to ask for — and the only thing they could not recover is the secrets, because the vault has not been sealed yet.
