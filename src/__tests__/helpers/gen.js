/** Return a reproducible Mulberry32 pseudo-random number generator. */
export function rng(seed = 216) {
  let state = seed >>> 0
  return () => {
    let t = state += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))

export const pick = (r, list) => list[int(r, 0, list.length - 1)]

/** Run a seeded generator over cases and annotate any failing case. */
export function forAll(gen, fn, { n = 100, seed = 216 } = {}) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const c = gen(r)
    try {
      fn(c)
    } catch (e) {
      e.message = `[seed ${seed}, case ${i}] ${JSON.stringify(c)}\n${e.message}`
      throw e
    }
  }
}
