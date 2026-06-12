// ULIDs: globally-unique ids that also sort by creation time. Locked rule:
// every row everywhere gets one, so rows can move between databases (sharding)
// without collisions. (Tiny modulo bias in the random half is fine for ids.)

const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" // Crockford base32

export function ulid(now: number = Date.now()): string {
  let time = ""
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ENC[t % 32] + time
    t = Math.floor(t / 32)
  }
  const rand = crypto.getRandomValues(new Uint8Array(16))
  let suffix = ""
  for (let i = 0; i < 16; i++) suffix += ENC[rand[i] % 32]
  return time + suffix
}
