// pointy-top 육각 격자, 축좌표(q, r)
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export function key(q, r) { return `${q},${r}`; }
export function neighbors(q, r) { return DIRS.map(([dq, dr]) => [q + dq, r + dr]); }
export function distance(a, b) {
  const dq = a[0] - b[0], dr = a[1] - b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}
export function tilesInRadius(R) {
  const out = [];
  for (let q = -R; q <= R; q++)
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) out.push([q, r]);
  return out;
}
export function corners(R) { return [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]]; }
export function hexToPixel(q, r, size) { return [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r]; }
export function roundHex(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return [rq || 0, rr || 0];
}
export function pixelToHex(x, y, size) {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return roundHex(q, r);
}
export function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}
