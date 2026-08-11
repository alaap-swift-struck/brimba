// A SPLIT CHANNEL MUST NEVER STRAND A LISTENER.
//
// One Durable Object per team was the first hard ceiling in the whole system:
// broadcast() walks every socket in one thread, so 25,000 concurrent sessions in
// one tenant put 25,000 sends through one object per write. Splitting the
// channel across N objects divides that walk — but only if the two sides agree
// about N, and only if changing N cannot orphan a socket that is already open.
//
// The safety argument this file locks:
//   a socket connected when the count was N' sits on a shard index < N';
//   the count only ever RISES, so every later N is ≥ N';
//   a publisher fans to 0..N-1, which therefore always includes that shard.
// Break any one of those three and a user silently stops receiving live updates
// — the worst kind of failure, because nothing errors and nothing looks wrong.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  MAX_SHARDS,
  shardChannel,
  shardCount,
  shardFor,
} from "../../../shared/workers/realtime"

const workerSrc = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf8")
const cronSrc = readFileSync(
  join(__dirname, "..", "..", "tenancy", "src", "lib", "sharding.ts"),
  "utf8"
)

describe("shard addressing", () => {
  it("leaves an unsplit team addressing exactly the object it always did", () => {
    // The whole migration story rests on this: shard 0 is the BARE name, so
    // every team that has never been split keeps its existing object, its open
    // sockets, and its behaviour — no reconnect, no cutover.
    expect(shardChannel("team:01ABC", 0)).toBe("team:01ABC")
    expect(shardChannel("team:01ABC", 1)).toBe("team:01ABC#1")
  })

  it("puts every one of a person's devices on the same shard", () => {
    // The shard is picked from the USER id, not per-connection — otherwise a
    // laptop and a phone would sit on different objects and a publish would have
    // to reach both anyway, buying nothing.
    for (const n of [1, 2, 4, 8, 32]) {
      expect(shardFor("01USER", n)).toBe(shardFor("01USER", n))
    }
  })

  it("never places a listener on a shard the publisher won't reach", () => {
    // The core safety property, stated as arithmetic: for any count N, every
    // user lands strictly inside 0..N-1, which is exactly what a publish fans to.
    const users = Array.from({ length: 500 }, (_, i) => `01USER${i}XYZ`)
    for (const n of [1, 2, 4, 8, 16, 32]) {
      for (const u of users) {
        const s = shardFor(u, n)
        expect(s, `${u} landed on shard ${s} of ${n}`).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThan(n)
      }
    }
  })

  it("survives a RAISE while sockets are open — the only change the cron makes", () => {
    // Connected at N'=2, the count rises to 8. The socket keeps listening on the
    // shard it joined; a publisher now fans to 0..7. It must still be covered.
    const users = Array.from({ length: 200 }, (_, i) => `01U${i}`)
    for (const u of users) {
      const joinedAt = shardFor(u, 2)
      expect(joinedAt, "a shard from the old count must fall inside the new fan-out").toBeLessThan(8)
    }
  })

  it("spreads people across the shards instead of piling them on one", () => {
    // ULIDs lead with a timestamp, so users created together share a long
    // prefix. A naive hash would clump them all onto one object and the split
    // would achieve nothing at exactly the moment it was needed.
    const buckets = new Array(8).fill(0)
    for (let i = 0; i < 4000; i++) buckets[shardFor(`01JBRIMBA${i}`, 8)]++
    const smallest = Math.min(...buckets)
    expect(smallest, `worst shard held ${smallest} of 4000 across 8 shards`).toBeGreaterThan(300)
  })
})

describe("shard count", () => {
  it("keeps a normal team on one object", () => {
    for (const members of [0, 1, 50, 500, 5_000, 10_000]) {
      expect(shardCount(members), `${members} members must not split`).toBe(1)
    }
  })

  it("splits the yardstick tenant enough to stay under the per-object ceiling", () => {
    // 250,000 members at ~10% concurrent is 25,000 sockets. The soft limit is
    // ~1,000 requests/second per object, so the count must divide it below that.
    const n = shardCount(250_000)
    expect(25_000 / n, `${n} shards leaves ${25_000 / n} sockets per object`).toBeLessThanOrEqual(1000)
  })

  it("never exceeds the cap, however large the tenant", () => {
    expect(shardCount(100_000_000)).toBeLessThanOrEqual(MAX_SHARDS)
  })

  it("only ever grows as a team grows", () => {
    let last = 0
    for (let m = 0; m <= 400_000; m += 977) {
      const n = shardCount(m)
      expect(n, `count fell at ${m} members`).toBeGreaterThanOrEqual(last)
      last = n
    }
  })

  it("agrees with the threshold the nightly job filters on", () => {
    // The cron only LOOKS at teams past SHARD_THRESHOLD_MEMBERS. If the ladder
    // ever started splitting below that, those teams would never be considered
    // and would sit on one object for ever — silently, since nothing errors.
    const threshold = Number(
      /SHARD_THRESHOLD_MEMBERS = ([\d_]+)/.exec(cronSrc)?.[1].replace(/_/g, "")
    )
    expect(threshold, "the threshold constant must be readable").toBeGreaterThan(0)
    expect(shardCount(threshold), "nothing at or below the threshold may need a split").toBe(1)
    expect(
      shardCount(threshold + 1),
      "the very next member must be the one that triggers a split"
    ).toBeGreaterThan(1)
  })
})

describe("the two sides of the wire", () => {
  it("fans a publish to EVERY shard, not just the caller's", () => {
    const publish = workerSrc.slice(workerSrc.indexOf('url.pathname === "/publish"'))
    expect(
      /Promise\.all\(\s*Array\.from\(\{ length: shards \}/.test(publish),
      "publish must fan to all shards — reaching one leaves the rest deaf"
    ).toBe(true)
    expect(
      publish.includes("shardChannel(channel, i)"),
      "the fan-out must address shards through the shared helper, not its own string"
    ).toBe(true)
  })

  it("picks the subscriber's shard from the SESSION, never from the request", () => {
    // A client-supplied shard would let anyone choose an object — including an
    // empty one, which is a silent denial of their own live updates, or every
    // one at once. The id comes from the verified session.
    expect(workerSrc).toMatch(/shardFor\(user\.id,/)
    expect(
      /searchParams\.get\(["']shard["']\)/.test(workerSrc),
      "the shard must never be read off the query string"
    ).toBe(false)
  })

  it("keeps the nightly recompute one-way", () => {
    const fn = cronSrc.slice(cronSrc.indexOf("export async function recomputeShardCounts"))
    expect(
      /UPDATE teams SET shard_count = \? WHERE id = \? AND shard_count < \?/.test(fn),
      "the raise must carry its own predicate: without `shard_count < ?` the cron could LOWER a count and strand every socket above it"
    ).toBe(true)
  })
})
