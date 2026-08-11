#!/usr/bin/env node
// THE VAULT — your secrets, on GitHub, encrypted.
//
// The problem it solves: every `.dev.vars` file is gitignored, because a plaintext
// Cloudflare token in a repo is one "make public" click away from someone deleting
// every database you own. But gitignored means NOT BACKED UP — and Cloudflare
// secrets are write-only, so you cannot read them back off the platform either.
// Lose the laptop and you lose the ability to redeploy `auth`, `tenancy` and
// `content` with an INTERNAL_KEY that matches the one already live. The code all
// survives; the app keeps running; you just can't touch it any more.
//
// So: ONE encrypted file, `secrets.vault`, committed like any other file. It is
// AES-256 ciphertext — useless to anyone without the passphrase, safe in a public
// repo. Six things to keep track of becomes one passphrase.
//
//   npm run vault:save     read every .dev.vars → encrypt → secrets.vault (commit it)
//   npm run vault:open     decrypt secrets.vault → write every .dev.vars back
//   npm run vault:check    is the vault present, and does it match what's on disk?
//
// The cryptography is Node's own (`node:crypto`) rather than a shell-out to
// openssl, for one reason that matters: the passphrase never crosses a process
// boundary. No argument list (visible to every process on the machine via `ps`),
// no environment variable, no temporary file. It is read straight into this
// process and used there.
//
//   AES-256-GCM  — authenticated, so a corrupted or tampered vault fails loudly
//                  instead of decrypting to plausible rubbish.
//   PBKDF2-SHA512, 600,000 iterations — what makes a passphrase a human can
//                  actually remember survive an offline attack on the ciphertext.
//                  (OWASP's 2023 floor for PBKDF2-SHA512 is 210,000.)
//   Random 16-byte salt + 12-byte IV per save, so saving twice never produces
//                  the same bytes and nothing leaks through comparison.
//
// THE ONE RULE: the passphrase is now the only thing that cannot be recovered.
// Put it in a password manager. If you lose it, the vault is scrap.

import { execFileSync } from "node:child_process"
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ITERATIONS = 600_000

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const VAULT = join(ROOT, "secrets.vault")

/** Every secret file the project keeps out of git, as repo-relative paths. */
function secretFiles() {
  const out = []
  const workers = join(ROOT, "workers")
  for (const w of readdirSync(workers, { withFileTypes: true })) {
    if (!w.isDirectory()) continue
    const p = join(workers, w.name, ".dev.vars")
    if (existsSync(p)) out.push(`workers/${w.name}/.dev.vars`)
  }
  return out.sort()
}

/** salt(16) · iv(12) · tag(16) · ciphertext — one base64 line. */
function encrypt(plaintext, passphrase) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = pbkdf2Sync(passphrase, salt, ITERATIONS, 32, "sha512")
  const c = createCipheriv("aes-256-gcm", key, iv)
  const body = Buffer.concat([c.update(plaintext, "utf8"), c.final()])
  return Buffer.concat([salt, iv, c.getAuthTag(), body]).toString("base64")
}

function decrypt(b64, passphrase) {
  const raw = Buffer.from(b64.trim(), "base64")
  const salt = raw.subarray(0, 16)
  const iv = raw.subarray(16, 28)
  const tag = raw.subarray(28, 44)
  const key = pbkdf2Sync(passphrase, salt, ITERATIONS, 32, "sha512")
  const d = createDecipheriv("aes-256-gcm", key, iv)
  d.setAuthTag(tag) // a wrong passphrase or a damaged file throws here, never returns rubbish
  return Buffer.concat([d.update(raw.subarray(44)), d.final()]).toString("utf8")
}

/** Ask for the passphrase without echoing it to the terminal. */
function askPassphrase(confirm) {
  const read = (prompt) =>
    execFileSync("/bin/sh", ["-c", `printf '%s' "${prompt}" >&2; stty -echo; read v; stty echo; printf '\\n' >&2; printf '%s' "$v"`], {
      stdio: ["inherit", "pipe", "inherit"],
    }).toString()
  const p = read("Vault passphrase: ")
  if (!p) throw new Error("no passphrase given")
  if (confirm && read("Confirm passphrase: ") !== p) throw new Error("passphrases did not match")
  return p
}

function save() {
  const files = secretFiles()
  if (!files.length) throw new Error("no .dev.vars files found — nothing to save")
  const bundle = JSON.stringify(
    { savedAt: new Date().toISOString(), files: Object.fromEntries(files.map((f) => [f, readFileSync(join(ROOT, f), "utf8")])) },
    null,
    2
  )
  const pass = askPassphrase(true)
  writeFileSync(VAULT, encrypt(bundle, pass) + "\n")
  console.log(`\nSealed ${files.length} file(s) into secrets.vault:`)
  for (const f of files) console.log(`  ${f}`)
  console.log("\nCommit it — it is ciphertext, and safe in the repo:")
  console.log("  git add secrets.vault && git commit -m 'chore: update the secrets vault'")
}

function open() {
  if (!existsSync(VAULT)) throw new Error("no secrets.vault in this repo")
  const pass = askPassphrase(false)
  let bundle
  try {
    bundle = JSON.parse(decrypt(readFileSync(VAULT, "utf8"), pass))
  } catch {
    throw new Error("could not open the vault — wrong passphrase, or the file is damaged")
  }
  for (const [rel, body] of Object.entries(bundle.files)) {
    mkdirSync(dirname(join(ROOT, rel)), { recursive: true })
    writeFileSync(join(ROOT, rel), body)
    console.log(`  restored ${rel}`)
  }
  console.log(`\nSealed on ${bundle.savedAt}. ${Object.keys(bundle.files).length} file(s) restored.`)
}

/** Does the vault exist, and is it still current? Compares KEY NAMES only —
 * never a value, so this is safe to run (and to read the output of) anywhere. */
function check() {
  const files = secretFiles()
  const keysOf = (body) => body.split("\n").map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1]).filter(Boolean)
  console.log("On disk:")
  for (const f of files) console.log(`  ${f} — ${keysOf(readFileSync(join(ROOT, f), "utf8")).join(", ") || "(empty)"}`)
  if (!existsSync(VAULT)) {
    console.log("\nNO VAULT. These secrets exist ONLY on this laptop, and Cloudflare will")
    console.log("not read a secret back to you. Run `npm run vault:save`.")
    process.exitCode = 1
    return
  }
  // Can't compare contents without the passphrase — and asking for one just to
  // run a status check would train the habit of typing it constantly. So report
  // what CAN be known without opening it: that a vault exists, and whether it is
  // committed and pushed (an uncommitted vault protects nothing).
  const tracked = (() => {
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", "secrets.vault"], { cwd: ROOT, stdio: "pipe" })
      return true
    } catch {
      return false
    }
  })()
  const dirty = (() => {
    try {
      return execFileSync("git", ["status", "--porcelain", "secrets.vault"], { cwd: ROOT }).toString().trim() !== ""
    } catch {
      return false
    }
  })()
  console.log(`\nVault: present${tracked ? ", committed to git" : " — NOT COMMITTED (it protects nothing yet)"}`)
  if (dirty) console.log("Vault has uncommitted changes — commit it, or the newest secrets aren't backed up.")
  if (!tracked || dirty) process.exitCode = 1
}

const cmd = process.argv[2]
try {
  if (cmd === "save") save()
  else if (cmd === "open") open()
  else if (cmd === "check") check()
  else {
    console.log("usage: node scripts/vault.mjs save | open | check")
    process.exitCode = 1
  }
} catch (e) {
  console.error(`\n${e instanceof Error ? e.message : e}`)
  process.exitCode = 1
}
