export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, weights) {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [v, w] of weights) { x -= w; if (x < 0) return v; }
  return weights[weights.length - 1][0];
}
