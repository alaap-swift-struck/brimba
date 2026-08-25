# SECRETS.md — what the repo cannot hold, and how it holds it anyway

The question this answers: **if this laptop went in the ocean tonight, what could
not be recovered?**

Not the code — every line is on GitHub. Not the running app — it keeps serving.
What would be lost is the ability to *touch* it: the secrets. Cloudflare secrets
are **write-only** — you can set one, you can never read one back. So a secret
that exists only in a gitignored `.dev.vars` file exists in exactly one place in
the universe, and that place is a laptop.

Losing them means: no staging smoke, no catalog reseed, and — the sharp one — no
way to redeploy `auth`, `tenancy` or `content` with an `INTERNAL_KEY` matching
the one already live, because they authenticate to each other with it. The three
workers would start refusing each other.

---

## The vault

**One encrypted file — `secrets.vault` — which lands in the repo like any other
file once it is created.** It does NOT exist yet — `npm run vault:save` creates it, and until the
owner runs that (it needs a passphrase nobody else may hold) the credentials in
this document survive only on the author's laptop.

```bash
npm run vault:save     # read every .dev.vars → encrypt → secrets.vault (then commit it)
npm run vault:open     # decrypt → write every .dev.vars back (after a fresh clone)
npm run vault:check    # is there a vault, is it committed? (prints key NAMES only)
```

**Why this is safe in a public repo.** The file is AES-256-GCM ciphertext. Without
the passphrase it is noise — and GCM is *authenticated*, so a corrupted or
tampered vault fails loudly rather than decrypting to plausible rubbish. The key
is stretched from the passphrase with PBKDF2-SHA512 at 600,000 iterations, which
is what makes a WEAK passphrase survive an offline attack for a while. A fresh
random salt and IV each save, so saving twice never produces the same bytes.

**But this repository is PUBLIC, which changes the passphrase rule.** A public
repo hands the ciphertext to everyone, for ever, with unlimited time to attack it
offline — the one threat model where "a passphrase a human can remember" is the
wrong answer, because PBKDF2 is the most GPU-friendly of the modern stretching
functions and a memorable phrase is exactly what a wordlist attack is built for.
600,000 iterations buys time against a weak passphrase; it does not buy safety.

**Use a GENERATED passphrase of at least 128 bits** — your password manager's
"generate" button, 20+ random characters or six or more random words. Do not
compose one you can recall. You should never need to type it from memory: it lives
in the password manager, and you paste it. (Security review, 2026-08-25.)

**Why not plaintext, even in a private repo.** `CF_D1_TOKEN` can delete every
database on the account. A private repo is one settings click, one added
collaborator, or one forked CI job away from not being private. Encrypted costs
you one passphrase and removes that entire class of accident.

**Where the passphrase actually goes.** The cryptography runs in-process with
`node:crypto` — no command-line argument (visible to every process via `ps`), no
environment variable, no temp file. It is never written to disk and never sent
anywhere.

It does, however, cross a process boundary **twice**: `askPassphrase` shells out to
`/bin/sh` to turn terminal echo off while you type, and reads the value back over a
pipe. This document previously said "the passphrase never leaves the process",
which was not true, and a security claim that is not true is worse than no claim —
somebody plans around it. The exposure is small and local (a `read` in a short-lived
child shell, no argument list, nothing on disk) but it is not nothing: anything that
can already read that process's memory or its pipes on your machine could see it.

What has always been true, and is the part that matters: **nobody but you ever types
it, including any agent working on this repository.**

### The one rule

**The passphrase is now the only thing that cannot be recovered. Put it in a
password manager.** If you lose it, the vault is scrap and you are back to
regenerating everything by hand (§4).

---

## What is in there

`npm run vault:check` prints the key NAMES (never values), so its output is safe
to paste anywhere.

| Secret | Workers that need it | Must match across them? |
|---|---|---|
| `INTERNAL_KEY` | auth, tenancy, content, gateway, mcp | **YES** — they authenticate to each other with it |
| `CF_D1_TOKEN` | tenancy, content, data-ops | same account token |
| `ADMIN_KEY` | auth, tenancy, data-ops | owner-only endpoints |
| `TEST_LOGIN_KEY` | auth — **staging only** | the smoke's sign-in door |
| `ANTHROPIC_API_KEY` | data-ops, content | optional; without it the agent uses the keyless fallback |
| `APP_ORIGIN` / `PUBLIC_APP_URL` | auth, tenancy | not secret, but environment-specific |

`TEST_LOGIN_KEY` must **never** be set on production. Whoever holds it can sign
in as any account on that environment.

---

## After a total loss — the runbook

1. `git clone` the repo. All code, docs and history are there.
2. `npm install`
3. `npm run vault:open` — type the passphrase. Every `.dev.vars` comes back.
4. `npm run check` should be green.
5. If you are also rebuilding the Cloudflare side, follow BOOTSTRAP.md — it is
   the command-by-command runbook for standing the whole base up from nothing.

## If the passphrase is ALSO lost

Recoverable, in this order — and note that most of these are arbitrary strings
you choose, not values Cloudflare issued:

1. **`INTERNAL_KEY`, `ADMIN_KEY`, `TEST_LOGIN_KEY`** — generate new ones
   (`openssl rand -hex 16`). `INTERNAL_KEY` must be set on **all five** workers in
   the same sitting; between the first and the last, calls between them fail.
   Deploy order per OPERATIONS.md.
2. **`CF_D1_TOKEN`** — create a new API token in the Cloudflare dashboard with D1
   edit permission, then set it on tenancy, content and data-ops.
3. **`ANTHROPIC_API_KEY`** — issue a new one from the Anthropic console.

Nothing in this list loses data. It is an afternoon, not a catastrophe — but it
is an afternoon you can avoid with one line in a password manager.

---

## The habit

Run `npm run vault:save` whenever a secret changes, and commit the result. The
`vault:check` command tells you when the vault is missing or uncommitted, which
is the only two states where it protects nothing.
