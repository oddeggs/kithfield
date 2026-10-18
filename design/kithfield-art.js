/* Kithfield art — hand-drawn Canvas 2D renderer.
   Techniques adapted from the hand-drawn-canvas-animation skill: seeded marks held per drawing,
   pressure-tapered ink ribbons, interrupted pencil passes, granulating pigment washes, opaque gouache
   bodies, paper tooth, and a night pass that darkens everything except pools of light.
   Characters are whole drawings cached as sprites (open / blink / sleep); motion is breathing + exposure on twos. */
(() => {
'use strict';
if (window.KF) return;
const TAU = Math.PI * 2, INK = '#2a221d';
let U = 1; // local units per screen px (so widths/grain stay in px inside scaled drawings)
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(i, s) { let h = (Math.imul(i | 0, 374761393) + Math.imul((s | 0) + 1, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function rng(seed) { let a = (Math.imul(seed | 0, 2654435761) >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function noise1(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, s), hash(i + 1, s), u) * 2 - 1; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }
const shade = (c, t) => mix(c, '#1c140f', t), tint = (c, t) => mix(c, '#ffffff', t);

/* ---------- geometry ---------- */
function crPts(pts, close, step = 1.6) {
  const n = pts.length; if (n < 3 && !close) return lin(pts, false, step);
  const P = i => close ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)], out = [], segs = close ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t, f = k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  if (!close) out.push(pts[n - 1].slice());
  return out;
}
function lin(pts, close, step = 1.6) {
  const out = [], n = pts.length, segs = close ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < m; j++) out.push([lerp(a[0], b[0], j / m), lerp(a[1], b[1], j / m)]);
  }
  if (!close) out.push(pts[n - 1].slice());
  return out;
}
function toPath(pts, close = true, smooth = true) {
  const s = smooth ? crPts(pts, close, 2 * U) : pts, p = new Path2D();
  p.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) p.lineTo(s[i][0], s[i][1]); if (close) p.closePath(); return p;
}
function blob(cx, cy, rx, ry, seed = 1, amp = .05, n = 10, rot = 0) {
  const pts = [], cr = Math.cos(rot), sr = Math.sin(rot);
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU, r = 1 + (hash(k, seed) * 2 - 1) * amp, x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}
function local(c, x, y, k, fn) { c.save(); c.translate(x, y); c.scale(k, k); const pu = U; U = U / k; try { return fn(); } finally { U = pu; c.restore(); } }

/* ---------- marks ---------- */
const TAPER = [[0, .22], [.12, .9], [.5, 1], [.86, .82], [1, .18]], FLAT = [[0, .55], [.5, 1], [1, .55]];
function prof(u, p) { for (let i = 1; i < p.length; i++) if (u <= p[i][0]) { const a = p[i - 1], b = p[i]; return lerp(a[1], b[1], (u - a[0]) / ((b[0] - a[0]) || 1)); } return p[p.length - 1][1]; }
// Brush-pen ink: a filled ribbon whose half-width follows a pressure profile; closed shapes start at a seeded point and overlap their start.
function ink(c, pts, o = {}) {
  const w = (o.w ?? 1.8) * U, color = o.color || INK, close = !!o.close, seed = o.seed ?? 1, p = o.p || TAPER, wob = (o.wob ?? .32) * w, smooth = o.smooth !== false;
  let s = smooth ? crPts(pts, close, 1.1 * U) : lin(pts, close, 1.1 * U);
  if (close) { const n = s.length, st = Math.floor(hash(3, seed) * n), ov = Math.max(2, Math.floor(n * (o.over ?? .07))), r = []; for (let i = 0; i < n + ov; i++) r.push(s[(st + i) % n]); s = r; }
  if (s.length < 2) return;
  const L = [0]; for (let i = 1; i < s.length; i++) L.push(L[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  const T = L[L.length - 1] || 1, left = [], right = [], fq = .05 / U;
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, off = noise1(L[i] * fq, seed) * wob;
    const hw = w * .5 * prof(L[i] / T, p) * (.78 + .44 * (noise1(L[i] * fq * .6, seed + 5) * .5 + .5));
    const x = s[i][0] + nx * off, y = s[i][1] + ny * off;
    left.push([x + nx * hw, y + ny * hw]); right.push([x - nx * hw, y - ny * hw]);
  }
  c.save(); c.globalAlpha *= o.alpha ?? 1; c.fillStyle = color; c.beginPath(); c.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) c.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
  c.closePath(); c.fill(); c.restore();
}
// Graphite: narrow interrupted passes sharing one gesture (after cels.js drawCel 'pencil').
function pencil(c, pts, o = {}) {
  const w = (o.w ?? 1) * U, color = o.color || INK, close = !!o.close, seed = o.seed ?? 1, alpha = o.alpha ?? .7, passes = o.passes ?? 2;
  const s = o.smooth === false ? lin(pts, close, 2.2 * U) : crPts(pts, close, 2.2 * U); if (s.length < 2) return;
  c.save(); c.strokeStyle = color; c.lineCap = 'round';
  for (let pass = 0; pass < passes; pass++) {
    const spread = (pass - (passes - 1) / 2) * w * .7;
    for (let i = 1; i < s.length; i++) {
      const tooth = hash(i * 3 + pass, seed); if (tooth < .1) continue;
      const u = i / s.length, pr = Math.sqrt(Math.sin(Math.PI * clamp(u, .03, .97)));
      const a = s[i - 1], b = s[i], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const d = noise1(u * 5 + pass * 11, seed) * w * .6 + spread, nx = -ty / tl * d, ny = tx / tl * d;
      c.lineWidth = w * (.45 + .55 * pr); c.globalAlpha = alpha * (.34 + tooth * .36) * (close ? 1 : .55 + .45 * pr);
      c.beginPath(); c.moveTo(a[0] + nx, a[1] + ny); c.lineTo(b[0] + nx, b[1] + ny); c.stroke();
    }
  }
  c.restore();
}
function gouache(c, pts, color, al = 1, smooth = true) { c.save(); c.globalAlpha *= al; c.fillStyle = color; c.fill(toPath(pts, true, smooth)); c.restore(); }
// Pigment wash: shifted a few px off the line, multiplied, granulated, with a darker drying edge (after materials.js pigmentWash).
function wash(c, pts, color, o = {}) {
  const seed = o.seed ?? 1, al = o.al ?? .45, off = (o.off ?? 1.5) * U, gran = o.gran ?? .16, edge = o.edge ?? .3, r = rng(seed);
  const dx = (r() - .5) * 2 * off, dy = (r() - .5) * 2 * off;
  const wp = pts.map((p, k) => [p[0] + dx + (hash(k, seed + 2) - .5) * off, p[1] + dy + (hash(k, seed + 3) - .5) * off]);
  const path = toPath(wp, true, o.smooth !== false);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of wp) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  c.save(); if (o.clip) c.clip(o.clip); c.globalCompositeOperation = o.blend || 'multiply'; c.globalAlpha *= al; c.fillStyle = color; c.fill(path);
  if (gran > 0) {
    c.clip(path); c.globalAlpha *= gran; c.beginPath();
    const n = Math.min(1500, Math.ceil((x1 - x0) * (y1 - y0) / (30 * U * U)));
    for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), rad = (.4 + r() * 1.6) * U; c.moveTo(x + rad, y); c.ellipse(x, y, rad * 1.3, rad, r() * 3, 0, TAU); }
    c.fill();
  }
  c.restore();
  if (edge > 0) { c.save(); if (o.clip) c.clip(o.clip); c.clip(path); c.globalCompositeOperation = o.blend || 'multiply'; c.globalAlpha *= al * edge; c.strokeStyle = color; c.lineWidth = 3 * U; c.stroke(path); c.restore(); }
}
function paper(c, w, h, color, seed = 1) {
  c.fillStyle = color; c.fillRect(0, 0, w, h);
  const r = rng(seed), n = Math.min(7000, w * h / 55);
  c.fillStyle = 'rgba(80,58,36,.07)'; c.beginPath(); for (let i = 0; i < n; i++) c.rect(r() * w, r() * h, .3 + r(), .3 + r()); c.fill();
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); for (let i = 0; i < n * .6; i++) c.rect(r() * w, r() * h, .3 + r(), .3 + r()); c.fill();
  c.strokeStyle = 'rgba(90,70,50,.05)'; c.lineWidth = .6; c.beginPath();
  for (let i = 0; i < n / 50; i++) { const x = r() * w, y = r() * h, a = r() * TAU, l = 4 + r() * 12; c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + .6) * l * .5, y + Math.sin(a + .6) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); }
  c.stroke();
}
function glow(c, x, y, r, color, a = .5, op = 'screen') {
  const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(color, a)); g.addColorStop(.45, rgba(color, a * .35)); g.addColorStop(1, rgba(color, 0));
  c.save(); c.globalCompositeOperation = op; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}
function blush(c, x, y, r, seed) { wash(c, blob(x, y, r, r * .62, seed, .1, 8), '#ec8f86', { al: .34, gran: .05, edge: .1, off: .3, seed }); }
function eye(c, x, y, r, st, lw, seed, col = INK, glint = '#fffaf0') {
  if (st === 'open') { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, r * .86, r, 0, 0, TAU); c.fill(); if (glint) { c.fillStyle = glint; c.beginPath(); c.arc(x - r * .28, y - r * .38, r * .3, 0, TAU); c.fill(); } }
  else if (st === 'blink') ink(c, [[x - r * 1.1, y + r * .1], [x, y + r * .4], [x + r * 1.1, y + r * .1]], { w: lw * .8, seed, color: col, p: FLAT });
  else ink(c, [[x - r * 1.2, y - r * .1], [x, y + r * .75], [x + r * 1.2, y - r * .1]], { w: lw * .85, seed, color: col, p: FLAT });
}

/* ---------- the cast ---------- */
const CR = {};
CR.rabbit = { seed: 11, fill: '#fbf5ea', wash: '#d8b496', acc: '#eba096', tint: '#f2e0d4', head: [0, -74],
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    const ears = [blob(-12, -114, 7, 24, S + 1, .04, 10, -.16), blob(12, -113, 7, 23, S + 2, .04, 10, .2)];
    const inner = [blob(-12.5, -112, 3.2, 16, S + 3, .05, 8, -.16), blob(12.5, -111, 3.2, 15, S + 4, .05, 8, .2)];
    ears.forEach((e, i) => { gouache(c, e, F); wash(c, inner[i], this.acc, { al: .6, seed: S + 5 + i, off: .5, edge: .2 }); ink(c, e, { close: true, w: lw, seed: S + 7 + i }); });
    const tail = blob(-28, -20, 9, 8, S + 9, .14, 9); gouache(c, tail, F); ink(c, tail, { close: true, w: lw * .8, seed: S + 10 });
    const body = blob(0, -33, 30, 32, S + 11, .04, 12), bp = toPath(body);
    gouache(c, body, F); wash(c, blob(10, -22, 22, 22, S + 12, .12, 9), this.wash, { al: .5, seed: S + 13, clip: bp });
    ink(c, body, { close: true, w: lw, seed: S + 14 });
    [[-13, -3], [13, -3]].forEach(([x, y], i) => { const f = blob(x, y, 11, 5, S + 15 + i, .06, 9); gouache(c, f, F); ink(c, f, { close: true, w: lw * .85, seed: S + 17 + i }); });
    ink(c, [[-15, -50], [-11, -41], [-5, -37]], { w: lw * .8, seed: S + 19 }); ink(c, [[15, -50], [11, -41], [5, -37]], { w: lw * .8, seed: S + 20 });
    const head = blob(0, -75, 25, 22, S + 21, .03, 12), hp = toPath(head);
    gouache(c, head, F); wash(c, blob(9, -67, 18, 12, S + 22, .1, 8), this.wash, { al: .25, seed: S + 23, clip: hp }); ink(c, head, { close: true, w: lw, seed: S + 24 });
    blush(c, -15, -69, 5, S + 25); blush(c, 15, -69, 5, S + 26);
    eye(c, -9, -77, 2.9, o.st, lw, S + 27); eye(c, 9, -77, 2.9, o.st, lw, S + 28);
    const nose = [[-2.8, -71.5], [2.8, -71.5], [0, -68.6]]; gouache(c, nose, this.acc, 1, false); ink(c, nose, { close: true, smooth: false, w: lw * .5, seed: S + 29 });
    ink(c, [[-4.5, -66.4], [-2, -65], [0, -67.2], [2, -65], [4.5, -66.4]], { w: lw * .6, seed: S + 30, p: FLAT });
  } };
CR.hedgehog = { seed: 21, fill: '#dcb88f', wash: '#7b4d31', face: '#f7e8d0', tint: '#efdfca', head: [26, -26],
  draw(c, o) { const S = this.seed, lw = o.lw;
    [[14, -2], [-18, -2]].forEach(([x, y], i) => { const f = blob(x, y, 6.5, 3.6, S + 40 + i, .08, 8); gouache(c, f, '#6a4630'); });
    const cx = -6, cy = -28, rx = 38, ry = 27, N = 24, pts = [];
    for (let k = 0; k <= N; k++) { const a = Math.PI * (1.05 - k / N), r = k % 2 ? 1.19 + hash(k, S) * .08 : 1; pts.push([cx + Math.cos(a) * rx * r, cy - Math.sin(a) * ry * r]); }
    for (let k = 1; k < 12; k++) { const a = -Math.PI * k / 12; pts.push([cx + Math.cos(a) * rx * .98, cy - Math.sin(a) * ry * .98]); }
    gouache(c, pts, this.fill, 1, false); wash(c, pts, this.wash, { al: .55, seed: S + 1, smooth: false, off: 1.5 });
    for (let j = 0; j < 15; j++) { const a = Math.PI * (.97 - j / 15 * .86); pencil(c, [[cx + Math.cos(a) * rx * .5, cy - Math.sin(a) * ry * .45], [cx + Math.cos(a + .06) * rx * .92, cy - Math.sin(a + .06) * ry * .92]], { w: .9, color: '#5a3824', alpha: .7, seed: S + 50 + j, passes: 1 }); }
    ink(c, pts, { close: true, smooth: false, w: lw, seed: S + 2 });
    const fp = [[6, -36], [20, -39], [33, -33], [46, -25], [47, -20], [36, -12], [20, -6], [7, -11], [2, -24]];
    gouache(c, fp, this.face); ink(c, fp, { close: true, w: lw, seed: S + 3 });
    c.fillStyle = INK; c.beginPath(); c.ellipse(47, -22.5, 3.3, 2.9, 0, 0, TAU); c.fill();
    ink(c, [[13, -37], [15, -43], [20, -40]], { w: lw * .8, seed: S + 4 });
    eye(c, 28, -27, 2.6, o.st, lw, S + 5); blush(c, 24, -16, 4.5, S + 6);
    ink(c, [[37, -15], [40, -14], [43, -16]], { w: lw * .55, seed: S + 7, p: FLAT });
  } };
CR.frog = { seed: 31, fill: '#d4e2ad', wash: '#6b9748', belly: '#eef0d8', tint: '#e2ead0', head: [0, -38],
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    [blob(-35, -8, 10, 7, S + 6, .1, 9), blob(35, -8, 10, 7, S + 7, .1, 9)].forEach((b, i) => { gouache(c, b, F); wash(c, b, this.wash, { al: .35, seed: S + 30 + i }); ink(c, b, { close: true, w: lw * .85, seed: S + 8 + i }); });
    const bumps = [blob(-17, -43, 12.5, 12, S + 1, .03, 10), blob(17, -43, 12.5, 12, S + 2, .03, 10)], body = blob(0, -22, 40, 22, S + 3, .04, 14);
    const clipP = new Path2D(); clipP.addPath(toPath(body)); bumps.forEach(b => clipP.addPath(toPath(b)));
    bumps.forEach((b, i) => { gouache(c, b, F); });
    wash(c, blob(0, -44, 34, 12, S + 21, .08, 10), this.wash, { al: .45, seed: S + 22, clip: clipP });
    bumps.forEach((b, i) => ink(c, b, { close: true, w: lw, seed: S + 15 + i }));
    gouache(c, body, F);
    wash(c, blob(0, -32, 42, 14, S + 9, .08, 10), this.wash, { al: .48, seed: S + 10, clip: toPath(body) });
    [[-24, -26, 5, 4], [22, -29, 4, 3.4], [-7, -36, 3.4, 2.8]].forEach((s, i) => wash(c, blob(s[0], s[1], s[2], s[3], S + 11 + i, .12, 8), this.spot || '#4f7a35', { al: .45, seed: S + 11 + i, off: .4, gran: .05 }));
    gouache(c, blob(0, -11, 22, 9, S + 14, .05, 10), this.belly, .92);
    ink(c, body, { close: true, w: lw, seed: S + 17 });
    [blob(-18, -2, 10, 4.5, S + 4, .08, 9), blob(18, -2, 10, 4.5, S + 5, .08, 9)].forEach((f, i) => { gouache(c, f, F); ink(c, f, { close: true, w: lw * .85, seed: S + 18 + i }); });
    eye(c, -17, -46, 5, o.st, lw, S + 23); eye(c, 17, -46, 5, o.st, lw, S + 24);
    ink(c, [[-15, -29], [-7, -24.6], [0, -23.6], [7, -24.6], [15, -29]], { w: lw * .8, seed: S + 25 });
    blush(c, -26, -27, 4.5, S + 26); blush(c, 26, -27, 4.5, S + 27);
  } };
CR.mole = { seed: 41, fill: '#cbbdc8', wash: '#65566e', acc: '#ee9f9c', scarf: '#d4704e', tint: '#e6dde4', head: [0, -62],
  draw(c, o) { const S = this.seed, lw = o.lw;
    [[-12, -2], [12, -2]].forEach(([x, y], i) => { const f = blob(x, y, 9, 4, S + 20 + i, .08, 9); gouache(c, f, this.acc); ink(c, f, { close: true, w: lw * .8, seed: S + 22 + i }); });
    const body = blob(0, -40, 29, 39, S + 1, .04, 12);
    gouache(c, body, this.fill); wash(c, blob(9, -30, 22, 30, S + 2, .1, 9), this.wash, { al: .5, seed: S + 3, clip: toPath(body) });
    wash(c, blob(-6, -66, 14, 9, S + 30, .1, 8), '#ffffff', { al: .25, seed: S + 31, blend: 'source-over', gran: 0, edge: 0, clip: toPath(body) });
    ink(c, body, { close: true, w: lw, seed: S + 4 });
    const tail = [[-10, -46], [-17, -25], [-25, -27], [-20, -46]]; gouache(c, tail, this.scarf); ink(c, tail, { close: true, w: lw * .8, seed: S + 5 });
    const band = [[-27, -45], [-13, -41], [0, -40], [13, -41], [27, -45], [26, -53], [13, -49], [0, -48], [-13, -49], [-26, -53]];
    gouache(c, band, this.scarf); wash(c, band, '#9e4630', { al: .3, seed: S + 6 }); ink(c, band, { close: true, w: lw * .9, seed: S + 7 });
    [[[-24, -47], [-22, -51]], [[-12, -44], [-11, -48]], [[0, -43], [0, -47]], [[12, -44], [11, -48]], [[-17, -32], [-21, -33]]].forEach((l, i) => pencil(c, l, { w: 1, color: '#fbe9dc', alpha: .9, seed: S + 60 + i, passes: 1 }));
    [[-17, -27], [17, -27]].forEach(([x, y], i) => { const h = blob(x, y, 8, 6, S + 8 + i, .08, 9); gouache(c, h, this.acc); ink(c, h, { close: true, w: lw * .8, seed: S + 10 + i });
      for (let k = -1; k <= 1; k++) ink(c, [[x + k * 3.5, y + 4.5], [x + k * 4, y + 7.5]], { w: lw * .5, seed: S + 70 + i * 3 + k, p: FLAT }); });
    const nose = blob(0, -61, 7, 5.4, S + 12, .1, 8); gouache(c, nose, this.acc); ink(c, nose, { close: true, w: lw * .8, seed: S + 13 });
    [[[-6, -60], [-19, -63]], [[-6, -58], [-18, -55]], [[6, -60], [19, -63]], [[6, -58], [18, -55]]].forEach((l, i) => pencil(c, l, { w: .8, alpha: .7, seed: S + 80 + i, passes: 1 }));
    eye(c, -9, -69, 1.9, o.st, lw, S + 14); eye(c, 9, -69, 1.9, o.st, lw, S + 15);
    blush(c, -15, -61, 4, S + 16); blush(c, 15, -61, 4, S + 17);
  } };
CR.sheep = { seed: 51, fill: '#fdf8ef', wash: '#c9bca9', face: '#3f3734', tint: '#ece6da', head: [30, -55],
  draw(c, o) { const S = this.seed, lw = o.lw;
    [[[-20, -14], [-21, 0]], [[-7, -12], [-7, 0]], [[8, -12], [8, 0]], [[20, -14], [21, 0]]].forEach((l, i) => ink(c, l, { w: lw * 2.6, color: this.face, seed: S + 30 + i, p: FLAT }));
    const cx = -4, cy = -40, rx = 37, ry = 28, N = 11, wool = [];
    for (let k = 0; k < N * 8; k++) { const a = k / (N * 8) * TAU, r = 1 + .11 * Math.abs(Math.sin(a * N / 2)) + (hash(Math.floor(k / 8), S) - .5) * .03; wool.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
    gouache(c, wool, this.fill, 1, false); wash(c, blob(-2, -27, 34, 15, S + 1, .1, 9), this.wash, { al: .5, seed: S + 2, clip: toPath(wool, true, false) });
    [[-22, -46], [-6, -54], [8, -40], [-16, -30], [14, -54]].forEach(([x, y], i) => pencil(c, blob(x, y, 3.5, 3, S + 40 + i, .2, 6).slice(0, 5), { w: .9, color: '#9b8d7b', alpha: .8, seed: S + 40 + i, passes: 1 }));
    ink(c, wool, { close: true, smooth: false, w: lw, seed: S + 3 });
    [blob(20, -63, 7, 3.2, S + 4, .08, 8, -.5), blob(40, -61, 7, 3.2, S + 5, .08, 8, .6)].forEach((e, i) => { gouache(c, e, this.face); ink(c, e, { close: true, w: lw * .6, seed: S + 6 + i }); });
    const face = blob(30, -53, 11.5, 15, S + 8, .04, 10, .25); gouache(c, face, this.face); ink(c, face, { close: true, w: lw * .7, seed: S + 9 });
    const tuft = []; for (let k = 0; k < 40; k++) { const a = k / 40 * TAU, r = 1 + .16 * Math.abs(Math.sin(a * 2.5)); tuft.push([29 + Math.cos(a) * 10 * r, -66 + Math.sin(a) * 5.5 * r]); }
    gouache(c, tuft, this.fill, 1, false); ink(c, tuft, { close: true, smooth: false, w: lw * .8, seed: S + 10 });
    eye(c, 25.5, -55, 2.1, o.st, lw, S + 11, '#f6efe2', null); eye(c, 34.5, -54, 2.1, o.st, lw, S + 12, '#f6efe2', null);
    ink(c, [[28, -45.5], [30.5, -43.5], [33, -45.5]], { w: lw * .55, color: '#e9ddd0', seed: S + 13, p: FLAT });
  } };
CR.owl = { seed: 61, fill: '#e6cfa4', wash: '#9a6a40', disc: '#f7eedb', acc: '#dba04a', tint: '#efe2c8', head: [0, -62],
  draw(c, o) { const S = this.seed, lw = o.lw;
    [[[-24, -76], [-27, -97], [-10, -85]], [[24, -76], [27, -97], [10, -85]]].forEach((t, i) => { gouache(c, t, this.fill, 1, false); wash(c, t, this.wash, { al: .5, seed: S + 20 + i, smooth: false }); ink(c, t, { close: true, smooth: false, w: lw * .9, seed: S + 22 + i }); });
    const body = blob(0, -45, 29, 44, S + 1, .03, 12), bp = toPath(body);
    gouache(c, body, this.fill);
    wash(c, blob(-21, -42, 12, 34, S + 2, .1, 9), this.wash, { al: .5, seed: S + 3, clip: bp }); wash(c, blob(21, -42, 12, 34, S + 4, .1, 9), this.wash, { al: .5, seed: S + 5, clip: bp });
    gouache(c, blob(0, -27, 16, 21, S + 6, .05, 10), '#f5ead2', .9);
    for (let r = 0; r < 4; r++) for (let k = -1; k <= 1; k++) { if (r === 3 && k) continue; const x = k * 8 + (r % 2) * 4 - 2, y = -40 + r * 8; pencil(c, [[x - 2.5, y], [x, y + 2.5], [x + 2.5, y]], { w: .9, color: '#8a6040', alpha: .9, seed: S + 40 + r * 3 + k, passes: 1 }); }
    ink(c, body, { close: true, w: lw, seed: S + 7 });
    ink(c, [[-25, -58], [-29, -38], [-21, -16]], { w: lw * .9, seed: S + 8 }); ink(c, [[25, -58], [29, -38], [21, -16]], { w: lw * .9, seed: S + 9 });
    [blob(-12, -63, 12.5, 11.5, S + 10, .04, 10), blob(12, -63, 12.5, 11.5, S + 11, .04, 10)].forEach((d, i) => { gouache(c, d, this.disc); ink(c, d, { close: true, w: lw * .7, seed: S + 12 + i }); });
    eye(c, -12, -63, 4.8, o.st, lw, S + 14); eye(c, 12, -63, 4.8, o.st, lw, S + 15);
    const beak = [[-3.8, -57.5], [3.8, -57.5], [0, -50]]; gouache(c, beak, this.acc, 1, false); ink(c, beak, { close: true, smooth: false, w: lw * .6, seed: S + 16 });
    [-10, 10].forEach((x, i) => [-3, 0, 3].forEach((d, k) => ink(c, [[x, -2], [x + d, 2]], { w: lw * .7, color: '#b07a2c', seed: S + 50 + i * 3 + k, p: FLAT })));
    blush(c, -22, -55, 4, S + 17); blush(c, 22, -55, 4, S + 18);
  } };
function rbox(cx, cy, hw, hh, r, seed) { const pts = [], n = 5; [[hw - r, -hh + r, -Math.PI / 2], [hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI]].forEach(([x, y, a0], k) => { for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + x + Math.cos(a) * r + (hash(k * 9 + i, seed) - .5) * .8, cy + y + Math.sin(a) * r + (hash(k * 9 + i + 50, seed) - .5) * .8]); } }); return pts; }
function shrink(p, k, dy = 1.5) { const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length; return p.map(q => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k + dy]); }
function part(c, pts, fill, lw, seed, o = {}) { const sm = o.smooth !== false; gouache(c, pts, fill, 1, sm); if (o.wash) wash(c, o.wp || pts, o.wash, { al: o.al ?? .45, seed: seed + 1, clip: o.wp ? toPath(pts, true, sm) : undefined, smooth: o.wp ? true : sm }); if (o.ink !== false) ink(c, pts, { close: true, w: lw * (o.lw ?? 1), seed: seed + 2, smooth: sm }); }
CR.fox = { seed: 71, fill: '#e8955a', wash: '#b2552a', chest: '#fbf3e6', sock: '#3a2a22', tint: '#f3dcc8', head: [0, -76], stage: .5, wd: 74,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill, ec = this.eyeC || INK;
    part(c, blob(-28, -24, 15, 27, S, .05, 12, -.55), F, lw, S + 1, { wash: this.wash, wp: blob(-24, -18, 12, 20, S + 4, .1, 9, -.55) });
    part(c, blob(-40, -45, 7.5, 8.5, S + 5, .08, 9, -.5), this.chest, lw, S + 6);
    const body = blob(0, -34, 23, 33, S + 9, .04, 12), bp = toPath(body); gouache(c, body, F); wash(c, blob(10, -26, 16, 26, S + 10, .1, 9), this.wash, { al: .45, seed: S + 11, clip: bp }); gouache(c, blob(0, -40, 11, 19, S + 12, .06, 9), this.chest); ink(c, body, { close: true, w: lw, seed: S + 13 });
    [-9, 9].forEach((x, i) => part(c, blob(x, -3, 7.5, 4.5, S + 14 + i, .08, 8), this.sock, lw * .8, S + 16 + i * 3));
    ink(c, [[-7, -30], [-8, -8]], { w: lw * .7, seed: S + 22 }); ink(c, [[7, -30], [8, -8]], { w: lw * .7, seed: S + 23 });
    [[[-19, -82], [-16, -112], [-3, -92]], [[19, -82], [16, -112], [3, -92]]].forEach((e, i) => { part(c, e, F, lw, S + 24 + i * 3, { smooth: false, wash: this.wash }); gouache(c, shrink(e, .5, 2), this.sock, .8, false); });
    const head = blob(0, -76, 22, 18, S + 30, .03, 12), hp = toPath(head); gouache(c, head, F); wash(c, blob(9, -72, 14, 10, S + 31, .1, 8), this.wash, { al: .3, seed: S + 32, clip: hp });
    c.save(); c.clip(hp); gouache(c, blob(0, -63, 18, 10, S + 33, .06, 10), this.chest); c.restore(); ink(c, head, { close: true, w: lw, seed: S + 34 });
    eye(c, -8, -79, 2.7, o.st, lw, S + 35, ec); eye(c, 8, -79, 2.7, o.st, lw, S + 36, ec);
    c.fillStyle = INK; c.beginPath(); c.ellipse(0, -70, 3, 2.2, 0, 0, TAU); c.fill(); ink(c, [[-3.5, -65.5], [0, -64], [3.5, -65.5]], { w: lw * .6, seed: S + 37, p: FLAT });
    blush(c, -14, -70, 4, S + 38); blush(c, 14, -70, 4, S + 39);
  } };
CR.duck = { seed: 81, fill: '#fdf8ee', wash: '#c9bba5', hood: null, bill: '#eba23b', tint: '#f3ecdc', head: [10, -44], stage: .62, az: 1.25, wd: 66,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    [[-6, -1], [8, -1]].forEach(([x, y], i) => part(c, blob(x, y, 7, 3, S + i, .1, 8), this.bill, lw * .8, S + 2 + i * 3));
    part(c, [[-18, -26], [-33, -36], [-28, -22], [-20, -14]], F, lw, S + 8, { wash: this.wash });
    part(c, blob(0, -20, 24, 17, S + 11, .04, 12), F, lw, S + 12, { wash: this.wash, wp: blob(-2, -12, 22, 9, S + 15, .1, 9) });
    const wing = blob(-5, -21, 13, 7.5, S + 16, .06, 9, -.2); part(c, wing, F, lw * .8, S + 17, { wash: this.wash, al: .35 });
    [[-12, -20], [-6, -17]].forEach((p, i) => pencil(c, [p, [p[0] + 9, p[1] - 2]], { w: .8, alpha: .5, seed: S + 40 + i, passes: 1 }));
    const hd = blob(10, -45, 13, 12.5, S + 20, .03, 10); part(c, hd, this.hood || F, lw, S + 21, { wash: this.hood ? shade(this.hood, .3) : this.wash, wp: blob(14, -40, 9, 7, S + 24, .1, 8), al: .3 });
    if (this.hood) ink(c, [[2, -34], [10, -32], [18, -34]], { w: lw * 1.6, color: '#fbf6ea', seed: S + 25, p: FLAT });
    part(c, [[20, -46], [31, -44.5], [32, -41], [21, -40]], this.bill, lw * .8, S + 26, { smooth: false }); ink(c, [[21, -43], [30, -42.5]], { w: lw * .5, seed: S + 29, p: FLAT });
    eye(c, 13, -49, 2.3, o.st, lw, S + 30, this.eyeC || (this.hood ? '#120c0a' : INK)); blush(c, 16, -41, 3.4, S + 31);
  } };
CR.tortoise = { seed: 91, fill: '#c9b98a', wash: '#8a7a4a', shell: '#a8b06a', shellW: '#5f6a33', rim: '#7d7a45', tint: '#e8e6d2', head: [38, -18], stage: .82, az: 1.3, wd: 92,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    [[-24, -4], [-9, -2], [12, -2], [26, -4]].forEach(([x, y], i) => part(c, blob(x, y, 6, 6, S + i, .1, 8), F, lw * .85, S + 5 + i * 3, { wash: this.wash }));
    part(c, [[-32, -10], [-42, -6], [-32, -4]], F, lw * .8, S + 20, { smooth: false });
    part(c, blob(30, -13, 9, 6, S + 21, .08, 8, -.2), F, lw, S + 22, { wash: this.wash });
    part(c, blob(40, -18, 11, 9, S + 25, .05, 10), F, lw, S + 26, { wash: this.wash, wp: blob(44, -13, 7, 4, S + 29, .1, 8), al: .35 });
    const dome = []; for (let k = 0; k <= 16; k++) { const a = Math.PI * (1 - k / 16); dome.push([Math.cos(a) * 36, -10 - Math.sin(a) * 30]); }
    const dp = toPath(dome); gouache(c, dome, this.shell); wash(c, dome, this.shellW, { al: .45, seed: S + 30 });
    c.save(); c.clip(dp); [[0, -28, 9], [-17, -22, 8], [17, -22, 8], [-28, -13, 6], [28, -13, 6], [-9, -13, 6.5], [9, -13, 6.5], [0, -40, 6], [-14, -36, 6], [14, -36, 6]].forEach(([x, y, r], i) => { const hx = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; hx.push([x + Math.cos(a) * r, y + Math.sin(a) * r * .85]); } if (i === 0) gouache(c, hx, tint(this.shell, .25), .8, false); pencil(c, hx, { close: true, smooth: false, w: 1, color: shade(this.shellW, .35), alpha: .85, seed: S + 50 + i, passes: 1 }); }); c.restore();
    ink(c, dome, { close: true, w: lw, seed: S + 40 });
    part(c, rbox(0, -9, 38, 3.6, 3.4, S + 41), this.rim, lw * .9, S + 42, { smooth: false });
    eye(c, 43, -20.5, 2.1, o.st, lw, S + 45, this.eyeC || INK); ink(c, [[44, -13.5], [47, -13], [49.5, -14.5]], { w: lw * .55, seed: S + 46, p: FLAT }); blush(c, 41, -14, 3.2, S + 47);
  } };
CR.badger = { seed: 101, fill: '#a3a2a6', wash: '#55545c', face: '#f7f3ea', stripe: '#2a2624', tint: '#e4e3e3', head: [30, -28], stage: .78, az: 1.15, wd: 96,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    [[-28, -4], [-13, -3], [6, -3], [18, -4]].forEach(([x, y], i) => part(c, blob(x, y, 6.5, 5, S + i, .1, 8), this.stripe, lw * .8, S + 5 + i * 3));
    part(c, [[-38, -26], [-48, -20], [-38, -16]], F, lw * .8, S + 20, { smooth: false, wash: this.wash });
    part(c, blob(-6, -22, 35, 19, S + 21, .04, 14), F, lw, S + 22, { wash: this.wash, wp: blob(-8, -33, 32, 9, S + 25, .1, 10) });
    for (let i = 0; i < 7; i++) pencil(c, [[-30 + i * 8, -36 + Math.abs(i - 3)], [-33 + i * 8, -28]], { w: .8, color: shade(this.wash, .3), alpha: .6, seed: S + 30 + i, passes: 1 });
    part(c, blob(20, -40, 4.5, 4, S + 40, .08, 8), F, lw * .8, S + 41);
    const hd = blob(31, -28, 16, 12.5, S + 44, .04, 10, .15), hp = toPath(hd); gouache(c, hd, this.face);
    c.save(); c.clip(hp); gouache(c, [[14, -38], [26, -36], [44, -28], [47, -24], [26, -28], [14, -30]], this.stripe, 1, false); wash(c, blob(26, -20, 12, 6, S + 46, .1, 8), '#c9c0b2', { al: .4, seed: S + 47 }); c.restore(); ink(c, hd, { close: true, w: lw, seed: S + 48 });
    c.fillStyle = this.stripe; c.beginPath(); c.ellipse(46, -24.5, 3, 2.4, 0, 0, TAU); c.fill();
    eye(c, 33, -31, 2.3, o.st, lw, S + 49, o.st === 'open' ? '#120c0a' : '#efe7da'); blush(c, 36, -20, 3.4, S + 50); ink(c, [[39, -19.5], [43, -20.5]], { w: lw * .5, seed: S + 51, p: FLAT });
  } };
CR.mouse = { seed: 111, fill: '#d9cfc4', wash: '#8f7f70', acc: '#eba096', tint: '#ece6df', head: [2, -32], stage: .95, az: 1.9, wd: 50,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill, ec = this.eyeC || INK;
    ink(c, [[-10, -6], [-24, -3], [-34, -10], [-30, -20], [-24, -18]], { w: lw * .9, color: shade(this.acc, .25), seed: S, p: FLAT });
    [[-6, -1], [6, -1]].forEach(([x, y], i) => part(c, blob(x, y, 4.5, 2.4, S + 1 + i, .1, 7), this.acc, lw * .7, S + 3 + i * 3));
    part(c, blob(0, -14, 12.5, 14, S + 10, .05, 10), F, lw, S + 11, { wash: this.wash, wp: blob(4, -10, 9, 10, S + 14, .1, 8) });
    [[-10, -42], [12, -43]].forEach(([x, y], i) => { const e = blob(x, y, 8.5, 8, S + 20 + i, .05, 10); gouache(c, e, F); gouache(c, blob(x, y + .5, 5.4, 5, S + 22 + i, .06, 8), this.acc, .9); ink(c, e, { close: true, w: lw * .9, seed: S + 24 + i }); });
    part(c, blob(1.5, -31, 12, 10, S + 30, .04, 10), F, lw, S + 31, { wash: this.wash, wp: blob(6, -27, 7, 5, S + 34, .1, 8), al: .3 });
    eye(c, -3, -33, 1.9, o.st, lw, S + 35, ec); eye(c, 6.5, -33, 1.9, o.st, lw, S + 36, ec);
    c.fillStyle = this.acc; c.beginPath(); c.ellipse(2, -28, 1.8, 1.4, 0, 0, TAU); c.fill();
    [[-3, -28, -14, -30], [-3, -27, -13, -24], [7, -28, 17, -30], [7, -27, 16, -24]].forEach(([a, b, x, y], i) => pencil(c, [[a, b], [x, y]], { w: .6, alpha: .7, seed: S + 40 + i, passes: 1 }));
    blush(c, -7, -28, 2.6, S + 45); blush(c, 11, -28, 2.6, S + 46);
  } };
CR.capybara = { seed: 121, fill: '#b98a5e', wash: '#7a5236', snout: '#8a6040', tint: '#ecdccb', head: [32, -46], stage: .76, wd: 96,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    [[-30, -4], [-14, -3], [8, -3], [22, -4]].forEach(([x, y], i) => part(c, rbox(x, y - 2, 5.5, 6, 3, S + i), shade(F, .25), lw * .8, S + 5 + i * 3, { smooth: false }));
    part(c, rbox(-6, -28, 38, 24, 18, S + 20), F, lw, S + 21, { smooth: false, wash: this.wash, wp: blob(-6, -17, 36, 12, S + 24, .1, 10) });
    for (let i = 0; i < 8; i++) pencil(c, [[-34 + i * 8, -47], [-35 + i * 8, -41]], { w: .7, color: shade(this.wash, .2), alpha: .45, seed: S + 30 + i, passes: 1 });
    part(c, blob(22, -60, 4.5, 4, S + 40, .1, 8), F, lw * .8, S + 41);
    const hd = rbox(33, -46, 17, 13, 10, S + 44), hp = toPath(hd, true, false); gouache(c, hd, F, 1, false); c.save(); c.clip(hp); wash(c, blob(46, -42, 10, 12, S + 46, .1, 8), this.snout, { al: .55, seed: S + 47 }); c.restore(); ink(c, hd, { close: true, smooth: false, w: lw, seed: S + 48 });
    ink(c, [[46, -46], [48, -44]], { w: lw * 1.1, seed: S + 49, p: FLAT }); ink(c, [[42, -38], [45, -37], [48, -38.5]], { w: lw * .55, seed: S + 50, p: FLAT });
    eye(c, 33, -51, 2.1, o.st, lw, S + 51, this.eyeC || INK); if (o.st === 'open') ink(c, [[30.5, -53.5], [33, -54.6], [35.5, -53.5]], { w: lw * .5, seed: S + 52, p: FLAT });
    blush(c, 37, -42, 3.8, S + 53);
  } };
CR.raccoon = { seed: 131, fill: '#a8a3a0', wash: '#5d5856', mask: '#3a3330', face: '#f4efe6', tint: '#e6e2de', head: [0, -64], stage: .56, wd: 76,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill;
    const tail = blob(27, -22, 9, 23, S, .05, 11, .55), tp = toPath(tail); gouache(c, tail, F);
    c.save(); c.clip(tp); for (let i = 1; i <= 4; i++) { const t = i / 5, px = 15 + 24 * t, py = -2 - 40 * t; ink(c, [[px - 10, py - 6], [px + 10, py + 6]], { w: lw * 3.2, color: this.mask, seed: S + i, p: FLAT }); } c.restore(); ink(c, tail, { close: true, w: lw, seed: S + 6 });
    [[-10, -2], [10, -2]].forEach(([x, y], i) => part(c, blob(x, y, 7, 4, S + 7 + i, .08, 8), this.mask, lw * .8, S + 9 + i * 3));
    const body = blob(0, -30, 23, 28, S + 16, .04, 12); part(c, body, F, lw, S + 17, { wash: this.wash, wp: blob(10, -24, 14, 22, S + 20, .1, 9) }); gouache(c, blob(0, -24, 12, 15, S + 21, .06, 9), tint(F, .45), .9);
    [[[-20, -74], [-17, -91], [-6, -82]], [[20, -74], [17, -91], [6, -82]]].forEach((e, i) => { part(c, e, F, lw, S + 24 + i * 3, { smooth: false }); gouache(c, shrink(e, .5, 2), this.face, .9, false); });
    const hd = blob(0, -65, 24, 18, S + 30, .03, 12), hp = toPath(hd); gouache(c, hd, F); wash(c, blob(10, -70, 14, 9, S + 31, .1, 8), this.wash, { al: .3, seed: S + 32, clip: hp });
    c.save(); c.clip(hp); gouache(c, blob(0, -59, 17, 11, S + 33, .06, 10), this.face); gouache(c, blob(-8.5, -67, 8.5, 5.2, S + 34, .06, 9, .35), this.mask); gouache(c, blob(8.5, -67, 8.5, 5.2, S + 35, .06, 9, -.35), this.mask); gouache(c, blob(0, -76, 2.6, 7, S + 36, .1, 7), this.mask, .8); c.restore(); ink(c, hd, { close: true, w: lw, seed: S + 37 });
    const ec = o.st === 'open' ? '#0f0b09' : '#efe7da'; eye(c, -8.5, -67, 2.7, o.st, lw, S + 38, ec); eye(c, 8.5, -67, 2.7, o.st, lw, S + 39, ec);
    c.fillStyle = INK; c.beginPath(); c.ellipse(0, -59.5, 3, 2.2, 0, 0, TAU); c.fill(); ink(c, [[-3, -55.6], [0, -54.4], [3, -55.6]], { w: lw * .55, seed: S + 40, p: FLAT });
    blush(c, -15, -60, 3.8, S + 41); blush(c, 15, -60, 3.8, S + 42);
  } };
CR.otter = { seed: 141, fill: '#8a6448', wash: '#4e3424', chest: '#e9d6b8', tint: '#eadccd', head: [0, -92], stage: .44, wd: 64,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill, ec = this.eyeC || INK;
    part(c, [[-8, -10], [-22, -6], [-34, -1], [-22, -1], [-6, -2]], F, lw, S, { wash: this.wash });
    [[-7, -2], [7, -2]].forEach(([x, y], i) => part(c, blob(x, y, 6.5, 3.6, S + 3 + i, .1, 8), shade(F, .15), lw * .8, S + 5 + i * 3));
    const body = blob(0, -44, 16, 42, S + 12, .03, 12), bp = toPath(body); gouache(c, body, F); wash(c, blob(7, -38, 10, 36, S + 13, .08, 9), this.wash, { al: .45, seed: S + 14, clip: bp }); gouache(c, blob(0, -58, 10, 22, S + 15, .06, 9), this.chest, .95); ink(c, body, { close: true, w: lw, seed: S + 16 });
    part(c, blob(0, -66, 5.4, 4.2, S + 17, .1, 8), '#bdb5a8', lw * .7, S + 18, { wash: '#7d756b' });
    [[-5.5, -63.5], [5.5, -63.5]].forEach(([x, y], i) => part(c, blob(x, y, 4, 3.4, S + 21 + i, .1, 7), F, lw * .7, S + 23 + i * 3));
    [[-12, -100], [12, -100]].forEach(([x, y], i) => part(c, blob(x, y, 3.6, 3.4, S + 30 + i, .1, 7), F, lw * .7, S + 32 + i * 3));
    const hd = blob(0, -92, 15, 12.5, S + 40, .03, 10), hp = toPath(hd); gouache(c, hd, F); c.save(); c.clip(hp); gouache(c, blob(0, -85, 10, 7, S + 41, .06, 9), this.chest); c.restore(); ink(c, hd, { close: true, w: lw, seed: S + 42 });
    c.fillStyle = INK; c.beginPath(); c.ellipse(0, -88.5, 2.6, 1.9, 0, 0, TAU); c.fill(); ink(c, [[-3, -84], [0, -83], [3, -84]], { w: lw * .5, seed: S + 43, p: FLAT });
    [[-4, -87, -14, -89], [-4, -86, -13, -83], [4, -87, 14, -89], [4, -86, 13, -83]].forEach(([a, b, x, y], i) => pencil(c, [[a, b], [x, y]], { w: .6, alpha: .6, seed: S + 44 + i, passes: 1 }));
    eye(c, -6, -95, 2.2, o.st, lw, S + 50, ec); eye(c, 6, -95, 2.2, o.st, lw, S + 51, ec); blush(c, -10, -87, 3, S + 52); blush(c, 10, -87, 3, S + 53);
  } };
CR.cat = { seed: 151, fill: '#eeb070', wash: '#c06a2c', acc: '#eba096', tint: '#f4e0c8', head: [0, -66], stage: .58, wd: 62,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill, ec = this.eyeC || INK;
    const tp = toPath([[14, -6], [28, -9], [33, -26], [28, -40], [23, -39]], false); c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 8 + lw * U * 1.8; c.stroke(tp); c.strokeStyle = F; c.lineWidth = 8; c.stroke(tp); c.restore();
    [[31, -18], [32, -28]].forEach((p, i) => pencil(c, [[p[0] - 4, p[1]], [p[0] + 4, p[1] - 1]], { w: .9, color: shade(this.wash, .2), alpha: .7, seed: S + 60 + i, passes: 1 }));
    part(c, [[-20, 0], [-22, -16], [-16, -38], [-8, -52], [8, -52], [16, -38], [22, -16], [20, 0]], F, lw, S + 3, { wash: this.wash, wp: blob(10, -20, 12, 22, S + 6, .1, 8) });
    gouache(c, blob(0, -26, 9, 16, S + 7, .06, 9), tint(F, .5), .9);
    ink(c, [[-6, -28], [-6, -2]], { w: lw * .8, seed: S + 8 }); ink(c, [[6, -28], [6, -2]], { w: lw * .8, seed: S + 9 });
    [[[-18, -70], [-15, -92], [-3, -80]], [[18, -70], [15, -92], [3, -80]]].forEach((e, i) => { part(c, e, F, lw, S + 10 + i * 3, { smooth: false, wash: this.wash, al: .3 }); gouache(c, shrink(e, .5, 2), this.acc, .85, false); });
    part(c, blob(0, -66, 20, 16.5, S + 20, .03, 12), F, lw, S + 21, { wash: this.wash, wp: blob(8, -62, 12, 8, S + 24, .1, 8), al: .3 });
    [[[-5, -84.5], [-4.5, -81.5]], [[0, -86], [0, -82.5]], [[5, -84.5], [4.5, -81.5]], [[-20, -66], [-15, -65]], [[20, -66], [15, -65]]].forEach((l, i) => pencil(c, l, { w: 1.1, color: shade(this.wash, .2), alpha: .8, seed: S + 30 + i, passes: 1 }));
    eye(c, -8, -67, 2.8, o.st, lw, S + 40, ec); eye(c, 8, -67, 2.8, o.st, lw, S + 41, ec);
    gouache(c, [[-2.2, -61.5], [2.2, -61.5], [0, -59.2]], this.acc, 1, false); ink(c, [[-4, -56.6], [-2, -55.4], [0, -57.6], [2, -55.4], [4, -56.6]], { w: lw * .55, seed: S + 42, p: FLAT });
    [[-5, -60, -16, -61], [-5, -59, -15, -56], [5, -60, 16, -61], [5, -59, 15, -56]].forEach(([a, b, x, y], i) => pencil(c, [[a, b], [x, y]], { w: .6, alpha: .6, seed: S + 44 + i, passes: 1 }));
    blush(c, -13, -60, 3.6, S + 50); blush(c, 13, -60, 3.6, S + 51);
  } };
CR.bear = { seed: 161, fill: '#a87a52', wash: '#6b4a30', muzzle: '#e6cfae', tint: '#ecdccb', head: [0, -92], stage: .42, az: .9, wd: 84,
  draw(c, o) { const S = this.seed, lw = o.lw, F = this.fill, ec = this.eyeC || INK;
    [[-16, -4], [16, -4]].forEach(([x, y], i) => { part(c, blob(x, y, 12, 7, S + i, .06, 10), F, lw, S + 2 + i * 3, { wash: this.wash }); gouache(c, blob(x, y - 1, 5, 3.4, S + 8 + i, .1, 8), this.muzzle, .9); });
    const body = blob(0, -42, 35, 38, S + 12, .03, 14), bp = toPath(body); gouache(c, body, F); wash(c, blob(12, -34, 24, 30, S + 13, .1, 10), this.wash, { al: .45, seed: S + 14, clip: bp }); gouache(c, blob(0, -36, 21, 23, S + 15, .05, 10), tint(F, .35), .85); ink(c, body, { close: true, w: lw, seed: S + 16 });
    [[-27, -46, .35], [27, -46, -.35]].forEach(([x, y, r], i) => part(c, blob(x, y, 9, 17, S + 20 + i, .06, 9, r), F, lw * .9, S + 22 + i * 3, { wash: this.wash }));
    [[-21, -111], [21, -111]].forEach(([x, y], i) => { const e = blob(x, y, 9, 8.5, S + 30 + i, .05, 9); gouache(c, e, F); gouache(c, blob(x, y + 1, 4.6, 4.4, S + 32 + i, .08, 8), this.muzzle, .9); ink(c, e, { close: true, w: lw * .9, seed: S + 34 + i }); });
    const hd = blob(0, -92, 28, 23, S + 40, .03, 12), hp = toPath(hd); gouache(c, hd, F); wash(c, blob(10, -86, 18, 14, S + 41, .1, 9), this.wash, { al: .3, seed: S + 42, clip: hp }); ink(c, hd, { close: true, w: lw, seed: S + 43 });
    part(c, blob(0, -83, 13, 9.5, S + 44, .05, 10), this.muzzle, lw * .8, S + 45);
    gouache(c, blob(0, -87, 5, 3.6, S + 48, .08, 8), INK); ink(c, [[0, -84], [0, -80.5], [-4, -79]], { w: lw * .55, seed: S + 49, p: FLAT }); ink(c, [[0, -80.5], [4, -79]], { w: lw * .55, seed: S + 50, p: FLAT });
    eye(c, -11, -96, 2.6, o.st, lw, S + 51, ec); eye(c, 11, -96, 2.6, o.st, lw, S + 52, ec); blush(c, -19, -86, 4.6, S + 53); blush(c, 19, -86, 4.6, S + 54);
  } };
Object.assign(CR.rabbit, { wd: 60 }); Object.assign(CR.hedgehog, { wd: 96 }); Object.assign(CR.frog, { wd: 92 }); Object.assign(CR.mole, { wd: 60 }); Object.assign(CR.sheep, { wd: 86 }); Object.assign(CR.owl, { wd: 62 });
const NAMES = { rabbit: 'June', hedgehog: 'Pip', frog: 'Fig', mole: 'Mo', sheep: 'Bea', owl: 'Otis', fox: 'Rue', duck: 'Dot', tortoise: 'Sage', badger: 'Bram', mouse: 'Pim', capybara: 'Yuzu', raccoon: 'Rocco', otter: 'Ollie', cat: 'Miso', bear: 'Huck' };
const LINEUP = ['mouse', 'rabbit', 'tortoise', 'fox', 'duck', 'bear', 'hedgehog', 'otter', 'frog', 'capybara', 'cat', 'owl', 'badger', 'mole', 'raccoon', 'sheep'];
const ROOF = { rabbit: '#c96f4f', hedgehog: '#d6a24a', frog: '#6f9a5a', mole: '#8a6f98', sheep: '#6f8faa', owl: '#9b7454', fox: '#b85a4a', duck: '#5f8a8b', tortoise: '#7c8f5a', badger: '#5d6f9a', mouse: '#c99a3e', capybara: '#9b5f7a', raccoon: '#6f8faa', otter: '#5f8a8b', cat: '#c96f4f', bear: '#9b7454' };
const COATS = {
  rabbit: { cocoa: { fill: '#dcb995', wash: '#8a5c3a', tint: '#efdcc8' }, grey: { fill: '#dedad5', wash: '#7d7b86', tint: '#e6e3e0' }, honey: { fill: '#f1d6a2', wash: '#c48a3c', tint: '#f3e4c6' } },
  hedgehog: { ash: { fill: '#ddd3c6', wash: '#5c5550', tint: '#e8e2da' }, ginger: { fill: '#ebbf90', wash: '#a5532a', tint: '#f2dcc4' } },
  frog: { sky: { fill: '#cfe0e6', wash: '#4f86a6', belly: '#eef3f2', spot: '#3f6f8c', tint: '#dce8ec' }, sunny: { fill: '#f0e2a6', wash: '#b98d2f', belly: '#f8f1d8', spot: '#8a6a22', tint: '#f2e9c8' }, rose: { fill: '#f2d3c8', wash: '#c46a5c', belly: '#fbeee8', spot: '#a04a3e', tint: '#f3e0d9' } },
  mole: { cocoa: { fill: '#ccb29c', wash: '#6e4a35', tint: '#eadbcf' }, slate: { fill: '#bfc9d0', wash: '#4d5d6b', tint: '#dfe4e8' } },
  sheep: { oat: { fill: '#f1e4ca', wash: '#b49a6c', tint: '#efe6d4' }, cocoa: { fill: '#ad9482', wash: '#5e4636', tint: '#e3d8cf' } },
  owl: { snowy: { fill: '#f3efe7', wash: '#9aa0a8', disc: '#ffffff', tint: '#eceae6' }, barn: { fill: '#f1dcb9', wash: '#c08b52', disc: '#fbf4ea', tint: '#f3e6d0' } }
};
const ANCH = {
  rabbit: { top: [0, -95, 15], neck: [0, -50, 19], eyes: [[-9, -77], [9, -77]], er: 2.9, bod: [0, -33, 30, 32], head: [0, -75, 25, 22], ear: [12, -100] },
  hedgehog: { top: [24, -39, 12], neck: [12, -11, 12], eyes: [[28, -27]], er: 2.6, bod: [-6, -30, 38, 27], head: [26, -24, 22, 14], ear: [16, -38] },
  frog: { top: [0, -52, 9], neck: [0, -15, 22], eyes: [[-17, -46], [17, -46]], er: 5, bod: [0, -24, 40, 22], head: [0, -34, 40, 18], ear: [18, -56] },
  mole: { top: [0, -79, 16], neck: [0, -47, 26], eyes: [[-9, -69], [9, -69]], er: 1.9, bod: [0, -40, 29, 39], head: [0, -64, 22, 16], ear: [12, -76] },
  sheep: { top: [29, -71, 11], neck: [24, -39, 12], eyes: [[25.5, -55], [34.5, -54]], er: 2.1, bod: [-4, -40, 37, 28], head: [30, -53, 12, 15], ear: [38, -68], eyeC: '#f6efe2' },
  owl: { top: [0, -86, 13], neck: [0, -44, 22], eyes: [[-12, -63], [12, -63]], er: 4.8, bod: [0, -45, 29, 44], head: [0, -62, 26, 20], ear: [16, -82] }
};
const ALTROOF = { rabbit: '#5f8a8b', hedgehog: '#b85a4a', frog: '#c99a3e', mole: '#5d6f9a', sheep: '#9b5f7a', owl: '#7c8f5a' };
const ALTV = { rabbit: { coat: 'grey', mark: 'blaze', outfit: 'scarf', oc: '#c96f4f' }, hedgehog: { coat: 'ginger', outfit: 'beanie', oc: '#6f8faa' }, frog: { coat: 'sky', outfit: 'bow', oc: '#d4704e' }, mole: { coat: 'slate' }, sheep: { coat: 'oat', outfit: 'glasses' } };
const FRUIT = { plum: '#7b4a86', persimmon: '#e8803a', lemon: '#f2d24a', apple: '#d9483b', fig: '#6c4a6e' };
function drawMark(g, kind, mark, def, st, lw) {
  const A = ANCH[kind], col = shade(def.wash, .12);
  if (mark === 'freckles') { g.fillStyle = shade(def.wash, .2); A.eyes.forEach(([ex, ey], j) => { for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ex + (i - 1) * A.er * .9 + (j ? 1 : -1) * A.er * .6, ey + A.er * 2.4 + (i % 2) * A.er * .5, Math.max(.6, A.er * .24), 0, TAU); g.fill(); } }); return; }
  if (mark === 'patch') { const [ex, ey] = A.eyes[0]; wash(g, blob(ex - .5, ey - .5, A.er * 2 + 4, A.er * 1.8 + 3.5, 901, .14, 9), col, { al: .62, seed: 902, off: .4, blend: 'source-atop', edge: .35 }); }
  else if (mark === 'spots') { const [bx, by, rx, ry] = A.bod; [[-.42, -.2, .24], [.36, .16, .2], [-.08, .5, .16], [.48, -.44, .14]].forEach(([u, v, r], i) => wash(g, blob(bx + u * rx, by + v * ry, rx * r, rx * r * .8, 903 + i, .14, 8), col, { al: .55, seed: 907 + i, off: .4, blend: 'source-atop', edge: .3 })); }
  else if (mark === 'blaze') { const [hx, hy, hrx, hry] = A.head; wash(g, blob(hx, hy - hry * .55, hrx * .16, hry * .5, 911, .1, 8), '#ffffff', { al: .75, seed: 912, off: .3, blend: 'source-atop', gran: 0, edge: 0 }); }
  const ec = (st !== 'open' && A.eyeSleepC) || A.eyeC || def.eyeC || (A.eyeSleepC ? '#0f0b09' : INK);
  A.eyes.forEach(([ex, ey], i) => eye(g, ex, ey, A.er, st, lw, 920 + i, ec, A.eyeC ? null : '#fffaf0'));
}
function drawOutfit(g, kind, of, oc, lw) {
  const A = ANCH[kind], [tx, ty, tw] = A.top, [nx, ny, nw] = A.neck, L = lw * .85;
  if (of === 'beanie') { const col = oc || '#d4704e', dome = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * (1 - k / 12); dome.push([tx + Math.cos(a) * tw, ty + 3 - Math.sin(a) * tw * .95]); }
    gouache(g, dome, col); wash(g, dome, shade(col, .35), { al: .35, seed: 931 });
    for (let i = -2; i <= 2; i++) pencil(g, [[tx + i * tw * .3, ty + 2], [tx + i * tw * .22, ty - tw * .7]], { w: .8, color: shade(col, .45), alpha: .7, seed: 932 + i, passes: 1 });
    ink(g, dome, { close: true, w: L, seed: 937 });
    const band = [[tx - tw - 1.5, ty], [tx + tw + 1.5, ty], [tx + tw + 1, ty + 5.5], [tx - tw - 1, ty + 5.5]]; gouache(g, band, shade(col, .15), 1, false); ink(g, band, { close: true, smooth: false, w: L * .9, seed: 938 });
    const pom = blob(tx, ty + 1 - tw * .95 - 2, tw * .34, tw * .3, 939, .18, 8); gouache(g, pom, '#fbf3e2'); ink(g, pom, { close: true, w: L * .8, seed: 940 }); }
  else if (of === 'straw') { const col = oc || '#c9543e', brim = blob(tx, ty + 2, tw * 1.9, tw * .42, 941, .04, 12), crown = [];
    for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 - k / 10); crown.push([tx + Math.cos(a) * tw * .95, ty + 1 - Math.sin(a) * tw * .9]); }
    gouache(g, brim, '#ecd08f'); wash(g, brim, '#b88a3c', { al: .4, seed: 942 }); ink(g, brim, { close: true, w: L, seed: 943 });
    gouache(g, crown, '#efd79c'); wash(g, crown, '#b88a3c', { al: .35, seed: 944 }); ink(g, crown, { close: true, w: L, seed: 945 });
    const band = [[tx - tw * .95, ty - 1], [tx + tw * .95, ty - 1], [tx + tw * .93, ty - 4.5], [tx - tw * .93, ty - 4.5]]; gouache(g, band, col, 1, false); ink(g, band, { close: true, smooth: false, w: L * .8, seed: 946 });
    gouache(g, blob(tx + tw * .7, ty - 3, 3, 3, 947, .2, 7), '#fbf3e2'); }
  else if (of === 'party') { const col = oc || '#6f8faa', cone = [[tx - tw * .62, ty + 3], [tx + 1.5, ty - tw * 1.75], [tx + tw * .62, ty + 3]];
    gouache(g, cone, col, 1, false); wash(g, cone, shade(col, .3), { al: .35, seed: 951, smooth: false });
    g.save(); g.clip(toPath(cone, true, false)); for (let i = 0; i < 3; i++) { const yy = ty - i * tw * .5; ink(g, [[tx - tw, yy + 2], [tx + tw, yy - 3]], { w: L * 1.4, color: '#fbf3e2', seed: 952 + i, p: FLAT }); } g.restore();
    ink(g, cone, { close: true, smooth: false, w: L, seed: 955 });
    const pom = blob(tx + 1.5, ty - tw * 1.75 - 2, 3.5, 3.5, 956, .2, 8); gouache(g, pom, '#f2c25a'); ink(g, pom, { close: true, w: L * .7, seed: 957 }); }
  else if (of === 'bow' || of === 'flower') { const [ex, ey] = A.ear, col = oc || (of === 'bow' ? '#d4704e' : '#f0b3b6');
    if (of === 'bow') { [[[ex, ey], [ex - 8, ey - 5], [ex - 8, ey + 5]], [[ex, ey], [ex + 8, ey - 5], [ex + 8, ey + 5]]].forEach((p, i) => { gouache(g, p, col); ink(g, p, { close: true, w: L * .8, seed: 961 + i }); }); const kn = blob(ex, ey, 2.4, 2.6, 963, .1, 7); gouache(g, kn, shade(col, .2)); ink(g, kn, { close: true, w: L * .7, seed: 964 }); }
    else { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - .3, p = blob(ex + Math.cos(a) * 3.6, ey + Math.sin(a) * 3.6, 3.4, 2.4, 965 + i, .1, 7, a); gouache(g, p, col); ink(g, p, { close: true, w: L * .55, seed: 970 + i }); } g.fillStyle = '#e8b44e'; g.beginPath(); g.arc(ex, ey, 1.9, 0, TAU); g.fill(); } }
  else if (of === 'scarf') { const col = oc || '#5E7F4A', band = [[nx - nw, ny - 4], [nx, ny + 1.5], [nx + nw, ny - 4], [nx + nw - 1, ny - 10.5], [nx, ny - 5.5], [nx - nw + 1, ny - 10.5]], tail = [[nx - nw * .45, ny - 2], [nx - nw * .62, ny + 15], [nx - nw * .2, ny + 16], [nx - nw * .1, ny - 1]];
    gouache(g, tail, shade(col, .1)); ink(g, tail, { close: true, w: L * .85, seed: 981 }); gouache(g, band, col); wash(g, band, shade(col, .35), { al: .3, seed: 982 }); ink(g, band, { close: true, w: L * .9, seed: 983 });
    for (let i = -2; i <= 2; i++) pencil(g, [[nx + i * nw * .38, ny - 8 + Math.abs(i) * .4], [nx + i * nw * .38, ny - 2.5 - Math.abs(i) * .8]], { w: .9, color: '#fbf3e2', alpha: .75, seed: 984 + i, passes: 1 }); }
  else if (of === 'glasses') { const r = A.er * 1.5 + 2.5; A.eyes.forEach(([ex, ey], i) => ink(g, blob(ex, ey, r, r * .92, 991 + i, .03, 10), { close: true, w: L * .75, seed: 993 + i, p: FLAT })); if (A.eyes.length > 1) { const [a, b] = A.eyes; ink(g, [[a[0] + r, a[1] - 1], [(a[0] + b[0]) / 2, a[1] - 2.5], [b[0] - r, b[1] - 1]], { w: L * .7, seed: 995, p: FLAT }); } }
  else if (of === 'crown') { const cols = [oc || '#f0b3b6', '#f6cf6a', '#fbf3e2']; for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i / 6 * .9), x = tx + Math.cos(a) * tw * 1.05, y = ty + 3 + Math.sin(a) * tw * .45; ink(g, [[x - 2.2, y + 1], [x + 2.2, y]], { w: L * 1.5, color: '#5d8a3c', seed: 1010 + i, p: FLAT }); g.fillStyle = cols[i % 3]; for (let p = 0; p < 5; p++) { const pa = p / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(pa) * 2.2, y + Math.sin(pa) * 2.2, 1.7, 0, TAU); g.fill(); } g.fillStyle = '#e8b44e'; g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); } }
  else if (of === 'acorn') { const col = oc || '#9a6a3e', cap = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * (1 - k / 12); cap.push([tx + Math.cos(a) * tw * 1.05, ty + 4 - Math.sin(a) * tw * .8]); } gouache(g, cap, col); g.save(); g.clip(toPath(cap)); for (let i = -3; i <= 3; i++) { pencil(g, [[tx + i * tw * .3 - tw * .3, ty + 4], [tx + i * tw * .3 + tw * .3, ty - tw]], { w: .8, color: shade(col, .45), alpha: .8, seed: 1020 + i, passes: 1 }); pencil(g, [[tx + i * tw * .3 + tw * .3, ty + 4], [tx + i * tw * .3 - tw * .3, ty - tw]], { w: .8, color: shade(col, .45), alpha: .8, seed: 1030 + i, passes: 1 }); } g.restore(); ink(g, cap, { close: true, w: L, seed: 1040 }); ink(g, [[tx, ty + 4 - tw * .8], [tx + 2, ty - tw * 1.15]], { w: L * 1.4, color: '#5b412e', seed: 1041, p: FLAT }); }
  else if (of === 'satchel') { const [bx, by, rx, ry] = A.bod, sx = bx + rx * .55, sy = by + ry * .35, col = oc || '#9e6a3e';
    ink(g, [[nx - nw * .7, ny - 6], [bx, by - ry * .1], [sx, sy - 4]], { w: L * 1.6, color: shade(col, .2), seed: 1001, p: FLAT });
    const env = [[sx - 7, sy - 4], [sx + 3, sy - 13], [sx + 10, sy - 6], [sx, sy + 2]]; gouache(g, env, '#fbf6ea', 1, false); ink(g, env, { close: true, smooth: false, w: L * .6, seed: 1002 });
    const bag = [[sx - 9, sy - 5], [sx + 9, sy - 5], [sx + 8, sy + 9], [sx - 8, sy + 9]]; gouache(g, bag, col); wash(g, bag, shade(col, .35), { al: .35, seed: 1003 }); ink(g, bag, { close: true, w: L, seed: 1004 }); ink(g, [[sx - 9, sy - 5], [sx, sy + 1], [sx + 9, sy - 5]], { w: L * .8, seed: 1005 }); }
}
function drawCritter(g, kind, st, lw, v) {
  const base = CR[kind] || CR.rabbit, cv = v && v.coat && COATS[kind] && COATS[kind][v.coat], def = cv ? Object.assign(Object.create(base), cv) : base;
  def.draw(g, { st, lw });
  if (v && v.mark && ANCH[kind]) drawMark(g, kind, v.mark, def, st, lw);
  if (v && v.outfit && ANCH[kind]) drawOutfit(g, kind, v.outfit, v.oc, lw);
}
const vkey = v => v ? [v.coat, v.mark, v.outfit, v.oc].join('.') : '';
Object.assign(COATS, {
  fox: { arctic: { fill: '#f1ede6', wash: '#9aa0a8', tint: '#eceae6' }, silver: { fill: '#b8b4b0', wash: '#4d4a48', tint: '#e4e2e0' } },
  duck: { duckling: { fill: '#f4dc86', wash: '#c9a33a', tint: '#f5ead0' }, mallard: { fill: '#cdb89c', wash: '#7a6448', hood: '#3f6f55', tint: '#e6e2d2' } },
  tortoise: { sunny: { shell: '#d7b45a', shellW: '#8a6a22', rim: '#9a7a32', tint: '#f1e6c8' }, moss: { shell: '#7f9a6a', shellW: '#3f5a31', rim: '#55703f', tint: '#e2e8d8' } },
  badger: { honey: { fill: '#c9a26e', wash: '#7a5a33', tint: '#eee2cf' }, smoky: { fill: '#76737a', wash: '#35333a', tint: '#e0dfe2' } },
  mouse: { snow: { fill: '#f6f2ec', wash: '#b9b0a8', tint: '#efece8' }, brown: { fill: '#b08a68', wash: '#6e4a35', tint: '#ecdccb' } },
  capybara: { dusk: { fill: '#8f6a4a', wash: '#5a3d28', snout: '#5e412c', tint: '#e6d8c8' }, sandy: { fill: '#d6b08a', wash: '#9a6e46', snout: '#a87a52', tint: '#f1e4d2' } },
  raccoon: { cinnamon: { fill: '#c9a383', wash: '#7a5236', tint: '#efe0d2' }, pale: { fill: '#d4d0cc', wash: '#8a8682', tint: '#eceae8' } },
  otter: { sea: { fill: '#6e5a4e', wash: '#3a2c24', tint: '#e3dcd6' }, sandy: { fill: '#b08a68', wash: '#6e4a35', tint: '#efe2d2' } },
  cat: { black: { fill: '#3f3836', wash: '#1f1a18', eyeC: '#e8c547', tint: '#e2dedc' }, grey: { fill: '#b9b5b2', wash: '#5d5856', tint: '#e8e6e4' }, cream: { fill: '#f3e6cf', wash: '#c9a77a', tint: '#f5ecdc' } },
  bear: { honey: { fill: '#c99a5e', wash: '#8a5a2e', tint: '#f1e2cc' }, polar: { fill: '#f3efe6', wash: '#a9b0b8', muzzle: '#ffffff', tint: '#eceae6' }, cinnamon: { fill: '#b8683a', wash: '#7a3e1e', tint: '#efd9c8' } }
});
Object.assign(ANCH, {
  fox: { top: [0, -93, 13], neck: [0, -56, 17], eyes: [[-8, -79], [8, -79]], er: 2.7, bod: [0, -34, 23, 33], head: [0, -76, 22, 18], ear: [14, -96] },
  duck: { top: [10, -56, 9], neck: [10, -33, 11], eyes: [[13, -49]], er: 2.3, bod: [0, -20, 24, 17], head: [10, -45, 13, 12.5], ear: [5, -55] },
  tortoise: { top: [40, -26, 8], neck: [31, -12, 8], eyes: [[43, -20.5]], er: 2.1, bod: [0, -26, 30, 16], head: [40, -18, 11, 9], ear: [36, -26] },
  badger: { top: [26, -40, 10], neck: [17, -19, 12], eyes: [[33, -31]], er: 2.3, bod: [-6, -22, 35, 19], head: [31, -28, 16, 12.5], ear: [20, -42], eyeSleepC: '#efe7da' },
  mouse: { top: [1.5, -41, 6], neck: [1.5, -22, 9], eyes: [[-3, -33], [6.5, -33]], er: 1.9, bod: [0, -14, 12.5, 14], head: [1.5, -31, 12, 10], ear: [12, -43] },
  capybara: { top: [30, -59, 10], neck: [20, -33, 12], eyes: [[33, -51]], er: 2.1, bod: [-6, -28, 38, 24], head: [33, -46, 17, 13], ear: [22, -61] },
  raccoon: { top: [0, -82, 12], neck: [0, -46, 17], eyes: [[-8.5, -67], [8.5, -67]], er: 2.7, bod: [0, -30, 23, 28], head: [0, -65, 24, 18], ear: [15, -84], eyeSleepC: '#efe7da' },
  otter: { top: [0, -103, 9], neck: [0, -78, 12], eyes: [[-6, -95], [6, -95]], er: 2.2, bod: [0, -44, 16, 42], head: [0, -92, 15, 12.5], ear: [12, -101] },
  cat: { top: [0, -81, 12], neck: [0, -50, 14], eyes: [[-8, -67], [8, -67]], er: 2.8, bod: [0, -28, 20, 26], head: [0, -66, 20, 16.5], ear: [14, -84] },
  bear: { top: [0, -113, 14], neck: [0, -70, 22], eyes: [[-11, -96], [11, -96]], er: 2.6, bod: [0, -42, 35, 38], head: [0, -92, 28, 23], ear: [21, -112] }
});

/* ---------- sprites (whole drawings, held) ---------- */
const sprites = new Map();
function sprite(key, W, H, ox, oy, dpr, fn) {
  const k = key + '|' + W + 'x' + H + '|' + dpr; let s = sprites.get(k); if (s) return s;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.translate(ox, oy); fn(g);
  s = { cv, W, H, ox, oy }; sprites.set(k, s); return s;
}
function critterSprite(kind, size, st, dir, dpr, v) {
  size = Math.max(8, Math.round(size)); const W = size * 1.3, H = size * 1.55, ox = W / 2, oy = H - size * .08;
  return sprite(`cr:${kind}:${st}:${dir}:${size}:${vkey(v)}`, W, H, ox, oy, dpr, g => { const k = size / 100; g.scale(k * dir, k); const pu = U; U = 1 / k; drawCritter(g, kind, st, clamp(size / 44, .8, 2.5), v); U = pu; });
}
function blinkAt(t, ph) { const p = 3.4 + ph * 2.1; return ((t + ph * 7) % p) < .13; }
function critter(c, kind, x, y, size, o = {}) {
  const t = o.t ?? 0, ph = o.ph ?? (hash(kind.length * 7, 3)), sleep = o.sleep, st = o.st || (sleep ? 'sleep' : (o.t != null && blinkAt(t, ph) ? 'blink' : 'open'));
  const sp = critterSprite(kind, size, st, o.dir || 1, o.dpr || 2, o.v);
  const br = Math.sin(t / (sleep ? 4.4 : 3.1) * TAU + ph * 6) * (sleep ? .028 : .015);
  if (o.shadow !== false) { c.save(); c.fillStyle = 'rgba(55,40,25,.16)'; c.beginPath(); c.ellipse(x, y - size * .01, size * .36, size * .065, 0, 0, TAU); c.fill(); c.restore(); }
  c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); c.scale(1 - br * .5, 1 + br); c.drawImage(sp.cv, -sp.ox, -sp.oy, sp.W, sp.H); c.restore();
}
function zzz(c, x, y, s, t) {
  c.save(); c.fillStyle = INK;
  for (let i = 0; i < 3; i++) { const ph = (t * .32 + i / 3) % 1; c.globalAlpha = Math.sin(ph * Math.PI) * .8; c.font = `700 ${Math.round(s * (.45 + ph * .55))}px Gaegu, 'Comic Sans MS', cursive`; c.fillText('z', x + ph * s * .9 + Math.sin(ph * 6) * s * .15, y - ph * s * 1.7); }
  c.restore();
}

/* ---------- world pieces ---------- */
const SEASONS = {
  spring: { sky: '#f4ecdc', sky2: '#e2ead8', far: '#cfdaae', farW: '#9fb57a', mid: '#bccf92', midW: '#86a463', near: '#abc47e', nearW: '#6f9350', shade: '#55753f', tree: '#aac97e', tree2: '#5f8b45', blossom: '#f0b3b6', path: '#efe4ca', soil: '#bb8f6a', soilW: '#7d5a3e', crop: 'sprout', flower: '#f6f0e2' },
  summer: { sky: '#f5ead0', sky2: '#f1dfb6', far: '#c0d190', farW: '#8aa860', mid: '#a5c172', midW: '#6f9447', near: '#95b762', nearW: '#5d8a3c', shade: '#4c6e33', tree: '#88b25c', tree2: '#4c7a35', path: '#f0e2c2', soil: '#b88a62', soilW: '#7a563a', crop: 'tall', flower: '#f2c94c' },
  autumn: { sky: '#f3e3ca', sky2: '#efd0aa', far: '#ddc691', farW: '#b89458', mid: '#d2ae74', midW: '#a77d45', near: '#c69e62', nearW: '#8f6a3a', shade: '#7a5530', tree: '#e3a152', tree2: '#b85a30', leaves: true, path: '#efdfc0', soil: '#a77a55', soilW: '#6f4d33', crop: 'pumpkin', flower: '#d9643f' },
  winter: { sky: '#eceeec', sky2: '#dfe6ea', far: '#f1f3f2', farW: '#b8c6cd', mid: '#e9eeee', midW: '#aab9c2', near: '#f3f5f4', nearW: '#b3c2ca', shade: '#7f929d', bare: true, snow: true, path: '#e3e6e3', soil: '#c9bfb4', soilW: '#8f8378', crop: 'snow', flower: null }
};
function hill(c, w, h, y0, amp, freq, seed, fill, o = {}) {
  const Y = x => y0 + noise1(x * freq, seed) * amp + noise1(x * freq * 3.1, seed + 9) * amp * .25, top = [];
  for (let x = -20; x <= w + 20; x += 6) top.push([x, Y(x)]);
  const poly = [...top, [w + 20, h + 20], [-20, h + 20]];
  gouache(c, poly, fill, 1, false);
  if (o.washC) wash(c, top.concat([[w + 20, y0 + amp * 3 + 30], [-20, y0 + amp * 3 + 30]]), o.washC, { seed, al: .3, off: 2, smooth: false, edge: .55, gran: .14 });
  if (o.line === 'ink') ink(c, top, { w: 1.5, color: o.lineC || INK, seed, smooth: false, alpha: o.alpha ?? .8, p: FLAT });
  else if (o.line !== false) pencil(c, top, { w: 1.1, color: o.lineC || INK, alpha: o.alpha ?? .5, seed, smooth: false });
  return Y;
}
function house(c, x, y, s, o = {}) {
  const roof = o.roof || '#c86c4a', wall = o.wall || '#f2e6cf', seed = o.seed || 1, k = s / 60;
  local(c, x, y, k, () => {
    const j = (p, i) => [p[0] + (hash(i, seed) - .5) * 1.4, p[1] + (hash(i + 50, seed) - .5) * 1.4];
    const wallP = [[-25, 0], [-25, -33], [25, -33], [25, 0]].map(j), roofP = [[-32, -29], [0, -57], [32, -29]].map((p, i) => j(p, i + 10));
    const chimP = [[13, -42], [13, -58], [20, -58], [20, -36]], doorP = [[-7, 0], [-7, -13], [-5, -18], [0, -20], [5, -18], [7, -13], [7, 0]], winP = [[11, -25], [20, -25], [20, -16], [11, -16]];
    if (o.sketch) {
      const pc = '#8b7e72'; [chimP, wallP, roofP].forEach((p, i) => pencil(c, p, { close: true, smooth: false, w: 1, color: pc, alpha: .8, seed: seed + i, passes: 2 }));
      pencil(c, doorP, { w: 1, color: pc, alpha: .7, seed: seed + 5 }); pencil(c, [[-44, 0], [44, 0]], { w: .8, color: pc, alpha: .45, seed: seed + 6, passes: 1 }); pencil(c, [[0, -66], [0, 4]], { w: .7, color: '#7b8fb0', alpha: .35, seed: seed + 7, passes: 1 });
      return;
    }
    if (o.chimney !== false) { gouache(c, chimP, shade(roof, .1), 1, false); ink(c, chimP, { close: true, smooth: false, w: 1.3, seed: seed + 1 }); }
    gouache(c, wallP, wall, 1, false); wash(c, wallP, '#d6bf9c', { al: .35, seed: seed + 2, smooth: false, off: 1.2 });
    pencil(c, [[-20, -8], [-12, -8]], { w: .8, alpha: .5, seed: seed + 20, passes: 1 }); pencil(c, [[14, -6], [21, -6]], { w: .8, alpha: .5, seed: seed + 21, passes: 1 });
    ink(c, wallP, { close: true, smooth: false, w: 1.5, seed: seed + 3 });
    gouache(c, roofP, roof, 1, false); wash(c, roofP, shade(roof, .35), { al: .45, seed: seed + 4, smooth: false });
    for (let r = 0; r < 3; r++) { const yy = -36 - r * 7, hw = 26 - r * 7; pencil(c, [[-hw, yy], [hw, yy]], { w: .8, color: shade(roof, .5), alpha: .6, seed: seed + 30 + r, passes: 1 }); }
    ink(c, roofP, { close: true, smooth: false, w: 1.7, seed: seed + 5 });
    gouache(c, doorP, o.door || shade(roof, .25)); ink(c, doorP, { w: 1.2, seed: seed + 6 });
    gouache(c, winP, o.lit ? '#ffd877' : '#d2dfe0', 1, false); ink(c, winP, { close: true, smooth: false, w: 1.1, seed: seed + 7 });
    pencil(c, [[15.5, -25], [15.5, -16]], { w: .8, alpha: .7, seed: seed + 8, passes: 1 }); pencil(c, [[11, -20.5], [20, -20.5]], { w: .8, alpha: .7, seed: seed + 9, passes: 1 });
  });
  return { x, y, win: [x + 15.5 * k, y - 20.5 * k], winR: 4.5 * k, door: [x, y - 9 * k], chim: [x + 16.5 * k, y - 58 * k], peak: [x, y - 57 * k], k };
}
function tree(c, x, y, s, P, seed = 3) {
  const k = s / 160;
  local(c, x, y, k, () => {
    const trunk = [[-8, 0], [-6, -40], [-8, -70], [-22, -92], [-16, -95], [-2, -76], [4, -102], [11, -100], [7, -72], [20, -90], [25, -86], [9, -58], [8, -30], [11, 0]];
    gouache(c, trunk, '#a37c59'); wash(c, trunk, '#6b4a33', { al: .45, seed }); 
    pencil(c, [[-2, -10], [-1, -30]], { w: .9, alpha: .5, seed: seed + 40, passes: 1 }); pencil(c, [[4, -22], [3, -36]], { w: .9, alpha: .5, seed: seed + 41, passes: 1 });
    ink(c, trunk, { close: true, w: 1.8, seed: seed + 1 });
    const ho = blob(1, -46, 5.5, 7.5, seed + 2, .06, 8); gouache(c, ho, '#3a2a20'); ink(c, ho, { close: true, w: 1.1, seed: seed + 3 });
    if (!P.bare) {
      const bl = [[-34, -108, 32, 26], [8, -128, 38, 30], [40, -104, 30, 25], [-8, -96, 34, 20], [-2, -150, 24, 18], [28, -142, 22, 17]].map((b, i) => blob(b[0], b[1], b[2], b[3], seed + 10 + i, .08, 11));
      bl.forEach(p => gouache(c, p, P.tree)); bl.forEach((p, i) => wash(c, p, P.tree2, { al: .38, seed: seed + 20 + i, off: 3 }));
      bl.forEach((p, i) => ink(c, p, { close: true, w: 1.3, seed: seed + 30 + i, alpha: .85 }));
      const r = rng(seed + 50), dots = P.blossom || (P.leaves ? '#c9542e' : null);
      if (dots) { c.fillStyle = dots; c.beginPath(); for (let i = 0; i < 28; i++) { const px = -55 + r() * 110, py = -165 + r() * 80; c.moveTo(px + 2.4, py); c.arc(px, py, (P.fruitR || 1.6) + r() * 1.4, 0, TAU); } c.fill(); }
    } else {
      [[[-20, -92], [-38, -118], [-44, -140]], [[4, -102], [0, -130], [6, -158]], [[20, -90], [40, -116], [46, -138]], [[-38, -118], [-56, -122]], [[0, -130], [-16, -146]], [[40, -116], [58, -114]]].forEach((b, i) => ink(c, b, { w: 1.5 - (i > 2 ? .4 : 0), seed: seed + 60 + i }));
      [[-42, -136], [4, -154], [44, -136], [-30, -112], [32, -112]].forEach(([px, py], i) => gouache(c, blob(px, py, 7, 2.6, seed + 70 + i, .15, 8), '#ffffff', .95));
    }
  });
  return { hollow: [x + 1 * k, y - 46 * k], k };
}
function pond(c, x, y, rx, ry, P, seed) {
  const p = blob(x, y, rx, ry, seed, .05, 14), ice = P.snow;
  gouache(c, p, ice ? '#eef3f4' : '#d4e5e3'); wash(c, p, ice ? '#a9bfc9' : '#6aa2b2', { al: .55, seed: seed + 1, off: 2 });
  ink(c, p, { close: true, w: 1.3, seed: seed + 2, alpha: .85 });
  for (let i = 0; i < 3; i++) { const yy = y - ry * .2 + i * ry * .35, xx = x - rx * .3 + i * rx * .25; pencil(c, [[xx - rx * .14, yy], [xx + rx * .14, yy]], { w: 1, color: ice ? '#ffffff' : '#3f6f7c', alpha: .7, seed: seed + 3 + i, passes: 1 }); }
  if (!ice) {
    const lp = blob(x + rx * .38, y - ry * .05, rx * .17, ry * .42, seed + 9, .06, 10); gouache(c, lp, '#8fb36a'); wash(c, lp, '#4f7a35', { al: .4, seed: seed + 10 }); ink(c, lp, { close: true, w: 1, seed: seed + 11 });
    pencil(c, [[x + rx * .38, y - ry * .05], [x + rx * .52, y - ry * .25]], { w: .9, alpha: .7, seed: seed + 12, passes: 1 });
    for (let i = 0; i < 4; i++) { const bx = x - rx * .92 + i * 4; ink(c, [[bx, y + ry * .1], [bx - 1 + i, y - ry * 1.1 - i * 3]], { w: 1.1, color: '#5d7a42', seed: seed + 20 + i }); }
    c.fillStyle = '#7a5235'; c.beginPath(); c.ellipse(x - rx * .92 + 5, y - ry * 1.15 - 6, 1.6, 4, 0, 0, TAU); c.fill();
  }
}
function fence(c, x0, x1, y, seed) {
  for (let x = x0, i = 0; x <= x1; x += 24, i++) {
    const p = [[x - 2.4, y + 4], [x - 2, y - 18], [x + .2, y - 20.5], [x + 2.4, y - 18], [x + 2.6, y + 4]];
    gouache(c, p, '#cfae84', 1, false); ink(c, p, { close: true, smooth: false, w: 1.1, seed: seed + i });
  }
  [-13, -5].forEach((d, j) => { const pts = []; for (let x = x0 - 4; x <= x1 + 4; x += 12) pts.push([x, y + d + Math.sin((x - x0) / 24 * Math.PI) * 1.4 + (hash(x | 0, seed + j) - .5)]); ink(c, pts, { w: 1.4, seed: seed + 40 + j, color: '#5b412e', p: FLAT }); });
}
function patch(c, x, y, w, h, P, seed) {
  const bed = blob(x, y, w / 2, h / 2, seed, .04, 12); gouache(c, bed, P.soil); wash(c, bed, P.soilW, { al: .45, seed: seed + 1 }); ink(c, bed, { close: true, w: 1.2, seed: seed + 2, alpha: .85 });
  for (let r = -1; r <= 1; r++) {
    const yy = y + r * h * .26, xs = w * (.42 - Math.abs(r) * .06);
    ink(c, [[x - xs, yy + 1], [x, yy - 1], [x + xs, yy + 1]], { w: .9, color: '#5d3f2a', seed: seed + 10 + r, p: FLAT });
    for (let i = 0; i < 6; i++) {
      const px = x - xs * .85 + i * xs * .34, py = yy - 1;
      if (P.crop === 'sprout' || P.crop === 'tall') { const t = P.crop === 'tall' ? 1.6 : 1; ink(c, [[px, py], [px, py - 4 * t]], { w: 1, color: '#4f7a35', seed: seed + 20 + i + r * 9 });
        [-1, 1].forEach(d => gouache(c, blob(px + d * 2.6 * t, py - 4.6 * t, 2.6 * t, 1.3 * t, seed + 30 + i + d, .1, 7, d * .5), '#7ea85a')); }
      else if (P.crop === 'pumpkin' && (i + r) % 2 === 0) { const pk = blob(px, py - 2.5, 4.2, 3.2, seed + 40 + i, .06, 9); gouache(c, pk, '#e0873e'); ink(c, pk, { close: true, w: .9, seed: seed + 50 + i }); ink(c, [[px, py - 5.5], [px + 1, py - 7.5]], { w: 1, color: '#4f7a35', seed: seed + 60 + i }); }
    }
  }
  if (P.crop === 'snow') gouache(c, blob(x, y - h * .12, w * .46, h * .32, seed + 70, .06, 12), '#ffffff', .92);
}
function firering(c, x, y, r, seed, big) {
  if (big) { [[[-r * .75, r * .1], [r * .7, -r * .14]], [[-r * .7, -r * .16], [r * .72, r * .12]]].forEach((l, i) => { ink(c, [[x + l[0][0], y + l[0][1]], [x + l[1][0], y + l[1][1]]], { w: r * .22, color: '#6d4c35', seed: seed + 30 + i, p: FLAT }); pencil(c, [[x + l[0][0], y + l[0][1] - 1], [x + l[1][0], y + l[1][1] - 1]], { w: 1, color: '#2a1b12', alpha: .8, seed: seed + 34 + i }); }); }
  for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * .38, st = blob(sx, sy, r * .2, r * .13, seed + i, .12, 8); gouache(c, st, '#bdb5a8'); wash(c, st, '#7d756b', { al: .4, seed: seed + 20 + i, gran: .05 }); ink(c, st, { close: true, w: .9, seed: seed + 40 + i }); }
  if (!big) { ink(c, [[x - r * .5, y + r * .1], [x + r * .45, y - r * .12]], { w: 2.4, color: '#6d4c35', seed: seed + 60, p: FLAT }); ink(c, [[x - r * .45, y - r * .12], [x + r * .5, y + r * .08]], { w: 2.4, color: '#6d4c35', seed: seed + 61, p: FLAT }); }
}
function pathRibbon(c, pts, w0, w1, P, seed) {
  const s = crPts(pts, false, 3), L = [], R = [];
  for (let i = 0; i < s.length; i++) { const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl, hw = lerp(w0, w1, i / (s.length - 1)) / 2 * (1 + noise1(i * .2, seed) * .08);
    L.push([s[i][0] + nx * hw, s[i][1] + ny * hw]); R.push([s[i][0] - nx * hw, s[i][1] - ny * hw]); }
  gouache(c, L.concat(R.slice().reverse()), P.path, 1, false);
  pencil(c, L, { w: 1, alpha: .5, seed: seed + 1, smooth: false }); pencil(c, R, { w: 1, alpha: .5, seed: seed + 2, smooth: false });
  const r = rng(seed); c.fillStyle = 'rgba(120,100,80,.35)'; c.beginPath(); for (let i = 0; i < 26; i++) { const j = Math.floor(r() * s.length), u = r(); const px = lerp(L[j][0], R[j][0], u), py = lerp(L[j][1], R[j][1], u); c.moveTo(px + 1.4, py); c.ellipse(px, py, 1.4, .9, 0, 0, TAU); } c.fill();
}
function tufts(c, x0, x1, y0, y1, n, seed, color, avoid) {
  const r = rng(seed); c.save(); c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = .9; c.globalAlpha = .55; c.beginPath();
  for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), s = 3 + (y - y0) / (y1 - y0 || 1) * 4; if (avoid && avoid(x, y)) continue; for (let k = -1; k <= 1; k++) { c.moveTo(x + k * 1.6, y); c.quadraticCurveTo(x + k * 2, y - s * .6, x + k * 3.2 + (r() - .5), y - s); } }
  c.stroke(); c.restore();
}
function flowers(c, x0, x1, y0, y1, n, seed, color) { if (!color) return; const r = rng(seed); c.fillStyle = color; c.beginPath(); for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; c.moveTo(x + Math.cos(a) * 1.6 + 1, y + Math.sin(a) * 1.6); c.arc(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1, 0, TAU); } } c.fill(); c.fillStyle = '#e8b44e'; c.beginPath(); const q = rng(seed); for (let i = 0; i < n; i++) { const x = x0 + q() * (x1 - x0), y = y0 + q() * (y1 - y0); c.moveTo(x + .8, y); c.arc(x, y, .8, 0, TAU); } c.fill(); }
function sun(c, x, y, r) { glow(c, x, y, r * 2.6, '#f7d27a', .35, 'source-over'); const d = blob(x, y, r, r, 77, .03, 12); gouache(c, d, '#f8da8f'); wash(c, d, '#ecb24c', { al: .55, seed: 78, off: 2 }); pencil(c, d.slice(0, 8), { w: 1, color: '#b07a2c', alpha: .5, seed: 79 }); }
function stake(c, x, y, s, seed) {
  ink(c, [[x, y], [x + 1, y - s]], { w: 1.6, color: '#6d4c35', seed, p: FLAT });
  const fl = [[x + 1, y - s], [x + s * .62, y - s * .84], [x + 1, y - s * .66]]; gouache(c, fl, '#f0c25d', 1, false); ink(c, fl, { close: true, smooth: false, w: 1, seed: seed + 1 });
  [-1, 1].forEach(d => { const lf = blob(x + d * 4, y - 4, 4, 1.8, seed + 3 + d, .1, 7, d * .6); gouache(c, lf, '#86b05e'); ink(c, lf, { close: true, w: .8, seed: seed + 5 + d }); });
}
function cloud(c, x, y, s, seed, dpr) {
  const sp = sprite('cloud' + seed + ':' + Math.round(s), s * 1.6, s * .8, s * .8, s * .45, dpr, g => {
    const bl = [[-.32, .02, .3, .2], [-.02, -.12, .34, .28], [.3, .02, .28, .2], [0, .08, .5, .15]].map((b, i) => blob(b[0] * s, b[1] * s, b[2] * s, b[3] * s, seed + i, .06, 10));
    bl.forEach(b => gouache(g, b, '#fffbf3', .96)); wash(g, blob(0, .12 * s, .5 * s, .1 * s, seed + 9, .05, 10), '#c9cdd4', { al: .25, seed: seed + 9, gran: .05 });
    bl.slice(0, 3).forEach((b, i) => pencil(g, b.slice(5).concat(b.slice(0, 1)), { w: .9, alpha: .4, seed: seed + 20 + i, passes: 1 }));
  });
  c.drawImage(sp.cv, x - sp.ox, y - sp.oy, sp.W, sp.H);
}
function smoke(c, x, y, s, t, seed) {
  for (let i = 0; i < 4; i++) { const ph = (t * .22 + i / 4) % 1, px = x + Math.sin(ph * 5 + i) * s * .25 + ph * s * .7, py = y - ph * s * 2.4, r = s * (.12 + ph * .32);
    c.save(); c.globalAlpha = (1 - ph) * .9; pencil(c, blob(px, py, r, r * .8, seed + i, .12, 8), { close: true, w: .9, color: '#8a7f75', alpha: .55, seed: seed + i, passes: 1 }); c.restore(); }
}
function glints(c, pts, t, seed) {
  pts.forEach(([x, y], i) => { const a = Math.max(0, Math.sin(t * 1.6 + hash(i, seed) * 9)); if (a < .05) return; const s = 2 + a * 3;
    c.save(); c.globalAlpha = a; c.strokeStyle = '#fffdf3'; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke(); c.fillStyle = '#f2c25a'; c.beginPath(); c.arc(x, y, 1.1, 0, TAU); c.fill(); c.restore(); });
}
function fireflies(c, n, x0, y0, x1, y1, t, seed) {
  for (let i = 0; i < n; i++) { const x = lerp(x0, x1, hash(i, seed)) + noise1(t * .25 + i * 3, seed) * 26, y = lerp(y0, y1, hash(i, seed + 1)) + noise1(t * .2 + i * 5, seed + 1) * 14, a = .5 + .5 * Math.sin(t * 2.1 + i * 1.7);
    glow(c, x, y, 11, '#ffd66e', .5 * a); c.fillStyle = `rgba(255,246,196,${.4 + .6 * a})`; c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fill(); }
}
function stars(c, x0, y0, x1, y1, n, t, seed) {
  for (let i = 0; i < n; i++) { const x = lerp(x0, x1, hash(i, seed)), y = lerp(y0, y1, Math.pow(hash(i, seed + 1), 1.4)), a = .45 + .55 * Math.abs(Math.sin(t * .8 + i * 2.3)), s = hash(i, seed + 2) > .82 ? 2.6 : 1.2;
    c.save(); c.globalAlpha = a; c.strokeStyle = '#f7efd6'; c.fillStyle = '#f7efd6'; c.lineWidth = .9;
    if (s > 2) { c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke(); } else { c.beginPath(); c.arc(x, y, .9, 0, TAU); c.fill(); }
    c.restore(); }
}
function moon(c, x, y, r) {
  glow(c, x, y, r * 3, '#f4ecd0', .22);
  c.save(); const A = new Path2D(); A.arc(x, y, r, 0, TAU); c.clip(A); c.beginPath(); c.rect(x - r * 2, y - r * 2, r * 4, r * 4); c.arc(x + r * .45, y - r * .2, r * .86, 0, TAU, true); c.fillStyle = '#f6eed3'; c.fill('evenodd'); c.restore();
  pencil(c, blob(x, y, r, r, 5, .02, 10).slice(2, 8), { w: .9, color: '#d9cfae', alpha: .5, seed: 6, passes: 1 });
}
function lantern(c, x, y, s, t) {
  ink(c, [[x, y - s * .9], [x, y - s * .5]], { w: 1, seed: 90 }); const b = [[x - s * .3, y - s * .5], [x + s * .3, y - s * .5], [x + s * .26, y], [x - s * .26, y]];
  gouache(c, b, '#ffe39a', 1, false); ink(c, b, { close: true, smooth: false, w: 1.1, seed: 91 });
}
function flame(c, x, y, s, t, seed = 1) {
  const f = Math.floor(t * 6); // exposure on twos at 12fps: six new flame drawings a second
  const tongues = [[-.28, .7, .9], [0, 1, 0], [.3, .66, 1.7]];
  [['#e0612f', 1], ['#f39b3b', .7], ['#fde4a3', .4]].forEach(([col, sc], li) => tongues.forEach(([dx, hh, ph], ti) => {
    const pts = [], N = 16, sw = noise1(f * .7 + ph, seed + ti) * .22;
    for (let k = 0; k < N; k++) { const th = k / N * TAU, m = Math.pow(Math.abs(Math.sin(th / 2)), 1.4), yy = -Math.cos(th), r = 1 + (hash(k + f * 31 + ti * 7 + li * 3, seed) - .5) * .22;
      const ux = Math.sin(th) * m * .42 * r, up = (1 - yy) / 2; pts.push([x + (dx + ux + sw * up) * s * sc * .9, y - (up * hh * 1.25 * sc * (1 + (hash(f + ti, seed + 9) - .5) * .18) - .12) * s * (li ? 1 : 1)]); }
    gouache(c, pts, col);
    if (!li) ink(c, pts, { close: true, w: 1.1, color: '#8a3a1c', seed: seed + f * 5 + ti, alpha: .7 });
  }));
}
function sparks(c, x, y, s, t, seed) {
  for (let i = 0; i < 14; i++) { const ph = (t * .5 + hash(i, seed)) % 1, px = x + (hash(i, seed + 1) - .5) * s * .7 + Math.sin(ph * 7 + i) * s * .16, py = y - s * .6 - ph * s * 2.4;
    c.fillStyle = `rgba(255,214,120,${(1 - ph) * .95})`; c.beginPath(); c.arc(px, py, 1.3 * (1 - ph * .5), 0, TAU); c.fill(); }
}
// Night pass (cf. doodle.md nightShot): multiply a dark layer over the frame, with pools of light cut out of it.
function night(el, c, w, h, lights, k = .84, color = '#1b1f3d') {
  const L = el.layer('night'), g = L.getContext('2d'), d = el.dpr;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, L.width, L.height); g.setTransform(d, 0, 0, d, 0, 0);
  g.globalAlpha = k; g.fillStyle = color; g.fillRect(0, 0, w, h); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
  lights.forEach(l => { const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r); gr.addColorStop(0, `rgba(0,0,0,${l.k ?? 1})`); gr.addColorStop(.55, `rgba(0,0,0,${(l.k ?? 1) * .5})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2); });
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'multiply'; c.drawImage(L, 0, 0); c.restore();
  lights.forEach(l => { if (l.color) glow(c, l.x, l.y, l.r * (l.g ?? .8), l.color, l.a ?? .3); });
}
function litWindow(c, hm) { const [x, y] = hm.win, r = hm.winR; glow(c, x, y, r * 7, '#ffcf70', .5); c.fillStyle = '#ffdc84'; c.fillRect(x - r, y - r, r * 2, r * 2); c.strokeStyle = 'rgba(60,40,20,.7)'; c.lineWidth = .8; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x, y + r); c.moveTo(x - r, y); c.lineTo(x + r, y); c.stroke(); }
function fade(c, w, h, y0, color) { const g = c.createLinearGradient(0, y0, 0, h); g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, 1)); c.fillStyle = g; c.fillRect(0, y0, w, h - y0); }

/* ---------- scenes ---------- */
const S = {};
const KINDS = ['rabbit', 'hedgehog', 'frog', 'mole', 'sheep'];
S.farm = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season];
    paper(c, w, h, P.sky, 3);
    wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .2], [-10, h * .28]], P.sky2, { al: .55, seed: 4, smooth: false, off: 6, gran: .06, edge: .12 });
    const R = o.alt ? ALTROOF : ROOF;
    if (o.rain) rainbow(c, w, h); else if (!o.night) sun(c, w * .8, h * .12, w * .07);
    const H1 = hill(c, w, h, h * .3, h * .022, .012, 5, P.far, { washC: P.farW, alpha: .4 }), homes = {};
    homes.rabbit = house(c, w * .15, H1(w * .15) + 4, w * .11, { roof: R.rabbit, seed: 71, lit: o.night && o.lit.includes('rabbit') });
    homes.hedgehog = house(c, w * .47, H1(w * .47) + 4, w * .12, { roof: R.hedgehog, seed: 72, lit: o.night && o.lit.includes('hedgehog') });
    homes.frog = house(c, w * .74, H1(w * .74) + 4, w * .1, { roof: R.frog, seed: 73, lit: o.night && o.lit.includes('frog') });
    const H2 = hill(c, w, h, h * .385, h * .018, .009, 6, P.mid, { washC: P.midW, alpha: .45 });
    homes.mole = house(c, w * .3, H2(w * .3) + 5, w * .13, { roof: R.mole, seed: 74, lit: o.night && o.lit.includes('mole') });
    homes.sheep = house(c, w * .6, H2(w * .6) + 5, w * .12, { roof: R.sheep, seed: 75, lit: o.night && o.lit.includes('sheep') });
    hill(c, w, h, h * .46, h * .012, .007, 7, P.near, { washC: P.nearW, alpha: .7, line: 'ink' });
    const tr = tree(c, w * .88, h * .56, w * .4, o.fruit ? Object.assign({}, P, { blossom: FRUIT[o.fruit] || o.fruit, fruitR: 3.2 }) : P, 9);
    pathRibbon(c, [[w * .54, h + 10], [w * .47, h * .86], [w * .51, h * .74], [w * .44, h * .62], [w * .47, h * .49]], w * .13, w * .025, P, 19);
    fence(c, w * .02, w * .36, h * .565, 12);
    pond(c, w * .19, h * .8, w * .16, h * .05, P, 13);
    patch(c, w * .69, h * .69, w * .25, h * .075, P, 14);
    firering(c, w * .2, h * .93, w * .06, 15);
    stake(c, w * .36, h * .675, w * .06, 16);
    const avoid = (x, y) => Math.hypot((x - w * .19) / (w * .17), (y - h * .8) / (h * .06)) < 1 || Math.hypot((x - w * .69) / (w * .14), (y - h * .69) / (h * .05)) < 1;
    tufts(c, 0, w, h * .48, h, 70, 17, P.shade, avoid); flowers(c, 0, w, h * .6, h, 18, 18, P.flower);
    return { homes, hollow: tr.hollow };
  },
  fg(c, w, h, t, o) { const P = SEASONS[o.season], m = o.meta;
    if (!o.night) { cloud(c, ((w * .2 + t * 3) % (w + 160)) - 80, h * .1, w * .2, 21, o.dpr); cloud(c, ((w * .7 + t * 2) % (w + 160)) - 80, h * .19, w * .14, 31, o.dpr); }
    smoke(c, m.homes.mole.chim[0], m.homes.mole.chim[1], w * .04, t, 41);
    const cast = [['sheep', .13, .63, .15, 1], ['mole', .47, .645, .12, 1, o.night], ['frog', .36, .825, .12, 1], ['rabbit', .6, .8, .13, -1], ['hedgehog', .83, .885, .14, -1]];
    cast.forEach(([k, x, y, s, dir, sl], i) => { if (o.state === 'nocast' || (o.state === 'fire' && k === 'mole')) return; critter(c, k, w * x, h * y, w * s, { t, dir, sleep: !o.rain && (sl || (o.night && !o.lit.includes(k))), dpr: o.dpr, ph: i * .37, v: o.alt ? ALTV[k] : null, rot: o.rain ? Math.sin(t * 3 + i) * .08 : 0 }); });
    if (o.rain) { rainfall(c, w, h * .9, t, 3, 70); glints(c, [[w * .12, h * .8], [w * .24, h * .78], [w * .18, h * .83]], t * 2, 4); }
    const ow = m.hollow; critter(c, 'owl', ow[0], ow[1] + w * .012, w * .075, { t, sleep: true, dpr: o.dpr, shadow: false });
    zzz(c, ow[0] + w * .03, ow[1] - w * .05, w * .05, t);
    if (!o.night) glints(c, [[w * .62, h * .66], [w * .74, h * .7], [w * .66, h * .72], [w * .3, h * .9], [w * .08, h * .7]], t, 7);
    if (o.night) {
      const lights = KINDS.filter(k => o.lit.includes(k)).map(k => ({ x: m.homes[k].win[0], y: m.homes[k].win[1], r: w * .11, k: .75, color: '#ffc768', a: .25 }));
      night(o.el, c, w, h, lights, .82);
      KINDS.filter(k => o.lit.includes(k)).forEach(k => litWindow(c, m.homes[k]));
      stars(c, 0, h * .02, w, h * .25, 34, t, 3); moon(c, w * .18, h * .1, w * .045);
      fireflies(c, 8, w * .05, h * .5, w * .95, h * .9, t, 5);
      if (o.firefly) { const d = m.hollow; fireflies(c, 1, d[0] - 2, d[1] + 4, d[0] + 2, d[1] + 6, t * .3, 9); }
    }
  } };
S.strip = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season];
    paper(c, w, h, P.sky, 31); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .35], [-10, h * .45]], P.sky2, { al: .5, seed: 32, smooth: false, off: 6, gran: .06, edge: .12 });
    sun(c, w * .86, h * .3, h * .07);
    const H1 = hill(c, w, h, h * .52, h * .03, .014, 33, P.far, { washC: P.farW, alpha: .4 }), homes = {};
    [['rabbit', .08], ['hedgehog', .29], ['frog', .53], ['mole', .7], ['sheep', .9]].forEach(([k, x], i) => homes[k] = house(c, w * x, H1(w * x) + 4, h * (.15 + (i % 2) * .03), { roof: ROOF[k], seed: 81 + i }));
    hill(c, w, h, h * .66, h * .02, .01, 34, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    pond(c, w * .09, h * .9, w * .1, h * .05, P, 35);
    fence(c, w * .58, w * .8, h * .74, 36);
    tufts(c, 0, w, h * .7, h, 46, 37, P.shade); flowers(c, w * .2, w, h * .74, h, 10, 38, P.flower);
    return { homes };
  },
  fg(c, w, h, t, o) { const m = o.meta; if (o.state === 'nocast') { const m = o.meta; cloud(c, ((w * .35 + t * 3) % (w + 160)) - 80, h * .3, h * .3, 22, o.dpr); smoke(c, m.homes.hedgehog.chim[0], m.homes.hedgehog.chim[1], h * .05, t, 42); return; }
    cloud(c, ((w * .35 + t * 3) % (w + 160)) - 80, h * .3, h * .3, 22, o.dpr);
    smoke(c, m.homes.hedgehog.chim[0], m.homes.hedgehog.chim[1], h * .05, t, 42);
    const y = h * .87, s = h * .3;
    [['sheep', .22, 1.1, 1], ['frog', .37, .95, 1], ['hedgehog', .51, 1.05, -1], ['rabbit', .66, 1, -1], ['mole', .82, 1, 1, true]].forEach(([k, x, sc, dir, sl], i) => critter(c, k, w * x, y + (i % 2) * 3, s * sc, { t, dir, sleep: sl, dpr: o.dpr, ph: i * .41 }));
    zzz(c, w * .86, y - s * .8, s * .3, t);
    const pk = m.homes.frog.peak; critter(c, 'owl', pk[0], pk[1] + 2, h * .14, { t, sleep: true, dpr: o.dpr, shadow: false }); zzz(c, pk[0] + h * .05, pk[1] - h * .12, h * .08, t + 1);
  } };
S.gate = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season];
    paper(c, w, h, '#f5e3cd', 41); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .36]], '#f1c9b0', { al: .5, seed: 42, smooth: false, off: 8, gran: .05, edge: .1 });
    sun(c, w * .66, h * .4, w * .12);
    const H1 = hill(c, w, h, h * .41, h * .02, .012, 43, P.far, { washC: P.farW, alpha: .35 });
    [.2, .36, .84].forEach((x, i) => house(c, w * x, H1(w * x) + 3, w * .065, { roof: ROOF[KINDS[i + 1]], seed: 90 + i }));
    hill(c, w, h, h * .5, h * .02, .009, 44, P.mid, { washC: P.midW, alpha: .4 });
    hill(c, w, h, h * .58, h * .012, .006, 45, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    tree(c, w * .1, h * .64, w * .44, P, 46);
    pathRibbon(c, [[w * .52, h + 20], [w * .45, h * .86], [w * .53, h * .72], [w * .5, h * .62]], w * .42, w * .1, P, 47);
    const gy = h * .64, gx0 = w * .35, gx1 = w * .65, gh = h * .16;
    fence(c, -10, gx0 - 12, gy - 2, 48); fence(c, gx1 + 12, w + 10, gy - 2, 49);
    [gx0, gx1].forEach((x, i) => { const p = [[x - 4, gy + 4], [x - 3.4, gy - gh], [x + 3.6, gy - gh - 1], [x + 4, gy + 4]]; gouache(c, p, '#c49b6f', 1, false); wash(c, p, '#6d4c35', { al: .35, seed: 50 + i, smooth: false }); ink(c, p, { close: true, smooth: false, w: 1.5, seed: 52 + i }); });
    const board = [[gx0 - 10, gy - gh - 2], [gx0 - 6, gy - gh - 28], [gx1 + 6, gy - gh - 30], [gx1 + 10, gy - gh - 4]];
    gouache(c, board, '#e7c99c', 1, false); wash(c, board, '#a77d45', { al: .35, seed: 55, smooth: false }); ink(c, board, { close: true, smooth: false, w: 1.6, seed: 56 });
    c.save(); c.fillStyle = INK; c.font = `700 ${Math.round(w * .062)}px Gaegu, 'Comic Sans MS', cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('come in, come in', w * .5, gy - gh - 15); c.restore();
    const door = [[gx0 + 4, gy - 4], [gx0 + 4, gy - gh * .62], [gx0 - 22, gy - gh * .5], [gx0 - 22, gy + 6]];
    pencil(c, door, { close: true, smooth: false, w: 1.3, alpha: .9, seed: 57 }); pencil(c, [[gx0 + 4, gy - gh * .32], [gx0 - 22, gy - gh * .24]], { w: 1.2, alpha: .8, seed: 58 });
    tufts(c, 0, w, h * .6, h * .9, 50, 59, P.shade); flowers(c, 0, w, h * .66, h * .9, 16, 60, P.flower);
    fade(c, w, h, h * .82, '#F5EEE2');
  },
  fg(c, w, h, t, o) { const gy = h * .64, gh = h * .16;
    cloud(c, ((w * .3 + t * 3) % (w + 160)) - 80, h * .12, w * .2, 23, o.dpr);
    critter(c, 'rabbit', w * .25, h * .79, w * .19, { t, dpr: o.dpr, ph: .2 });
    critter(c, 'hedgehog', w * .74, h * .8, w * .17, { t, dir: -1, dpr: o.dpr, ph: .7 });
    critter(c, 'owl', w * .65, gy - gh - 28, w * .1, { t, dpr: o.dpr, shadow: false, ph: .5 });
    glints(c, [[w * .1, h * .72], [w * .9, h * .7], [w * .58, h * .77], [w * .4, h * .7]], t, 8);
  } };
S.invite = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season];
    paper(c, w, h, '#F5EEE2', 61); sun(c, w * .85, h * .2, w * .06);
    const Y = hill(c, w, h, h * .62, h * .04, .008, 62, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    [[.13, .13], [.31, .12], [.71, .12], [.88, .13]].forEach(([x, s], i) => { house(c, w * x, Y(w * x) + 5, w * s, { sketch: true, seed: 63 + i * 9 }); });
    const hm = house(c, w * .5, Y(w * .5) + 6, w * .2, { roof: ROOF.rabbit, seed: 71 });
    pathRibbon(c, [[w * .5, h + 10], [w * .46, h * .85], [w * .5, Y(w * .5) + 4]], w * .16, w * .04, P, 64);
    tufts(c, 0, w, h * .66, h, 40, 65, P.shade); flowers(c, 0, w, h * .7, h, 10, 66, P.flower);
    return { hm, Y };
  },
  fg(c, w, h, t, o) { const m = o.meta; smoke(c, m.hm.chim[0], m.hm.chim[1], w * .05, t, 43);
    critter(c, 'rabbit', w * .33, h * .93, w * .15, { t, dpr: o.dpr });
    [[.13, .13], [.31, .12], [.71, .12], [.88, .13]].forEach(([x, s], i) => { const y = m.Y(w * x) - w * s * 1.2; c.save(); c.globalAlpha = .55 + .45 * Math.sin(t * 1.4 + i); c.fillStyle = '#8b7e72'; c.font = `700 ${Math.round(w * .05)}px Gaegu, cursive`; c.textAlign = 'center'; c.fillText('?', w * x, y); c.restore(); });
  } };
S.campfire = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season];
    paper(c, w, h, '#eadcc6', 51);
    const H1 = hill(c, w, h, h * .37, h * .015, .01, 52, P.far, { washC: P.farW, alpha: .4 });
    for (let i = 0; i < 9; i++) { const x = w * (i / 8) + (hash(i, 53) - .5) * 20, y = H1(x) + 2, r = w * (.05 + hash(i, 54) * .03), tb = blob(x, y - r * .9, r, r * 1.1, 55 + i, .1, 10); gouache(c, tb, shade(P.tree || '#7d8f7f', .25)); ink(c, tb, { close: true, w: 1.1, seed: 60 + i, alpha: .7 }); }
    const homes = { rabbit: house(c, w * .14, H1(w * .14) + 6, w * .09, { roof: ROOF.rabbit, seed: 101, lit: true }), sheep: house(c, w * .32, H1(w * .32) + 7, w * .08, { roof: ROOF.sheep, seed: 102, lit: true }) };
    hill(c, w, h, h * .44, h * .015, .008, 56, P.mid, { washC: P.midW, alpha: .45 });
    hill(c, w, h, h * .5, h * .01, .006, 57, P.near, { washC: P.nearW, line: 'ink', alpha: .6 });
    pathRibbon(c, [[w + 20, h * .45], [w * .86, h * .5], [w * .74, h * .58], [w * .62, h * .62]], w * .05, w * .12, P, 58);
    [[.16, .665, .2], [.84, .665, .18]].forEach(([x, y, l], i) => { const lg = [[w * (x - l / 2), h * y], [w * (x - l / 2) + 2, h * y - 12], [w * (x + l / 2), h * y - 12], [w * (x + l / 2) + 2, h * y]]; gouache(c, lg, '#8a6446', 1, false); wash(c, lg, '#4d3424', { al: .4, seed: 70 + i, smooth: false }); ink(c, lg, { close: true, w: 1.5, seed: 72 + i }); });
    firering(c, w * .5, h * .625, w * .14, 74, true);
    tufts(c, 0, w, h * .52, h, 90, 75, P.shade);
    return { homes, fire: [w * .5, h * .62] };
  },
  fg(c, w, h, t, o) { const [fx, fy] = o.meta.fire, fl = 1 + noise1(t * 5, 3) * .05 + noise1(t * 11, 4) * .03, D = o.dpr;
    critter(c, 'owl', w * .5, h * .54, w * .16, { t, dpr: D, ph: .1 });
    critter(c, 'sheep', w * .16, h * .65, w * .22, { t, dpr: D, ph: .3 });
    critter(c, 'frog', w * .32, h * .695, w * .17, { t, dpr: D, ph: .5 });
    critter(c, 'rabbit', w * .68, h * .7, w * .17, { t, dir: -1, dpr: D, ph: .7 });
    critter(c, 'hedgehog', w * .85, h * .65, w * .18, { t, dir: -1, dpr: D, ph: .9 });
    const bob = Math.abs(Math.sin(t * 2.2)) * 2, mx = w * .87, my = h * .495;
    critter(c, 'mole', mx, my - bob, w * .09, { t, dir: -1, dpr: D, ph: .4 });
    const lx = mx - w * .05, ly = my - w * .035 - bob;
    night(o.el, c, w, h, [{ x: fx, y: fy - 20, r: w * .54 * fl, k: 1, color: '#ff9a45', a: .32 }, { x: lx, y: ly, r: w * .17, k: .85, color: '#ffc768', a: .3 }, ...Object.values(o.meta.homes).map(hm => ({ x: hm.win[0], y: hm.win[1], r: 16, k: .7 }))], .9);
    Object.values(o.meta.homes).forEach(hm => litWindow(c, hm));
    lantern(c, lx, ly, w * .035, t); glow(c, lx, ly, w * .07, '#ffd170', .7);
    glow(c, fx, fy - w * .06, w * .32 * fl, '#ffb050', .5);
    flame(c, fx, fy, w * .17, t, 7); sparks(c, fx, fy, w * .17, t, 8);
    stars(c, 0, h * .02, w, h * .32, 46, t, 9); moon(c, w * .82, h * .11, w * .045);
    fireflies(c, 6, w * .05, h * .4, w * .95, h * .55, t, 10);
  } };
S.firesmall = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, '#eadcc6', 141); hill(c, w, h, h * .62, h * .02, .02, 142, P.near, { washC: P.nearW, line: 'ink', alpha: .6 }); firering(c, w * .5, h * .84, w * .2, 143, true); return {}; },
  fg(c, w, h, t, o) { const fl = 1 + noise1(t * 5, 3) * .05;
    critter(c, 'rabbit', w * .22, h * .86, w * .25, { t, dpr: o.dpr }); critter(c, 'hedgehog', w * .8, h * .88, w * .26, { t, dir: -1, dpr: o.dpr });
    night(o.el, c, w, h, [{ x: w * .5, y: h * .78, r: w * .75 * fl, k: 1, color: '#ff9a45', a: .3 }], .88);
    glow(c, w * .5, h * .74, w * .4 * fl, '#ffb050', .5); flame(c, w * .5, h * .83, w * .24, t, 3); sparks(c, w * .5, h * .83, w * .2, t, 4); stars(c, 0, h * .03, w, h * .4, 16, t, 5);
  } };
S.widget = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season];
    paper(c, w, h, P.sky, 121);
    const Y = hill(c, w, h, h * .58, h * .05, .012, 122, P.mid, { washC: P.midW, alpha: .4 }), homes = {};
    [['rabbit', .1, .14], ['hedgehog', .29, .15], ['frog', .48, .13], ['mole', .64, .15], ['sheep', .8, .14]].forEach(([k, x, s], i) => homes[k] = house(c, w * x, Y(w * x) + 6, w * s, { roof: ROOF[k], seed: 130 + i, lit: o.lit.includes(k) }));
    hill(c, w, h, h * .82, h * .03, .01, 123, P.near, { washC: P.nearW, line: 'ink', alpha: .6 });
    const tr = tree(c, w * .95, h * .9, h * .9, P, 124);
    tufts(c, 0, w, h * .84, h, 30, 125, P.shade);
    return { homes, hollow: tr.hollow };
  },
  fg(c, w, h, t, o) { const m = o.meta, on = KINDS.filter(k => o.lit.includes(k));
    if (o.lit.includes('owl')) critter(c, 'owl', m.hollow[0], m.hollow[1] + 4, h * .16, { t, dpr: o.dpr, shadow: false });
    night(o.el, c, w, h, on.map(k => ({ x: m.homes[k].win[0], y: m.homes[k].win[1], r: w * .1, k: .7, color: '#ffc768', a: .22 })), .86);
    on.forEach(k => litWindow(c, m.homes[k]));
    stars(c, 0, h * .03, w, h * .45, 30, t, 126); moon(c, w * .87, h * .2, h * .07);
    fireflies(c, 5, w * .05, h * .7, w * .9, h * .95, t, 127);
  } };
S.appicon = { anim: false, bg() { return {}; }, fg(c, w, h, t, o) { S.icon2.fg.call(this, c, w, h, 0, Object.assign({}, o, { name: 'a', state: o.state === 'dark' ? 'dark' : 'default' })); } };
S.stage = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season], g = blob(w * .5, h * .83, w * .4, h * .07, 161, .05, 14); gouache(c, g, P.near); wash(c, g, P.nearW, { al: .4, seed: 162 }); pencil(c, g.slice(0, 8), { w: 1, alpha: .5, seed: 163 }); tufts(c, w * .15, w * .85, h * .78, h * .88, 16, 164, P.shade); return {}; },
  fg(c, w, h, t, o) { const k = CR[o.kind] ? o.kind : 'rabbit', sz = (CR[k].stage || { rabbit: .5, hedgehog: .78, frog: .78, mole: .62, sheep: .66, owl: .58 }[k] || .6) * Math.min(w * 1.2, h * .9);
    critter(c, k, w * .5, h * .84, sz, { t, dpr: o.dpr, dir: k === 'hedgehog' || k === 'sheep' ? -1 : 1, shadow: false, v: o.v, sleep: o.state === 'sleep' });
    if (o.state === 'sleep') zzz(c, w * .5 + sz * .3, h * .84 - sz * .95, sz * .22, t); } };
S.avatar = { anim: false,
  bg(c, w, h, o) { const k = CR[o.kind] ? o.kind : 'rabbit', C = CR[k], size = h * 1.6 * (C.az || 1), dir = (k === 'hedgehog' || k === 'sheep') ? -1 : 1;
    const cv = o.v && o.v.coat && COATS[k] && COATS[k][o.v.coat]; c.fillStyle = (cv && cv.tint) || C.tint; c.fillRect(0, 0, w, h);
    const sp = critterSprite(k, size, o.state === 'sleep' ? 'sleep' : 'open', dir, o.dpr || 2, o.v), kk = Math.round(size) / 100;
    c.drawImage(sp.cv, w / 2 - C.head[0] * kk * dir - sp.ox, h * .53 - C.head[1] * kk - sp.oy, sp.W, sp.H);
  } };
S.seed = { anim: true,
  bg(c, w, h, o) { const st = +o.stage || 0, m = Math.min(w, h), cx = w / 2, by = h * .8, s = m / 100;
    local(c, cx, by, s, () => {
      const mound = [[-38, 6], [-26, -4], [-8, -9], [10, -9], [28, -4], [40, 6], [40, 14], [-38, 14]]; gouache(c, mound, '#b98d68'); wash(c, mound, '#7d5a3e', { al: .5, seed: 171 }); ink(c, mound.slice(0, 6), { w: 1.4, seed: 172 });
      if (st === 0) { const sd = blob(0, -9, 8, 5.5, 173, .06, 9, -.3); gouache(c, sd, '#9b6f45'); wash(c, sd, '#5e3f27', { al: .4, seed: 174 }); ink(c, sd, { close: true, w: 1.3, seed: 175 }); pencil(c, [[-3, -11], [3, -8]], { w: .9, alpha: .6, seed: 176, passes: 1 }); return; }
      const top = st === 1 ? -26 : st === 2 ? -48 : -56; ink(c, [[0, -8], [-2, (top - 8) / 2], [0, top]], { w: 1.6, color: '#4f7a35', seed: 177 });
      const lv = st === 1 ? [[-8, -24, -.5], [8, -27, .5]] : [[-11, -24, -.4], [11, -30, .45], [-9, -38, -.6]];
      lv.forEach(([x, y, r], i) => { const l = blob(x, y, st === 1 ? 8 : 10, st === 1 ? 4 : 4.6, 180 + i, .08, 9, r); gouache(c, l, '#8fb768'); wash(c, l, '#4f7a35', { al: .35, seed: 183 + i }); ink(c, l, { close: true, w: 1.1, seed: 186 + i }); });
      if (st === 2) { const b = blob(0, top - 4, 5.5, 7, 190, .06, 9); gouache(c, b, '#e9a18c'); wash(c, b, '#c0643f', { al: .4, seed: 191 }); ink(c, b, { close: true, w: 1.1, seed: 192 }); }
      if (st === 3) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, p = blob(Math.cos(a) * 9, top + Math.sin(a) * 9, 7, 4.6, 193 + i, .08, 9, a); gouache(c, p, '#f6cf6a'); wash(c, p, '#e0a33a', { al: .35, seed: 200 + i }); ink(c, p, { close: true, w: 1, seed: 206 + i }); }
        const cc = blob(0, top, 5, 5, 212, .05, 9); gouache(c, cc, '#b0643a'); ink(c, cc, { close: true, w: 1, seed: 213 }); }
    });
    return {};
  },
  fg(c, w, h, t, o) { if (+o.stage === 3) { const m = Math.min(w, h); glints(c, [[w / 2 - m * .26, h * .8 - m * .62], [w / 2 + m * .28, h * .8 - m * .5], [w / 2 + m * .1, h * .8 - m * .78]], t, 11); } } };
S.door = { anim: true,
  bg(c, w, h, o) { const k = o.kind || 'rabbit', roof = ROOF[k], s = Math.min(w / 80, h / 100);
    paper(c, w, h, '#efe4d0', 220 + k.length);
    local(c, w / 2, h * .86, s, () => {
      const wall = [[-40, 8], [-40, -96], [40, -96], [40, 8]]; gouache(c, wall, k === 'owl' ? '#c9a37b' : '#f1e3c9', 1, false); wash(c, wall, k === 'owl' ? '#6b4a33' : '#cdb48f', { al: .35, seed: 221, smooth: false, off: 3 });
      if (k === 'owl') for (let i = 0; i < 6; i++) pencil(c, [[-32 + i * 13, -90], [-30 + i * 13, 0]], { w: 1, alpha: .5, seed: 230 + i, passes: 1 });
      else for (let i = 0; i < 7; i++) { const yy = -86 + i * 13; pencil(c, [[-40, yy], [40, yy]], { w: .7, alpha: .18, seed: 240 + i, passes: 1 }); }
      const d = [[-18, 0], [-18, -42], [-14, -54], [0, -60], [14, -54], [18, -42], [18, 0]]; gouache(c, d, roof); wash(c, d, shade(roof, .35), { al: .4, seed: 250 }); ink(c, d, { w: 1.6, seed: 251 });
      pencil(c, [[-6, -54], [-6, 0]], { w: .8, color: shade(roof, .55), alpha: .7, seed: 252, passes: 1 }); pencil(c, [[6, -54], [6, 0]], { w: .8, color: shade(roof, .55), alpha: .7, seed: 253, passes: 1 });
      c.fillStyle = '#e8b44e'; c.beginPath(); c.arc(11, -24, 2.2, 0, TAU); c.fill();
      const step = blob(0, 4, 28, 5, 254, .06, 10); gouache(c, step, '#bdb5a8'); wash(c, step, '#7d756b', { al: .35, seed: 255 }); ink(c, step, { close: true, w: 1.1, seed: 256 });
      const pl = [[-12, -74], [12, -74], [12, -66], [-12, -66]]; gouache(c, pl, '#fbf3e2', 1, false); ink(c, pl, { close: true, smooth: false, w: .9, seed: 257 });
    });
    return { s };
  },
  fg(c, w, h, t, o) { const s = o.meta.s; c.save(); c.fillStyle = INK; c.font = `700 ${Math.round(9 * s)}px Gaegu, cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(NAMES[o.kind] || '', w / 2, h * .86 - 70 * s); c.restore();
    if (o.firefly) { const x = w / 2 + 16 * s, y = h * .86 - 2 * s, a = .7 + .3 * Math.sin(t * 2.4); glow(c, x, y, 26 * s, '#ffd66e', .7 * a, 'source-over'); c.fillStyle = '#fff3c0'; c.beginPath(); c.arc(x, y, 2.4 * s, 0, TAU); c.fill(); } } };
S.icon = { anim: false,
  bg(c, w, h, o) { const m = Math.min(w, h), lw = clamp(m / 15, 1.1, 2.6), col = o.color || INK;
    local(c, (w - m) / 2, (h - m) / 2, m / 100, () => { const f = ICONS[o.name]; if (f) f(c, lw, col); }); } };
const ICONS = {
  rosette(c, lw) { [[[44, 56], [34, 92], [42, 88], [46, 94], [50, 58]], [[56, 56], [66, 92], [58, 88], [54, 94], [50, 58]]].forEach((p, i) => { gouache(c, p, '#c9543e', 1, false); wash(c, p, '#8a3a1c', { al: .3, seed: 3001 + i, smooth: false }); ink(c, p, { close: true, smooth: false, w: lw * .8, seed: 3003 + i }); });
    const pts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU, r = k % 2 ? 30 : 34; pts.push([50 + Math.cos(a) * r, 40 + Math.sin(a) * r]); } gouache(c, pts, '#e8b44e', 1, false); wash(c, pts, '#b07a2c', { al: .4, seed: 3005, smooth: false }); ink(c, pts, { close: true, smooth: false, w: lw * .8, seed: 3006 });
    const inn = blob(50, 40, 22, 22, 3007, .02, 12); gouache(c, inn, '#fbf3e2'); ink(c, inn, { close: true, w: lw * .7, seed: 3008 }); local(c, 31, 22, .38, () => ICONS.bee(c, lw * .8)); },
  bee(c, lw) { [[38, 30, -.5], [58, 26, .3]].forEach(([x, y, r], i) => { const wg = blob(x, y, 14, 9, 3010 + i, .05, 9, r); gouache(c, wg, '#ffffff', .85); pencil(c, wg, { close: true, w: lw * .7, alpha: .8, seed: 3012 + i, passes: 1 }); });
    const bd = blob(48, 58, 28, 19, 3014, .04, 12), bp = toPath(bd); gouache(c, bd, '#f2c94c'); wash(c, bd, '#c78a2c', { al: .35, seed: 3015, clip: bp });
    c.save(); c.clip(bp); [40, 56].forEach((x, i) => ink(c, [[x - 2, 36], [x + 2, 80]], { w: lw * 2.6, seed: 3016 + i, p: FLAT })); c.restore();
    ink(c, bd, { close: true, w: lw, seed: 3018 }); const hd = blob(80, 54, 11, 11, 3019, .05, 9); gouache(c, hd, '#3a2e26'); ink(c, hd, { close: true, w: lw * .8, seed: 3020 });
    c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(83, 51, 2.4, 0, TAU); c.fill(); ink(c, [[82, 44], [88, 32]], { w: lw * .7, seed: 3021 }); ink(c, [[77, 44], [76, 31]], { w: lw * .7, seed: 3022 }); ink(c, [[20, 60], [13, 62]], { w: lw * .8, seed: 3023 }); },
  raincloud(c, lw) { [[40, 66], [52, 70], [64, 66]].forEach(([x, y], i) => ink(c, [[x, y], [x - 4, y + 16]], { w: lw * .9, color: '#5f8fb5', seed: 3030 + i })); const bl = [[34, 46, 18, 14], [54, 36, 22, 20], [72, 48, 16, 12], [50, 52, 30, 10]].map((b, i) => blob(b[0], b[1], b[2], b[3], 3033 + i, .05, 9)); bl.forEach((b, i) => ink(c, b, { close: true, w: lw * 1.8, seed: 3037 + i })); bl.forEach(b => gouache(c, b, '#c3c8d2')); bl.forEach((b, i) => wash(c, b, '#6a7286', { al: .25, seed: 3041 + i })); },
  envelope(c, lw) { const p = [[14, 28], [86, 26], [88, 76], [12, 78]]; gouache(c, p, '#fbf3e2', 1, false); wash(c, p, '#d8c3a2', { al: .35, seed: 3050, smooth: false }); ink(c, p, { close: true, smooth: false, w: lw, seed: 3051 }); ink(c, [[14, 30], [50, 56], [86, 28]], { w: lw * .9, seed: 3052, smooth: false }); gouache(c, blob(50, 56, 7, 6, 3053, .1, 8), '#c9543e'); },
  hat(c, lw) { const crown = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 - k / 10); crown.push([50 + Math.cos(a) * 24, 60 - Math.sin(a) * 26]); } const brim = blob(50, 62, 44, 11, 3070, .04, 12); gouache(c, brim, '#ecd08f'); wash(c, brim, '#b88a3c', { al: .4, seed: 3071 }); ink(c, brim, { close: true, w: lw, seed: 3072 }); gouache(c, crown, '#efd79c'); wash(c, crown, '#b88a3c', { al: .35, seed: 3073 }); ink(c, crown, { close: true, w: lw, seed: 3074 }); const band = [[26, 58], [74, 58], [74, 50], [26, 50]]; gouache(c, band, '#c9543e', 1, false); ink(c, band, { close: true, smooth: false, w: lw * .8, seed: 3075 }); },
  moon(c, lw, col) { c.save(); c.fillStyle = col; c.beginPath(); c.arc(50, 50, 32, 0, TAU); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(66, 38, 27, 0, TAU); c.fill(); c.restore(); },
  lock(c, lw, col) { ink(c, [[24, 46], [76, 46], [76, 86], [24, 86]], { close: true, smooth: false, w: lw, color: col, seed: 3060 }); ink(c, [[34, 46], [34, 30], [50, 18], [66, 30], [66, 46]], { w: lw, color: col, seed: 3061 }); c.fillStyle = col; c.beginPath(); c.arc(50, 64, lw * 1.6, 0, TAU); c.fill(); },
  sparkle(c, lw, col) { ink(c, [[44, 14], [50, 40], [76, 46], [50, 52], [44, 80], [38, 52], [12, 46], [38, 40]], { close: true, smooth: false, w: lw, color: col, seed: 3062 }); ink(c, [[76, 14], [78, 24], [88, 26], [78, 28], [76, 38], [74, 28], [64, 26], [74, 24]], { close: true, smooth: false, w: lw * .8, color: col, seed: 3063 }); },
  leaf(c, lw, col) { ink(c, [[18, 84], [26, 46], [56, 20], [86, 14], [80, 46], [56, 74]], { close: true, w: lw, color: col, seed: 3064 }); ink(c, [[18, 84], [70, 30]], { w: lw * .8, color: col, seed: 3065 }); },
  bell(c, lw, col) { ink(c, [[22, 74], [30, 66], [32, 42], [50, 22], [68, 42], [70, 66], [78, 74]], { close: true, w: lw, color: col, seed: 3066 }); c.fillStyle = col; c.beginPath(); c.arc(50, 84, lw * 1.8, 0, TAU); c.fill(); },
  door(c, lw, col) { ink(c, [[28, 88], [28, 38], [50, 16], [72, 38], [72, 88]], { w: lw, color: col, seed: 3067 }); ink(c, [[16, 88], [84, 88]], { w: lw, color: col, seed: 3068, p: FLAT }); c.fillStyle = col; c.beginPath(); c.arc(62, 60, lw * 1.4, 0, TAU); c.fill(); },
  dewdrop(c, lw) { const p = [[50, 8], [62, 30], [74, 50], [77, 66], [69, 82], [50, 90], [31, 82], [23, 66], [26, 50], [38, 30]]; gouache(c, p, '#e3f0f2'); wash(c, p, '#5f9fbd', { al: .6, seed: 301, off: 2 }); ink(c, p, { close: true, w: lw, seed: 302 }); ink(c, [[36, 62], [38, 72], [46, 79]], { w: lw * 1.1, color: '#ffffff', seed: 303 }); },
  firefly(c, lw) { glow(c, 50, 64, 46, '#ffd66e', .7, 'source-over'); [[36, 40, -.5], [64, 40, .5]].forEach(([x, y, r], i) => { const wg = blob(x, y, 14, 8, 310 + i, .05, 9, r); gouache(c, wg, '#ffffff', .75); pencil(c, wg, { close: true, w: lw * .6, alpha: .8, seed: 312 + i, passes: 1 }); });
    const tl = blob(50, 64, 11, 15, 314, .05, 9); gouache(c, tl, '#ffd56a'); ink(c, tl, { close: true, w: lw, seed: 315 }); const bd = blob(50, 42, 8, 9, 316, .05, 9); gouache(c, bd, '#4a3a2e'); ink(c, bd, { close: true, w: lw, seed: 317 });
    c.fillStyle = INK; c.beginPath(); c.arc(50, 28, 6.5, 0, TAU); c.fill(); ink(c, [[47, 23], [40, 10]], { w: lw * .7, seed: 318 }); ink(c, [[53, 23], [60, 10]], { w: lw * .7, seed: 319 }); },
  wave(c, lw) { const pad = blob(50, 64, 22, 18, 320, .05, 10); gouache(c, pad, '#f4d8cf'); wash(c, pad, '#e08f80', { al: .4, seed: 321 }); ink(c, pad, { close: true, w: lw, seed: 322 });
    [[27, 38], [41, 27], [59, 27], [73, 38]].forEach(([x, y], i) => { const b = blob(x, y, 8, 9, 323 + i, .06, 8); gouache(c, b, '#f4d8cf'); ink(c, b, { close: true, w: lw * .9, seed: 327 + i }); });
    ink(c, [[12, 30], [8, 46], [12, 60]], { w: lw * .9, seed: 331 }); ink(c, [[88, 30], [92, 46], [88, 60]], { w: lw * .9, seed: 332 }); },
  note(c, lw) { const p = [[22, 18], [74, 13], [80, 84], [27, 88]]; gouache(c, p, '#fbf3e2', 1, false); wash(c, p, '#d8c3a2', { al: .35, seed: 340, smooth: false }); ink(c, p, { close: true, smooth: false, w: lw, seed: 341 });
    [38, 52, 66].forEach((y, i) => pencil(c, [[33, y], [66 - i * 6, y - 2]], { w: lw * .6, alpha: .8, seed: 342 + i })); const lf = blob(72, 18, 12, 6, 345, .06, 9, -.6); gouache(c, lf, '#8fb768'); ink(c, lf, { close: true, w: lw * .8, seed: 346 }); },
  seed(c, lw) { const m = [[12, 84], [28, 72], [50, 68], [72, 72], [88, 84]]; gouache(c, m.concat([[88, 92], [12, 92]]), '#c7a07a'); ink(c, m, { w: lw, seed: 350 }); ink(c, [[50, 70], [49, 52], [50, 38]], { w: lw, color: '#4f7a35', seed: 351 });
    [[37, 38, -.5], [63, 32, .5]].forEach(([x, y, r], i) => { const l = blob(x, y, 13, 6.5, 352 + i, .06, 9, r); gouache(c, l, '#8fb768'); ink(c, l, { close: true, w: lw * .9, seed: 354 + i }); }); },
  sun(c, lw) { const d = blob(50, 50, 20, 20, 360, .04, 10); gouache(c, d, '#f8d478'); wash(c, d, '#e0a33a', { al: .4, seed: 361 }); ink(c, d, { close: true, w: lw, seed: 362 }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + .2; ink(c, [[50 + Math.cos(a) * 29, 50 + Math.sin(a) * 29], [50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40]], { w: lw, seed: 363 + i, p: FLAT }); } },
  sprout(c, lw) { ink(c, [[50, 88], [50, 60], [50, 46]], { w: lw, color: '#4f7a35', seed: 370 }); [[33, 42, -.55], [67, 42, .55]].forEach(([x, y, r], i) => { const l = blob(x, y, 18, 9, 371 + i, .06, 10, r); gouache(c, l, '#9cc073'); wash(c, l, '#4f7a35', { al: .35, seed: 373 + i }); ink(c, l, { close: true, w: lw, seed: 375 + i }); }); },
  farm(c, lw, col) { ink(c, [[14, 46], [50, 16], [86, 46]], { w: lw, color: col, seed: 380 }); ink(c, [[24, 40], [24, 86], [76, 86], [76, 40]], { w: lw, color: col, seed: 381 }); ink(c, [[42, 86], [42, 62], [50, 56], [58, 62], [58, 86]], { w: lw * .9, color: col, seed: 382 }); },
  chat(c, lw, col) { const p = [[50, 16], [80, 24], [90, 46], [80, 66], [56, 72], [34, 86], [38, 70], [20, 62], [10, 44], [20, 24]]; ink(c, p, { close: true, w: lw, color: col, seed: 390 }); [36, 50, 64].forEach((x, i) => { c.fillStyle = col; c.beginPath(); c.arc(x, 45, lw * 1.1, 0, TAU); c.fill(); }); },
  seeds(c, lw, col) { ink(c, [[50, 90], [50, 62], [50, 48]], { w: lw, color: col, seed: 400 }); ink(c, blob(33, 44, 17, 8, 401, .05, 10, -.55), { close: true, w: lw, color: col, seed: 402 }); ink(c, blob(67, 38, 17, 8, 403, .05, 10, .55), { close: true, w: lw, color: col, seed: 404 }); ink(c, [[24, 90], [76, 90]], { w: lw, color: col, seed: 405, p: FLAT }); },
  camera(c, lw, col) { ink(c, [[12, 32], [34, 32], [40, 22], [60, 22], [66, 32], [88, 32], [88, 80], [12, 80]], { close: true, smooth: false, w: lw, color: col, seed: 410 }); ink(c, blob(50, 55, 15, 15, 411, .03, 10), { close: true, w: lw, color: col, seed: 412 }); },
  mic(c, lw, col) { ink(c, [[40, 18], [60, 18], [60, 54], [40, 54]], { close: true, w: lw, color: col, seed: 420 }); ink(c, [[26, 46], [30, 66], [50, 72], [70, 66], [74, 46]], { w: lw, color: col, seed: 421 }); ink(c, [[50, 72], [50, 88]], { w: lw, color: col, seed: 422 }); },
  pencil(c, lw, col) { ink(c, [[24, 82], [28, 66], [70, 22], [80, 32], [38, 76]], { close: true, smooth: false, w: lw, color: col, seed: 430 }); ink(c, [[62, 30], [72, 40]], { w: lw * .8, color: col, seed: 431 }); },
  plus(c, lw, col) { ink(c, [[50, 22], [50, 78]], { w: lw * 1.2, color: col, seed: 440, p: FLAT }); ink(c, [[22, 50], [78, 50]], { w: lw * 1.2, color: col, seed: 441, p: FLAT }); },
  lantern(c, lw) { glow(c, 50, 60, 44, '#ffd66e', .6, 'source-over'); ink(c, [[50, 12], [50, 28]], { w: lw, seed: 450 }); const b = [[34, 30], [66, 30], [62, 78], [38, 78]]; gouache(c, b, '#ffe39a', 1, false); ink(c, b, { close: true, smooth: false, w: lw, seed: 451 }); },
  photo(c, lw) { const p = [[18, 24], [82, 20], [86, 78], [20, 82]]; gouache(c, p, '#fbf3e2', 1, false); ink(c, p, { close: true, smooth: false, w: lw, seed: 460 }); const s = [[26, 70], [42, 48], [54, 62], [64, 52], [78, 70]]; gouache(c, s.concat([[78, 74], [26, 74]]), '#a9c27c', 1, false); ink(c, s, { w: lw * .8, seed: 461 }); c.fillStyle = '#f2c25a'; c.beginPath(); c.arc(66, 36, 6, 0, TAU); c.fill(); }
};

/* ---------- turn 2 scenes ---------- */
function rainfall(c, w, h, t, seed, n = 60) {
  c.save(); c.strokeStyle = 'rgba(80,110,140,.45)'; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < n; i++) { const x = (hash(i, seed) * (w + 40) + t * 14) % (w + 40) - 20, y = ((hash(i, seed + 1) + t * (.7 + hash(i, seed + 2) * .3)) % 1) * h; c.moveTo(x, y); c.lineTo(x - 2.5, y + 9); }
  c.stroke(); c.restore();
}
function rainbow(c, w, h) { const cols = ['#e88b7a', '#f0c26a', '#a9c27c', '#8fb3cf', '#b59fd0']; c.save(); c.globalCompositeOperation = 'multiply'; cols.forEach((col, i) => { c.globalAlpha = .34; c.strokeStyle = col; c.lineWidth = w * .022; c.beginPath(); c.arc(w * .56, h * .42, w * .5 - i * w * .021, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); }); c.restore(); }
function petals(c, w, h, t, n, seed, cols) { for (let i = 0; i < n; i++) { const ph = (t * .07 + hash(i, seed)) % 1, x = w * hash(i, seed + 1) + Math.sin(t * .8 + i) * 18, y = -10 + ph * (h + 20); c.save(); c.globalAlpha = .85 * Math.sin(ph * Math.PI); c.translate(x, y); c.rotate(t * .9 + i); c.fillStyle = cols[i % cols.length]; c.beginPath(); c.ellipse(0, 0, 3.6, 2.1, 0, 0, TAU); c.fill(); c.restore(); } }
function snowfall(c, w, h, t, seed, n = 40) { c.save(); c.fillStyle = '#ffffff'; for (let i = 0; i < n; i++) { const ph = (t * .05 + hash(i, seed)) % 1, x = w * hash(i, seed + 1) + Math.sin(t * .6 + i * 2) * 10, y = ph * h; c.globalAlpha = .9; c.beginPath(); c.arc(x, y, 1 + hash(i, seed + 2) * 1.6, 0, TAU); c.fill(); } c.restore(); }
function raincloud(c, x, y, s, seed, dpr) {
  const sp = sprite('rcloud' + seed + ':' + Math.round(s), s * 1.6, s * .9, s * .8, s * .5, dpr, g => { const bl = [[-.32, .04, .3, .2], [-.02, -.12, .34, .28], [.3, .04, .28, .2], [0, .1, .52, .16]].map((b, i) => blob(b[0] * s, b[1] * s, b[2] * s, b[3] * s, seed + i, .06, 10));
    bl.forEach((b, i) => ink(g, b, { close: true, w: 2.6, seed: seed + 20 + i, alpha: .85 })); bl.forEach(b => gouache(g, b, '#b9bec8')); bl.forEach((b, i) => wash(g, b, '#5d6475', { al: .3, seed: seed + 10 + i, off: 2 })); });
  c.drawImage(sp.cv, x - sp.ox, y - sp.oy, sp.W, sp.H);
}
S.crowd = { anim: true,
  bg(c, w, h, o) { return S.strip.bg(c, w, h, o); },
  fg(c, w, h, t, o) { const m = o.meta, cast = o.cast, n = cast.length;
    cloud(c, ((w * .35 + t * 3) % (w + 160)) - 80, h * .3, h * .3, 22, o.dpr);
    smoke(c, m.homes.hedgehog.chim[0], m.homes.hedgehog.chim[1], h * .05, t, 42);
    [1, 0].forEach(row => cast.forEach((v, i) => { if (i % 2 !== row) return; const x = w * (.06 + .88 * i / Math.max(1, n - 1)), back = i % 2, y = h * (back ? .8 : .94), s = h * (back ? .21 : .26) * (v.kind === 'hedgehog' || v.kind === 'frog' ? .92 : 1);
      critter(c, v.kind, x, y, s, { t, dir: i % 3 ? -1 : 1, sleep: v.sleep, dpr: o.dpr, ph: i * .31, v }); if (v.sleep) zzz(c, x + s * .25, y - s * .8, s * .3, t + i); }));
  } };
S.bouquet = { anim: true,
  bg(c, w, h, o) { const m = Math.min(w, h);
    local(c, w / 2, h * .97, m / 100, () => {
      const heads = [[-24, -66, '#f0b3b6', 6], [2, -80, '#f6cf6a', 7], [25, -68, '#c7b6e0', 6], [-12, -54, '#fbf3e2', 5], [14, -54, '#f39b7b', 5], [-34, -46, '#9cc0d6', 4.5], [34, -46, '#f6cf6a', 4.5]];
      heads.forEach(([x, y], i) => ink(c, [[x * .1, -24], [x * .55, (y - 24) / 2 - 4], [x, y]], { w: 1.1, color: '#4f7a35', seed: 1100 + i }));
      [[-20, -40, -.8], [20, -38, .8], [-4, -66, -.3], [32, -60, .6]].forEach(([x, y, r], i) => { const l = blob(x, y, 9, 3.6, 1110 + i, .08, 9, r); gouache(c, l, '#8fb768'); wash(c, l, '#4f7a35', { al: .35, seed: 1115 + i }); ink(c, l, { close: true, w: .9, seed: 1120 + i }); });
      heads.forEach(([x, y, col, r], i) => { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + i, p = blob(x + Math.cos(a) * r * .9, y + Math.sin(a) * r * .9, r * .75, r * .5, 1130 + i * 9 + k, .1, 8, a); gouache(c, p, col); wash(c, p, shade(col, .25), { al: .3, seed: 1200 + i * 9 + k, gran: .06, off: .5 }); ink(c, p, { close: true, w: .75, seed: 1300 + i * 9 + k, alpha: .85 }); } const cc = blob(x, y, r * .4, r * .4, 1400 + i, .1, 7); gouache(c, cc, '#b0643a'); ink(c, cc, { close: true, w: .7, seed: 1410 + i }); });
      const cone = [[-30, -34], [-12, -38], [12, -38], [30, -34], [6, -2], [-6, -2]]; gouache(c, cone, '#efe2c8'); wash(c, cone, '#c9a77a', { al: .45, seed: 1420 }); pencil(c, [[-16, -34], [-2, -6]], { w: .8, alpha: .5, seed: 1421, passes: 1 }); pencil(c, [[14, -35], [3, -6]], { w: .8, alpha: .5, seed: 1422, passes: 1 }); ink(c, cone, { close: true, w: 1.3, seed: 1423 });
      ink(c, [[-11, -18], [0, -15], [11, -18]], { w: 2.6, color: '#d4704e', seed: 1424, p: FLAT }); [[[-1, -16], [-10, -6], [-6, -4]], [[1, -16], [8, -4], [12, -6]]].forEach((p, i) => ink(c, p, { w: 1.6, color: '#d4704e', seed: 1425 + i }));
    });
    return {}; },
  fg(c, w, h, t) { glints(c, [[w * .16, h * .3], [w * .84, h * .25], [w * .78, h * .6], [w * .12, h * .62]], t, 21); } };
S.welcome = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, '#f6e7d2', 1501);
    wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .38]], '#f3c9ad', { al: .45, seed: 1502, smooth: false, off: 8, gran: .05, edge: .1 });
    sun(c, w * .8, h * .2, w * .09);
    const Y = hill(c, w, h, h * .46, h * .02, .01, 1503, P.far, { washC: P.farW, alpha: .4 });
    const hm = house(c, w * .5, Y(w * .5) + 5, w * .3, { roof: ROOF.rabbit, seed: 1504 });
    hill(c, w, h, h * .6, h * .014, .008, 1505, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    tufts(c, 0, w, h * .62, h, 50, 1506, P.shade); flowers(c, 0, w, h * .66, h, 16, 1507, P.flower);
    return { hm }; },
  fg(c, w, h, t, o) { const D = o.dpr, ph = (t % 8) / 8, awake = ph > .3, e = clamp((ph - .3) / .06, 0, 1), hop = awake && ph < .42 ? Math.sin((ph - .3) / .12 * Math.PI) * h * .025 : 0, y0 = h * .88, lean = .05 + .11 * e;
    smoke(c, o.meta.hm.chim[0], o.meta.hm.chim[1], w * .05, t, 1508);
    critter(c, 'sheep', w * .19, y0 - h * .05, w * .25, { t, rot: lean, dpr: D, ph: .2 });
    critter(c, 'hedgehog', w * .83, y0 - h * .04, w * .22, { t, dir: -1, rot: -lean, dpr: D, ph: .5 });
    critter(c, 'frog', w * .3, y0 + h * .02, w * .2, { t, rot: lean * .7, dpr: D, ph: .7 });
    critter(c, 'owl', w * .7, y0 + h * .02, w * .19, { t, rot: -lean * .7, dpr: D, ph: .9 });
    critter(c, 'rabbit', w * .5, y0 + h * .03 - hop, w * .27, { t, sleep: !awake, dpr: D, ph: .1, v: o.v });
    if (!awake) zzz(c, w * .58, y0 - w * .3, w * .07, t);
    petals(c, w, h, t, 18, 1509, ['#f0b3b6', '#f6cf6a', '#fbf3e2']);
  } };
const VALLEY = [{ x: .27, y: .25, roofs: ['#c96f4f', '#d6a24a', '#6f9a5a'], fruit: '#e8803a', on: 1 }, { x: .73, y: .37, roofs: ['#5f8a8b', '#b85a4a'], fruit: '#7b4a86', on: 0 }, { x: .36, y: .54, roofs: ['#8a6f98', '#6f8faa', '#c96f4f'], fruit: '#d9483b', on: 1 }, { x: .74, y: .7, roofs: ['#9b7454', '#c99a3e'], fruit: '#f2d24a', on: 0 }, { x: .28, y: .84, roofs: ['#9b5f7a', '#6f9a5a', '#d6a24a'], fruit: '#6c4a6e', on: 1 }];
S.valley = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season], chims = []; paper(c, w, h, P.mid, 1601);
    wash(c, [[-10, -10], [w + 10, -10], [w + 10, h + 10], [-10, h + 10]], P.midW, { al: .22, seed: 1602, smooth: false, gran: .12, edge: 0 });
    tufts(c, 0, w, 0, h, 90, 1690, P.shade); flowers(c, 0, w, 0, h, 22, 1691, P.flower);
    pathRibbon(c, [[w * .56, -20], [w * .6, h * .14], [w * .52, h * .3], [w * .58, h * .46], [w * .54, h * .62], [w * .5, h * .78], [w * .58, h + 20]], w * .05, w * .1, { path: '#bcd7d8' }, 1603);
    VALLEY.forEach((f, i) => { const x = f.x * w, y = f.y * h, g = blob(x, y, w * .2, h * .06, 1610 + i, .07, 12);
      gouache(c, g, P.near); wash(c, g, P.nearW, { al: .4, seed: 1620 + i }); ink(c, g, { close: true, w: 1.2, seed: 1630 + i, alpha: .8 });
      tree(c, x + w * .13, y + h * .015, w * .2, Object.assign({}, P, { blossom: f.fruit, fruitR: 3 }), 1640 + i);
      f.roofs.forEach((r, j) => { const hm = house(c, x - w * .11 + j * w * .075, y + h * .012 - (j % 2) * h * .01, w * .075, { roof: r, seed: 1650 + i * 5 + j }); if (f.on && j === 0) chims.push(hm.chim); }); });
    return { chims }; },
  fg(c, w, h, t, o) { o.meta.chims.forEach((p, i) => smoke(c, p[0], p[1], w * .03, t + i, 1692 + i)); cloud(c, ((w * .3 + t * 3) % (w + 160)) - 80, h * .08, w * .22, 24, o.dpr); cloud(c, ((w * .8 + t * 2) % (w + 160)) - 80, h * .46, w * .16, 34, o.dpr); } };
S.claim = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, P.sky, 1701); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .25], [-10, h * .32]], P.sky2, { al: .5, seed: 1709, smooth: false, off: 6, gran: .06, edge: .12 }); sun(c, w * .84, h * .18, w * .06);
    const Y = hill(c, w, h, h * .5, h * .03, .01, 1702, P.mid, { washC: P.midW, alpha: .4 });
    [['hedgehog', .13, .15], ['frog', .35, .13], ['sheep', .88, .14]].forEach(([k, x, s], i) => house(c, w * x, Y(w * x) + 5, w * s, { roof: ROOF[k], seed: 1703 + i }));
    const sx = w * .63, sy = Y(sx) + 5; house(c, sx, sy, w * .18, { sketch: true, seed: 1710 });
    hill(c, w, h, h * .68, h * .016, .008, 1711, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    pathRibbon(c, [[w * .55, h + 10], [w * .6, h * .82], [sx, sy + 3]], w * .14, w * .03, P, 1712);
    tufts(c, 0, w, h * .7, h, 40, 1714, P.shade); flowers(c, 0, w, h * .72, h, 12, 1715, P.flower);
    return { sk: [sx, sy - w * .08] }; },
  fg(c, w, h, t, o) { const [x, y] = o.meta.sk; glow(c, x, y, w * .2, '#ffd66e', .3 + .08 * Math.sin(t * 1.6), 'source-over'); glints(c, [[x - w * .12, y - w * .06], [x + w * .1, y - w * .1], [x + w * .12, y + w * .04]], t, 1713);
    critter(c, 'hedgehog', w * .2, h * .92, w * .17, { t, dpr: o.dpr, ph: .2 }); critter(c, 'rabbit', w * .4, h * .88, w * .16, { t, dpr: o.dpr, ph: .5 }); critter(c, 'sheep', w * .86, h * .92, w * .2, { t, dir: -1, dpr: o.dpr, ph: .8 }); } };
S.burrow = { anim: true,
  bg(c, w, h, o) { const P = SEASONS.winter; paper(c, w, h, '#e6ecef', 1801);
    const top = [], Y = x => h * .26 + noise1(x * .01, 1802) * h * .015; for (let x = -10; x <= w + 10; x += 6) top.push([x, Y(x)]);
    const soil = [...top, [w + 10, h + 10], [-10, h + 10]]; gouache(c, soil, '#b08b69', 1, false); wash(c, soil, '#6f4d33', { al: .5, seed: 1803, smooth: false, gran: .3, edge: .2, off: 3 });
    wash(c, [[-10, h * .6], [w + 10, h * .55], [w + 10, h + 10], [-10, h + 10]], '#4d3424', { al: .3, seed: 1804, smooth: false, gran: .2 });
    const r = rng(1805); for (let i = 0; i < 14; i++) { const st = blob(r() * w, h * .32 + r() * h * .65, 3 + r() * 5, 2 + r() * 3, 1806 + i, .15, 7); gouache(c, st, '#c9bfb4'); ink(c, st, { close: true, w: .8, seed: 1830 + i, alpha: .7 }); }
    const snow = [...top.map(([x, y]) => [x, y - 6 - hash(x | 0, 1850) * 2]), ...top.slice().reverse().map(([x, y]) => [x, y + 3])]; gouache(c, snow, '#fbfcfc', 1, false); ink(c, top.map(([x, y]) => [x, y - 6]), { w: 1.3, seed: 1851, smooth: false, p: FLAT, alpha: .7 });
    tree(c, w * .18, Y(w * .18) - 4, h * .45, P, 1852);
    [[[w * .16, h * .27], [w * .12, h * .36], [w * .05, h * .42]], [[w * .2, h * .27], [w * .26, h * .38], [w * .24, h * .48]], [[w * .18, h * .28], [w * .17, h * .34]]].forEach((p, i) => ink(c, p, { w: 2.2 - i * .4, color: '#5b3d28', seed: 1860 + i }));
    pathRibbon(c, [[w * .64, h * .25], [w * .67, h * .36], [w * .58, h * .46], [w * .5, h * .56]], w * .06, w * .09, { path: '#7a5a40' }, 1870);
    const ch = blob(w * .5, h * .68, w * .3, h * .15, 1871, .05, 14); gouache(c, ch, '#8a6a4f'); wash(c, ch, '#3d2a1d', { al: .35, seed: 1872 }); ink(c, ch, { close: true, w: 1.5, seed: 1873 });
    gouache(c, blob(w * .5, h * .79, w * .22, h * .035, 1874, .1, 12), '#e2c375'); for (let i = 0; i < 14; i++) { const x = w * .3 + i * w * .029; pencil(c, [[x, h * .795], [x + 6, h * .785]], { w: .9, color: '#a8822e', alpha: .9, seed: 1875 + i, passes: 1 }); }
    return {}; },
  fg(c, w, h, t, o) { glow(c, w * .5, h * .7, w * .34, '#ffcf80', .28, 'source-over'); critter(c, o.kind || 'rabbit', w * .5, h * .8, Math.min(w * .3, h * .28), { t, sleep: true, dpr: o.dpr, v: o.v, shadow: false }); zzz(c, w * .58, h * .56, h * .07, t); snowfall(c, w, h * .25, t, 1890, 26); } };
S.slowpost = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, '#e6d8c2', 1901);
    const Y1 = hill(c, w, h, h * .42, h * .03, .012, 1902, P.far, { washC: P.farW, alpha: .4 });
    const hm = house(c, w * .82, Y1(w * .82) + 4, w * .12, { roof: ROOF.sheep, seed: 1903, lit: true });
    hill(c, w, h, h * .55, h * .02, .009, 1904, P.mid, { washC: P.midW, alpha: .45 });
    const path = [[w * .05, h + 10], [w * .3, h * .84], [w * .62, h * .72], [w * .46, h * .6], [w * .7, h * .5], [w * .8, Y1(w * .8) + 4]];
    pathRibbon(c, path, w * .16, w * .02, P, 1905); tufts(c, 0, w, h * .55, h, 60, 1906, P.shade);
    return { hm, pts: crPts(path, false, 3) }; },
  fg(c, w, h, t, o) { const pts = o.meta.pts, n = pts.length, u = .14 + ((t * .02) % 1) * .58, i = Math.floor(u * (n - 1)), p = pts[i], s = Math.round(w * (.2 - u * .14) / 4) * 4, bob = Math.abs(Math.sin(t * 6)) * s * .04;
    c.save(); c.fillStyle = 'rgba(90,70,50,.35)'; for (let k = 1; k < 7; k++) { const j = i - k * 4; if (j <= 0) break; const q = pts[j]; c.beginPath(); c.ellipse(q[0] + (k % 2 ? 3 : -3), q[1], 1.6, 1, 0, 0, TAU); c.fill(); } c.restore();
    critter(c, o.kind || 'rabbit', p[0], p[1] - bob, s, { t, dpr: o.dpr, v: { outfit: 'satchel' } });
    const lx = p[0] + s * .42, ly = p[1] - s * .42 - bob;
    night(o.el, c, w, h, [{ x: lx, y: ly, r: w * .22, k: .9, color: '#ffc768', a: .3 }, { x: o.meta.hm.win[0], y: o.meta.hm.win[1], r: w * .12, k: .8, color: '#ffc768', a: .25 }], .82);
    litWindow(c, o.meta.hm); lantern(c, lx, ly, s * .16, t); glow(c, lx, ly, s * .35, '#ffd170', .7);
    stars(c, 0, h * .02, w, h * .35, 40, t, 1907); moon(c, w * .2, h * .12, w * .05); fireflies(c, 5, 0, h * .5, w, h * .9, t, 1908); } };
S.window = { anim: true,
  bg(c, w, h, o) { paper(c, w, h, '#efe2c9', 2001); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h + 10], [-10, h + 10]], '#cdb48f', { al: .35, seed: 2002, smooth: false, off: 4 });
    for (let i = 0; i < 9; i++) pencil(c, [[-10, h * (.08 + i * .11)], [w + 10, h * (.08 + i * .11) + 3]], { w: .8, alpha: .22, seed: 2003 + i, passes: 1 });
    return { cx: w * .5, cy: h * .45, r: Math.min(w, h) * .33 }; },
  fg(c, w, h, t, o) { const { cx, cy, r } = o.meta, k = o.kind || 'hedgehog', P = new Path2D(); P.ellipse(cx, cy, r, r * 1.08, 0, 0, TAU);
    const cyc = t % 3.2, wob = Math.sin(cyc * 22) * Math.exp(-cyc * 2.6) * .14, peek = cyc > .25 && cyc < 1.3;
    c.save(); c.clip(P); c.fillStyle = '#5a4f66'; c.fillRect(cx - r, cy - r * 1.1, r * 2, r * 2.2); glow(c, cx, cy + r * .3, r * 1.2, '#ffcf80', .55, 'source-over');
    critter(c, k, cx, cy + r * .95, r * 1.25, { t, sleep: !peek, rot: wob, dpr: o.dpr, shadow: false, v: o.v });
    const quilt = blob(cx, cy + r * 1.05, r * 1.1, r * .22, 2010, .05, 12); gouache(c, quilt, '#d4704e'); wash(c, quilt, '#9e4630', { al: .35, seed: 2011 });
    for (let i = 0; i < 5; i++) pencil(c, [[cx - r + i * r * .5, cy + r * .86], [cx - r + i * r * .5 + 4, cy + r * 1.2]], { w: .9, color: '#fbe9dc', alpha: .8, seed: 2012 + i, passes: 1 });
    c.restore();
    const fr = sprite('winframe' + Math.round(w) + 'x' + Math.round(h), w, h, 0, 0, o.dpr, g => {
      const outer = blob(cx, cy, r + 12, r * 1.08 + 12, 2020, .015, 16), ring = new Path2D(); ring.addPath(toPath(outer)); ring.ellipse(cx, cy, r, r * 1.08, 0, 0, TAU);
      g.fillStyle = '#8a6446'; g.fill(ring, 'evenodd');
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; pencil(g, [[cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.08], [cx + Math.cos(a) * (r + 12), cy + Math.sin(a) * (r * 1.08 + 12)]], { w: .9, color: '#4d3424', alpha: .6, seed: 2030 + i, passes: 1 }); }
      ink(g, outer, { close: true, w: 2, seed: 2022 }); ink(g, blob(cx, cy, r, r * 1.08, 2023, .005, 16), { close: true, w: 1.6, seed: 2024 });
      const sy = cy + r * 1.08, sill = [[cx - r * 1.15, sy + 6], [cx + r * 1.15, sy + 6], [cx + r * 1.1, sy + 18], [cx - r * 1.1, sy + 18]]; gouache(g, sill, '#a37c59', 1, false); ink(g, sill, { close: true, smooth: false, w: 1.4, seed: 2025 });
      [[-.7, '#f0b3b6'], [-.35, '#f6cf6a'], [.4, '#fbf3e2'], [.75, '#f0b3b6']].forEach(([u, col], i) => { const fx = cx + u * r, fy = sy + 4; ink(g, [[fx, fy + 2], [fx, fy - 8]], { w: 1, color: '#4f7a35', seed: 2040 + i }); g.fillStyle = col; g.beginPath(); g.arc(fx, fy - 10, 3.4, 0, TAU); g.fill(); g.fillStyle = '#e8b44e'; g.beginPath(); g.arc(fx, fy - 10, 1.2, 0, TAU); g.fill(); });
      pencil(g, [[cx - r * .6, cy - r * .3], [cx - r * .3, cy - r * .75]], { w: 2, color: '#ffffff', alpha: .5, seed: 2050, passes: 1 }); pencil(g, [[cx - r * .45, cy - r * .1], [cx - r * .12, cy - r * .62]], { w: 1.2, color: '#ffffff', alpha: .4, seed: 2051, passes: 1 });
    });
    c.drawImage(fr.cv, 0, 0, w, h);
    night(o.el, c, w, h, [{ x: cx, y: cy, r: r * 1.9, k: 1, color: '#ffc768', a: .18 }], .7);
    if (cyc < 1.4) for (let j = 0; j < 3; j++) { const p = cyc - j * .16; if (p < 0) continue; c.save(); c.globalAlpha = Math.max(0, 1 - p / 1.1) * .9; c.strokeStyle = '#fff6dc'; c.lineWidth = 1.6; c.beginPath(); c.arc(cx + r * .5, cy - r * .45, 5 + p * r * .5, 0, TAU); c.stroke(); c.restore(); }
  } };
S.weather = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, '#e7e4de', 2101); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .35], [-10, h * .42]], '#c9ced8', { al: .4, seed: 2109, smooth: false, off: 6, gran: .06, edge: .1 });
    hill(c, w, h, h * .64, h * .015, .01, 2102, mix(P.near, '#9aa3ad', .35), { washC: mix(P.nearW, '#5d6475', .3), line: 'ink', alpha: .6 });
    const pd = blob(w * .5, h * .885, w * .22, h * .025, 2103, .08, 12); gouache(c, pd, '#c3cfd6'); wash(c, pd, '#6f8796', { al: .4, seed: 2104 }); ink(c, pd, { close: true, w: 1, seed: 2105, alpha: .7 });
    tufts(c, 0, w, h * .66, h, 40, 2106, '#6a7a6a'); return {}; },
  fg(c, w, h, t, o) { const cx = w * .5, gy = h * .87, cyy = h * .36;
    critter(c, 'rabbit', w * .14, h * .93, w * .19, { t, dpr: o.dpr, ph: .6 }); critter(c, 'sheep', w * .86, h * .93, w * .22, { t, dir: -1, dpr: o.dpr, ph: .1 });
    critter(c, 'frog', cx, gy, w * .3, { t, dpr: o.dpr, v: o.v, ph: .3 });
    c.save(); c.strokeStyle = 'rgba(80,110,150,.6)'; c.lineWidth = 1.2; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < 22; i++) { const x = cx - w * .18 + hash(i, 2107) * w * .36, ph = (t * 1.1 + hash(i, 2108)) % 1, y = cyy + w * .08 + ph * (gy - cyy - w * .2); c.moveTo(x, y); c.lineTo(x - 1.5, y + 8); } c.stroke(); c.restore();
    raincloud(c, cx, cyy, w * .42, 2110, o.dpr); glow(c, cx, cyy + w * .05, w * .3, '#ffcf70', .14 + .06 * Math.sin(t));
    [['lantern', -1, 0], ['sun', 1, .33], ['lantern', 1, .66], ['sun', -1, .5]].forEach(([name, side, off], i) => { const ph = (t * .12 + off) % 1, x = lerp(cx + side * w * .5, cx + side * w * .14, ph), y = lerp(h * (.7 - i * .04), cyy + w * .02, ph) - Math.sin(ph * Math.PI) * h * .08, sz = w * .11 * (1 - ph * .3), a = Math.min(1, Math.sin(ph * Math.PI) * 2);
      glow(c, x, y, sz, '#ffcf70', .3 * a); c.save(); c.globalAlpha = a; local(c, x - sz / 2, y - sz / 2, sz / 100, () => ICONS[name](c, 1.6, INK)); c.restore(); });
  } };
S.bloom = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, '#f6ead6', 2201); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .36]], '#f3d2b5', { al: .45, seed: 2209, smooth: false, off: 6, gran: .06, edge: .1 });
    const Y = hill(c, w, h, h * .55, h * .02, .01, 2202, P.mid, { washC: P.midW, alpha: .4 });
    const hm = house(c, w * .26, Y(w * .26) + 5, w * .26, { roof: ROOF.sheep, seed: 2203 });
    hill(c, w, h, h * .7, h * .014, .008, 2204, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    const sx = w * .7; ink(c, [[sx, h * .82], [sx + w * .03, h * .62], [sx - w * .02, h * .46], [sx, h * .3]], { w: 4.5, color: '#4f7a35', seed: 2205, p: FLAT });
    [[sx - w * .06, h * .6, -.6], [sx + w * .07, h * .52, .6]].forEach(([x, y, r], i) => { const l = blob(x, y, w * .07, w * .028, 2206 + i, .06, 10, r); gouache(c, l, '#8fb768'); wash(c, l, '#4f7a35', { al: .4, seed: 2208 + i }); ink(c, l, { close: true, w: 1.2, seed: 2210 + i }); });
    tufts(c, 0, w, h * .72, h, 40, 2213, P.shade); flowers(c, 0, w, h * .74, h, 14, 2214, P.flower);
    return { top: [sx, h * .3], hm }; },
  fg(c, w, h, t, o) { const [fx, fy] = o.meta.top, R = Math.round(w * .17), cyc = t % 12, open = 1 - Math.pow(1 - clamp(cyc / 3, 0, 1), 3);
    smoke(c, o.meta.hm.chim[0], o.meta.hm.chim[1], w * .04, t, 2215);
    const sp = sprite('bloomhead' + R, R * 2.6, R * 2.6, R * 1.3, R * 1.3, o.dpr, g => { for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, p = blob(Math.cos(a) * R * .62, Math.sin(a) * R * .62, R * .5, R * .3, 2220 + k, .08, 10, a); gouache(g, p, '#f3b4b8'); wash(g, p, '#d0606e', { al: .35, seed: 2230 + k, off: 1.5 }); ink(g, p, { close: true, w: 1.3, seed: 2240 + k }); } const cc = blob(0, 0, R * .3, R * .3, 2250, .06, 10); gouache(g, cc, '#f2c25a'); wash(g, cc, '#c78a2c', { al: .45, seed: 2251 }); ink(g, cc, { close: true, w: 1.2, seed: 2252 }); });
    c.save(); c.translate(fx, fy); c.rotate(Math.sin(t * .6) * .04 + open * .3); const sc = .25 + open * .75; c.scale(sc, sc); c.drawImage(sp.cv, -sp.ox, -sp.oy, sp.W, sp.H); c.restore();
    if (open > .9) glints(c, [[fx - R, fy - R * .9], [fx + R * 1.1, fy - R * .4], [fx + R * .2, fy - R * 1.3]], t, 2253);
    const D = o.dpr; critter(c, 'sheep', w * .44, h * .88, w * .24, { t, dpr: D, v: { outfit: 'party', oc: '#e8b44e' }, ph: .2 }); critter(c, 'rabbit', w * .16, h * .92, w * .2, { t, dpr: D, v: { outfit: 'party', oc: '#6f8faa' }, ph: .5 }); critter(c, 'hedgehog', w * .85, h * .92, w * .19, { t, dir: -1, dpr: D, v: { outfit: 'party', oc: '#c96f4f' }, ph: .8 });
    petals(c, w, h, t, 22, 2254, ['#f3b4b8', '#f6cf6a', '#a9c7de', '#fbf3e2']); } };
S.harvest = { anim: false,
  bg(c, w, h, o) { const m = Math.min(w * 1.1, h); local(c, w / 2, h * .92, m / 100, () => {
    [[-14, -38, -22, -60], [-10, -38, -12, -64], [-6, -38, -2, -58]].forEach(([x0, y0, x1, y1], i) => ink(c, [[x0, y0], [(x0 + x1) / 2 - 2, (y0 + y1) / 2], [x1, y1]], { w: 1.4, color: '#5d8a3c', seed: 2300 + i }));
    [[-26, -42, 13, 11, '#e0873e', 'pumpkin'], [-4, -48, 10, 10, '#d9483b', 'apple'], [16, -44, 10, 10, '#e9b949', 'apple'], [31, -38, 9, 9, '#7b4a86', 'apple'], [6, -35, 12, 8, '#9cc073', 'cab']].forEach(([x, y, rx, ry, col, kind], i) => { const b = blob(x, y, rx, ry, 2301 + i, .06, 10); gouache(c, b, col); wash(c, b, shade(col, .3), { al: .4, seed: 2310 + i }); ink(c, b, { close: true, w: 1.1, seed: 2320 + i });
      if (kind === 'pumpkin') { ink(c, [[x - 4, y - ry + 2], [x - 5, y + ry - 2]], { w: .8, seed: 2330, alpha: .6 }); ink(c, [[x + 4, y - ry + 2], [x + 5, y + ry - 2]], { w: .8, seed: 2331, alpha: .6 }); ink(c, [[x, y - ry], [x + 2, y - ry - 5]], { w: 1.6, color: '#4f7a35', seed: 2332 }); }
      else if (kind === 'apple') { ink(c, [[x, y - ry + 1], [x + 1, y - ry - 4]], { w: 1, color: '#5b412e', seed: 2333 + i }); gouache(c, blob(x + 4, y - ry - 3, 3.6, 1.6, 2340 + i, .1, 7, -.5), '#8fb768'); }
      else for (let k = -1; k <= 1; k++) pencil(c, [[x, y + 4], [x + k * 8, y - 4]], { w: .8, color: '#4f7a35', alpha: .7, seed: 2345 + k, passes: 1 }); });
    const bk = [[-44, -30], [44, -30], [36, 0], [-36, 0]]; gouache(c, bk, '#d8b27a', 1, false); wash(c, bk, '#9a6a3a', { al: .45, seed: 2350, smooth: false });
    for (let r = 0; r < 4; r++) { const y = -26 + r * 7; pencil(c, [[-42 + r * 2, y], [42 - r * 2, y]], { w: 1, color: '#7a5230', alpha: .8, seed: 2351 + r, passes: 1 }); } for (let i = -5; i <= 5; i++) pencil(c, [[i * 8, -30], [i * 6.6, 0]], { w: .9, color: '#7a5230', alpha: .6, seed: 2360 + i, passes: 1 });
    ink(c, bk, { close: true, smooth: false, w: 1.5, seed: 2372 }); const rim = blob(0, -30, 46, 4, 2373, .04, 12); gouache(c, rim, '#c99a5e'); ink(c, rim, { close: true, w: 1.3, seed: 2374 });
    ink(c, [[-40, -30], [-30, -62], [0, -72], [30, -62], [40, -30]], { w: 3.2, color: '#9a6a3a', seed: 2375, p: FLAT }); pencil(c, [[-40, -30], [-30, -62], [0, -72], [30, -62], [40, -30]], { w: 1, alpha: .6, seed: 2376 });
  }); return {}; } };
function greenhouse(c, x, y, s, o = {}) { const k = s / 100, seed = o.seed || 1;
  local(c, x, y, k, () => {
    const body = [[-48, -14], [-48, -50], [-30, -68], [0, -76], [30, -68], [48, -50], [48, -14]], base = [[-52, 0], [-52, -14], [52, -14], [52, 0]], door = [[-9, 0], [-9, -32], [9, -32], [9, 0]];
    const roofY = xx => { const ax = Math.abs(xx); return ax < 30 ? -76 + ax / 30 * 8 : -68 + (ax - 30) / 18 * 18; };
    if (o.sketch) { const pc = '#8b7e72'; pencil(c, base, { close: true, smooth: false, w: 1, color: pc, alpha: .75, seed: seed + 1, passes: 2 }); pencil(c, body, { smooth: false, w: 1, color: pc, alpha: .75, seed: seed + 2, passes: 2 }); pencil(c, door, { smooth: false, w: .9, color: pc, alpha: .6, seed: seed + 3 }); [-32, -16, 16, 32].forEach((mx, i) => pencil(c, [[mx, -14], [mx, roofY(mx)]], { w: .8, color: pc, alpha: .4, seed: seed + 5 + i, passes: 1 })); return; }
    [[-34, -20, 10, 9], [-22, -24, 8, 12], [26, -22, 12, 10], [38, -20, 7, 8]].forEach(([px, py, rx, ry], i) => { const b = blob(px, py, rx, ry, seed + 10 + i, .1, 9); gouache(c, b, '#8fb768'); wash(c, b, '#4f7a35', { al: .4, seed: seed + 15 + i }); });
    c.fillStyle = '#e0613f'; [[-30, -24], [-24, -30], [28, -26], [22, -20]].forEach(([px, py]) => { c.beginPath(); c.arc(px, py, 2, 0, TAU); c.fill(); });
    gouache(c, body, o.lit ? '#ffe6a6' : '#d6e8e2', o.lit ? .75 : .55, false); wash(c, body, o.lit ? '#f0b54a' : '#7fb0a8', { al: .3, seed: seed + 20, smooth: false });
    [-32, -16, 16, 32].forEach((mx, i) => ink(c, [[mx, -14], [mx, roofY(mx)]], { w: 1, color: '#5b412e', seed: seed + 21 + i, smooth: false, p: FLAT }));
    ink(c, [[-48, -38], [48, -38]], { w: 1, color: '#5b412e', seed: seed + 26, p: FLAT, smooth: false });
    pencil(c, [[-44, -24], [-36, -34]], { w: 1.4, color: '#ffffff', alpha: .7, seed: seed + 40, passes: 1 }); pencil(c, [[20, -50], [28, -60]], { w: 1.4, color: '#ffffff', alpha: .7, seed: seed + 41, passes: 1 });
    ink(c, body, { w: 1.8, seed: seed + 27, smooth: false });
    gouache(c, base, '#c9a07a', 1, false); wash(c, base, '#7a5236', { al: .4, seed: seed + 28, smooth: false }); for (let i = -4; i <= 4; i++) pencil(c, [[i * 11, -14], [i * 11, 0]], { w: .7, alpha: .4, seed: seed + 50 + i, passes: 1 }); ink(c, base, { close: true, smooth: false, w: 1.5, seed: seed + 29 });
    gouache(c, door, o.lit ? '#ffd877' : '#bcd6cf', .9, false); ink(c, door, { close: true, smooth: false, w: 1.3, seed: seed + 30 });
    ink(c, [[0, -76], [0, -86]], { w: 1, seed: seed + 31, p: FLAT }); gouache(c, [[0, -86], [8, -83], [0, -80]], '#c96f4f', 1, false);
  });
}
S.barn = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season], p = clamp(+(o.progress || 0), 0, 1); paper(c, w, h, P.sky, 2401); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .25], [-10, h * .32]], P.sky2, { al: .5, seed: 2409, smooth: false, off: 6, gran: .06, edge: .12 }); if (!o.night) sun(c, w * .82, h * .16, w * .06);
    hill(c, w, h, h * .48, h * .02, .01, 2402, P.far, { washC: P.farW, alpha: .4 }); hill(c, w, h, h * .66, h * .014, .008, 2403, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    const gx = w * .5, gy = h * .8, gs = w * .66, top = gy - gs * .86;
    greenhouse(c, gx, gy, gs, { sketch: true, seed: 2404 });
    if (p > 0) { const cut = gy + 2 - (gy + 2 - top) * p; c.save(); c.beginPath(); c.rect(0, cut, w, h); c.clip(); greenhouse(c, gx, gy, gs, { seed: 2404, lit: o.night }); c.restore(); if (p < 1) pencil(c, [[gx - gs * .56, cut], [gx + gs * .56, cut]], { w: 1.2, color: '#c96f4f', alpha: .8, seed: 2405 }); }
    tufts(c, 0, w, h * .68, h, 50, 2406, P.shade); flowers(c, 0, w, h * .7, h, 14, 2407, P.flower);
    return { gx, gy, gs }; },
  fg(c, w, h, t, o) { const { gx, gy, gs } = o.meta; critter(c, 'hedgehog', w * .13, h * .95, w * .17, { t, dpr: o.dpr, ph: .2, sleep: o.night }); critter(c, 'frog', w * .87, h * .96, w * .15, { t, dir: -1, dpr: o.dpr, ph: .6, sleep: o.night });
    if (o.night) { night(o.el, c, w, h, [{ x: gx, y: gy - gs * .4, r: gs * .9, k: 1, color: '#ffc768', a: .3 }], .82); stars(c, 0, h * .02, w, h * .4, 30, t, 2408); moon(c, w * .18, h * .12, w * .045); fireflies(c, 7, 0, h * .55, w, h * .9, t, 2410); }
    else glints(c, [[gx - gs * .3, gy - gs * .5], [gx + gs * .25, gy - gs * .6]], t, 2411); } };
S.visitfarm = S.farm;
const EVC = [['sheep', .16, .78, .15, 1], ['rabbit', .3, .81, .13, 1], ['hedgehog', .525, .735, .1, -1], ['frog', .21, .925, .11, 1], ['mole', .675, .785, .12, -1]];
const EVS = { sheep: [-.15, -.025], rabbit: [-.085, .035], frog: [.09, .04], hedgehog: [.155, -.01], mole: [-.045, -.075], owl: [.05, -.08] };
const EVK = [[0, 0], [.1, .03], [.3, .3], [.45, .5], [.6, .74], [.85, .86], [1, .9]];
function evk(p) { for (let i = 1; i < EVK.length; i++) if (p <= EVK[i][0]) return lerp(EVK[i - 1][1], EVK[i][1], (p - EVK[i - 1][0]) / (EVK[i][0] - EVK[i - 1][0])); return .9; }
const sst = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
S.evening = { anim: true,
  bg(c, w, h, o) { const P = SEASONS.summer, m = { homes: {}, bulbs: [] };
    paper(c, w, h, '#f5eee2', 9501); panoSky(c, 0, w, h, false);
    wash(c, [[-10, h * .05], [w + 10, h * .02], [w + 10, h * .2], [-10, h * .26]], '#e39a86', { al: .2, seed: 9502, smooth: false, off: 10, gran: .08, edge: .08 });
    const Y1 = hill(c, w, h, h * .47, h * .022, 1.8 / h, 9503, P.far, { washC: P.farW, alpha: .35 }); m.Y1 = Y1;
    [['rabbit', .09], ['sheep', .25], ['hedgehog', .41], ['frog', .53], ['mole', .71]].forEach(([k, x], i) => m.homes[k] = house(c, w * x, Y1(w * x) + 3, h * (.085 + (i % 2) * .012), { roof: ROOF[k], seed: 9510 + i }));
    hill(c, w, h, h * .56, h * .018, 1.4 / h, 9504, P.mid, { washC: P.midW, alpha: .4 });
    tree(c, w * .965, h * .69, h * .5, P, 9520);
    const Y3 = hill(c, w, h, h * .655, h * .014, 1.1 / h, 9505, P.near, { washC: P.nearW, line: 'ink', alpha: .65 });
    const ox = w * .82, oy = Y3(w * .82) + h * .03, ot = house(c, ox, oy, h * .17, { roof: ROOF.owl, seed: 9530 }); m.homes.owl = ot; m.otis = { x: ox, y: oy, k: ot.k };
    const step = blob(ox, oy + 2 * ot.k, 17 * ot.k, 3 * ot.k, 9531, .06, 10); gouache(c, step, '#bdb5a8'); ink(c, step, { close: true, w: 1.1, seed: 9532 });
    pathRibbon(c, [[w * .5, h + 20], [w * .47, h * .93], [w * .55, h * .84], [w * .63, h * .75], [w * .72, h * .69]], h * .12, h * .03, P, 9540);
    fence(c, w * .005, w * .235, h * .7, 9545);
    pond(c, w * .085, h * .855, w * .07, h * .035, P, 9550);
    const fx = w * .58, fy = h * .885; m.fire = [fx, fy];
    [[fx - w * .115, fy - h * .004, w * .075], [fx + w * .12, fy, w * .07]].forEach(([x, y, l], i) => { const lg = [[x - l / 2, y], [x - l / 2 + 2, y - h * .02], [x + l / 2, y - h * .02], [x + l / 2 + 2, y]]; gouache(c, lg, '#8a6446', 1, false); wash(c, lg, '#4d3424', { al: .4, seed: 9560 + i, smooth: false }); ink(c, lg, { close: true, w: 1.4, seed: 9562 + i }); });
    firering(c, fx, fy, w * .042, 9565, true);
    [w * .43, w * .745].forEach((x, i) => post(c, x, h * .6, h * .87, 9570 + i)); strings(c, [w * .43, w * .745], h * .605, h * .045, w * .35, m, 9575);
    tufts(c, 0, w, h * .66, h, Math.round(w / 7), 9580, P.shade); flowers(c, 0, w, h * .72, h, 26, 9581, P.flower);
    return m; },
  fg(c, w, h, t, o) { const m = o.meta; if (!m.homes) return; const p = clamp(o.el.p ?? +(o.progress || 0), 0, 1), D = o.dpr, k = evk(p), O = m.otis, [fx, fy] = m.fire;
    if (p < .36) { const u = sst(p / .34), sx = w * .625, sy = h * lerp(.43, .53, u); c.save(); const cl = new Path2D(); cl.moveTo(-10, -10); cl.lineTo(w + 10, -10); for (let x = w + 10; x >= -10; x -= 12) cl.lineTo(x, m.Y1(x) + 2); cl.closePath(); c.clip(cl); sun(c, sx, sy, h * .052); c.restore(); }
    const bl = Math.sin(clamp((p - .05) / .45, 0, 1) * Math.PI) * .2; if (bl > .01) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(232,138,108,' + bl + ')'; c.fillRect(0, 0, w, h * .62); c.restore(); }
    const st = p < .44 ? 0 : p < .48 ? 1 : p < .52 ? 2 : 3, sw = h * .2, sdx = w * .445, sdy = h * .855;
    c.save(); c.translate(sdx - sw / 2, sdy - sw * .8); S.seed.bg(c, sw, sw, { stage: st }); c.restore();
    const nb = sst((p - .27) / .04); if (nb > 0) { const nx = O.x + 17 * O.k, ny = O.y + 1.5 * O.k - (1 - nb) * h * .06, nw = 26 * O.k, nh = 15 * O.k; c.save(); c.globalAlpha = nb; c.translate(nx, ny); c.rotate(-.08 + (1 - nb) * .4); c.fillStyle = 'rgba(60,40,20,.18)'; c.fillRect(-nw / 2 + 2, -nh + 2, nw, nh); const np = [[-nw / 2, -nh], [nw / 2, -nh], [nw / 2, 0], [-nw / 2, 0]]; gouache(c, np, '#fbf3e2', 1, false); ink(c, np, { close: true, smooth: false, w: 1, seed: 9590 }); c.fillStyle = INK; const vi = o.lang === 'vi'; c.font = '700 ' + Math.round(nh * (vi ? .3 : .34)) + (vi ? "px 'Patrick Hand', cursive" : 'px Gaegu, cursive'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(vi ? 'không cần' : 'no reply', 0, -nh * .66); c.fillText(vi ? 'trả lời' : 'needed', 0, -nh * .3); c.restore(); }
    const list = [];
    EVC.forEach(([K, x, y, s, dir], i) => { const u = sst((p - .63 - i * .02) / .09), sd = EVS[K], ax = w * x, ay = h * y, bx = fx + sd[0] * w, by = fy + sd[1] * h, mv = u > 0 && u < 1;
      list.push({ K, x: lerp(ax, bx, u), y: lerp(ay, by, u) - Math.sin(Math.PI * u) * h * .03 - (mv ? Math.abs(Math.sin(u * Math.PI * 7)) * h * .012 : 0), s: h * s, dir: mv ? (bx > ax ? 1 : -1) : (u >= 1 ? (sd[0] < 0 ? 1 : -1) : dir), ph: i * .37 }); });
    const og = sst((p - .73) / .07), oax = O.x - 21 * O.k, oay = O.y + 3 * O.k, obx = fx + EVS.owl[0] * w, oby = fy + EVS.owl[1] * h;
    list.push({ K: 'owl', x: lerp(oax, obx, og), y: lerp(oay, oby, og) - Math.sin(Math.PI * og) * h * .05, s: h * .12, dir: -1, sleep: p < .72, ph: .9 });
    list.sort((a, b) => a.y - b.y).forEach(v => { critter(c, v.K, v.x, v.y, v.s, { t, dir: v.dir, sleep: v.sleep, dpr: D, ph: v.ph }); if (v.sleep) zzz(c, v.x + v.s * .25, v.y - v.s * .85, v.s * .32, t); });
    const fa = sst((p - .1) / .1), ffOn = p > .07 && p < .62, x0 = w * .3 + h * .035, y0 = h * .81 - h * .1, x1 = m.homes.owl.door[0], y1 = m.homes.owl.door[1] + 6, cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - h * .24;
    const bz = u => [(1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * cy + u * u * y1 + Math.sin(u * 22) * h * .008 * (1 - u)];
    const [ffx, ffy] = bz(fa), ffa = ffOn ? Math.min(1, (p - .07) / .02, (.62 - p) / .03) : 0;
    const fl = sst((p - .58) / .04), fk = 1 + noise1(t * 5, 3) * .05 + noise1(t * 11, 4) * .03;
    if (k > .02) { const L = [], wl = sst((k - .2) / .15), bu = sst((p - .55) / .03);
      if (wl > 0) Object.values(m.homes).forEach(hm => L.push({ x: hm.win[0], y: hm.win[1], r: h * .1, k: .8 * wl }));
      if (bu > 0) m.bulbs.forEach(b => L.push({ x: b[0], y: b[1], r: h * .07, k: .55 * bu }));
      if (fl > 0) L.push({ x: fx, y: fy - h * .03, r: w * .3 * fk, k: fl, color: '#ff9a45', a: .3 * fl });
      if (ffa > 0) L.push({ x: ffx, y: ffy, r: h * .08, k: .6 * ffa });
      night(o.el, c, w, h, L, k);
      if (wl > 0) { c.save(); c.globalAlpha = wl; Object.values(m.homes).forEach(hm => litWindow(c, hm)); c.restore(); }
      if (bu > 0) m.bulbs.forEach((b, i) => glow(c, b[0], b[1], h * .035, '#ffd27a', (.4 + .1 * Math.sin(t * 2 + i)) * bu, 'screen'));
      const sa = sst((p - .42) / .12); if (sa > 0) { c.save(); c.globalAlpha = sa; stars(c, 0, h * .02, w, h * .36, Math.round(w / 16), t, 9600); moon(c, w * .16, h * .13, h * .04); c.restore(); } }
    if (fl > 0) { c.save(); c.globalAlpha = fl; glow(c, fx, fy - h * .04, w * .13 * fk, '#ffb050', .5); flame(c, fx, fy, w * .05 * fk * (.5 + fl * .5), t, 7); sparks(c, fx, fy, w * .05, t, 8); c.restore(); }
    if (st === 3) glints(c, [[sdx - sw * .26, sdy - sw * .62], [sdx + sw * .28, sdy - sw * .5], [sdx + sw * .1, sdy - sw * .78]], t, 9620);
    if (p > .45) fireflies(c, Math.round(w / 140), 0, h * .55, w, h * .9, t, 9610);
    if (ffa > 0) { c.save(); c.globalAlpha = ffa; if (fa > 0 && fa < 1) for (let j = 1; j < 9; j++) { const [tx, ty] = bz(Math.max(0, fa - j * .022)); c.fillStyle = 'rgba(255,226,140,' + (.5 * (1 - j / 9)) + ')'; c.beginPath(); c.arc(tx, ty, 2.2 * (1 - j / 12), 0, TAU); c.fill(); }
      const pu = .75 + .25 * Math.sin(t * 3); glow(c, ffx, ffy, h * .06 * pu, '#ffd66e', .75, 'source-over'); c.fillStyle = '#fff6c8'; c.beginPath(); c.arc(ffx, ffy, 3.2, 0, TAU); c.fill();
      if (fa >= 1) { const rp = (t % 2.4) / 2.4; c.globalAlpha = ffa * (1 - rp) * .6; c.strokeStyle = '#ffe39a'; c.lineWidth = 1.6; c.beginPath(); c.arc(ffx, ffy, 6 + rp * h * .06, 0, TAU); c.stroke(); } c.restore(); }
  } };
S.arrow = { anim: false, bg(c, w, h, o) { const n = o.name || 'dl', col = o.color || INK, P = { dl: [[.92, .06], [.6, .18], [.3, .5], [.1, .92]], dr: [[.08, .06], [.4, .18], [.7, .5], [.9, .92]], d: [[.5, .04], [.64, .38], [.44, .68], [.5, .95]] }[n]; if (!P) return {};
  const pts = P.map(([x, y]) => [x * w, y * h]); ink(c, pts, { w: 2, color: col, seed: 9700 + n.length });
  const e = pts[3], q = pts[2], an = Math.atan2(e[1] - q[1], e[0] - q[0]), L = Math.min(w, h) * .18 + 6; [an + 2.6, an - 2.6].forEach((b, i) => ink(c, [e, [e[0] + Math.cos(b) * L, e[1] + Math.sin(b) * L]], { w: 2, color: col, seed: 9710 + i, p: FLAT })); return {}; } };

S.lineup = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, P.sky, 3101); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .4]], P.sky2, { al: .5, seed: 3104, smooth: false, off: 6, gran: .06, edge: .12 });
    hill(c, w, h, h * .78, h * .02, 2.4 / w, 3102, P.near, { washC: P.nearW, line: 'ink', alpha: .7 }); tufts(c, 0, w, h * .82, h, Math.round(w / 10), 3103, P.shade); flowers(c, 0, w, h * .84, h, Math.round(w / 40), 3105, P.flower); return {}; },
  fg(c, w, h, t, o) { const cast = o.cast.length ? o.cast : LINEUP.map(kind => ({ kind })), gap = 12, tot = cast.reduce((a, v) => a + ((CR[v.kind] || {}).wd || 70) + gap, 0), s = Math.min(h * .56, w * .95 / tot * 100); let x = (w - tot * s / 100) / 2;
    cast.forEach((v, i) => { const wd = ((CR[v.kind] || {}).wd || 70) + gap, cx = x + wd * s / 200; x += wd * s / 100; critter(c, v.kind, cx, h * .9, s, { t, dpr: o.dpr, ph: i * .29, v, sleep: v.sleep, dir: v.kind === 'hedgehog' || v.kind === 'sheep' ? -1 : 1 }); }); } };
const PRESSED = {
  daisy(c) { ink(c, [[0, 0], [-3, -30], [3, -62]], { w: 1, color: '#6f8a4a', seed: 2501 }); [[-6, -26, -.8], [6, -40, .7]].forEach(([x, y, r], i) => { const l = blob(x, y, 7, 2.6, 2502 + i, .1, 8, r); wash(c, l, '#7d9a55', { al: .6, seed: 2504 + i, off: .4, gran: .2 }); pencil(c, l, { close: true, w: .6, alpha: .6, seed: 2506 + i, passes: 1 }); });
    for (let k = 0; k < 13; k++) { const a = k / 13 * TAU, p = blob(3 + Math.cos(a) * 9, -66 + Math.sin(a) * 9, 7, 2.4, 2510 + k, .12, 8, a); gouache(c, p, '#fbf7ee', .9); pencil(c, p, { close: true, w: .6, color: '#9b8d7b', alpha: .6, seed: 2530 + k, passes: 1 }); }
    wash(c, blob(3, -66, 4.6, 4.4, 2550, .1, 8), '#e0a33a', { al: .8, seed: 2551, off: .3, gran: .3 }); },
  poppy(c) { ink(c, [[0, 0], [3, -30], [-2, -58]], { w: 1.1, color: '#6f8a4a', seed: 2560 }); [[-7, -20, -.9], [7, -34, .9]].forEach(([x, y, r], i) => wash(c, blob(x, y, 8, 2.4, 2561 + i, .25, 10, r), '#7d9a55', { al: .6, seed: 2563 + i, off: .4, gran: .2 }));
    [[-8, -66, 12, 10, -.3], [8, -66, 12, 10, .3], [0, -74, 11, 9, 0], [0, -60, 12, 8, 0]].forEach(([x, y, rx, ry, r], i) => wash(c, blob(x, y, rx, ry, 2565 + i, .1, 10, r), '#d9583e', { al: .62, seed: 2570 + i, off: .6, gran: .25, edge: .6 }));
    gouache(c, blob(0, -66, 4, 3.6, 2575, .1, 8), '#2f3a2a', .85); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; pencil(c, [[Math.cos(a) * 4, -66 + Math.sin(a) * 3.6], [Math.cos(a) * 8, -66 + Math.sin(a) * 7]], { w: .7, alpha: .6, seed: 2576 + k, passes: 1 }); } },
  lavender(c) { [[-6, -2, -10, -64], [0, 0, 2, -70], [6, -2, 12, -60]].forEach(([x0, y0, x1, y1], j) => { ink(c, [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], { w: .9, color: '#7d8a5a', seed: 2590 + j }); for (let i = 0; i < 9; i++) { const u = .55 + i * .05, x = lerp(x0, x1, u), y = lerp(y0, y1, u); [-1, 1].forEach(d => wash(c, blob(x + d * 1.8, y, 1.8, 2.6, 2600 + j * 30 + i * 2 + (d > 0), .15, 7, d * .4), '#8a74b8', { al: .7, seed: 2700 + j * 30 + i * 2 + (d > 0), off: .2, gran: .1, edge: .4 })); } }); },
  fern(c) { const st = [[0, 0], [-4, -30], [4, -72]]; ink(c, st, { w: 1, color: '#6f8a4a', seed: 2620 }); const s = crPts(st, false, 1); for (let i = 1; i < 12; i++) { const p = s[Math.floor(s.length * (.1 + i * .075))]; if (!p) continue; const L = 13 - i * .8; [-1, 1].forEach(d => wash(c, blob(p[0] + d * L * .5, p[1] - 1, L * .5, 2, 2621 + i * 2 + (d > 0), .15, 8, d * -.35), '#6f8a4a', { al: .62, seed: 2650 + i * 2 + (d > 0), off: .2, gran: .2, edge: .45 })); } },
  clover(c) { ink(c, [[0, 0], [2, -30], [-1, -58]], { w: .9, color: '#6f8a4a', seed: 2680 }); ink(c, [[1, -20], [12, -32]], { w: .8, color: '#6f8a4a', seed: 2681 }); [0, 2.1, 4.2].forEach((a, i) => { wash(c, blob(12 + Math.cos(a - 1.6) * 5, -36 + Math.sin(a - 1.6) * 5, 5, 4, 2682 + i, .1, 8, a), '#7d9a55', { al: .65, seed: 2685 + i, off: .3, gran: .2, edge: .5 }); });
    for (let i = 0; i < 22; i++) { const a = i * 2.4, r = 2 + (i % 5) * 1.3; wash(c, blob(-1 + Math.cos(a) * r, -64 + Math.sin(a) * r, 2, 1.3, 2690 + i, .1, 6, a), '#d98aa8', { al: .6, seed: 2720 + i, off: .2, gran: .05, edge: .4 }); } }
};
S.pressed = { anim: false, bg(c, w, h, o) { const m = Math.min(w, h * .85); local(c, w / 2, h * .94, m / 85, () => (PRESSED[o.name] || PRESSED.daisy)(c)); return {}; } };
S.walk = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, '#e8d3b8', 2601); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .55], [-10, h * .5]], '#c58f86', { al: .35, seed: 2602, smooth: false, gran: .05, edge: .1 });
    hill(c, w, h, h * .62, h * .05, .02, 2603, P.near, { washC: P.nearW, line: 'ink', alpha: .6 });
    c.save(); c.setLineDash([3, 5]); c.strokeStyle = 'rgba(60,40,25,.55)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(w * .04, h * .84); c.bezierCurveTo(w * .35, h * .76, w * .6, h * .92, w * .86, h * .8); c.stroke(); c.restore();
    firering(c, w * .9, h * .82, w * .05, 2604); return {}; },
  fg(c, w, h, t, o) { const along = u => { const p0 = [w * .04, h * .84], p1 = [w * .35, h * .76], p2 = [w * .6, h * .92], p3 = [w * .86, h * .8], m = 1 - u; return [0, 1].map(k => m * m * m * p0[k] + 3 * m * m * u * p1[k] + 3 * m * u * u * p2[k] + u * u * u * p3[k]); };
    [['sheep', .16], ['rabbit', .36], ['frog', .5], ['hedgehog', .92], ['owl', .98]].forEach(([k, u0], i) => { const u = u0 > .9 ? u0 : u0 + ((t * .01 + i * .1) % .06), [x, y] = along(Math.min(1, u)), bob = u0 > .9 ? 0 : Math.abs(Math.sin(t * 5 + i * 1.3)) * h * .03; critter(c, k, u0 > .9 ? x - (k === 'owl' ? w * .02 : w * .1) : x, y - bob, h * .42, { t, dpr: o.dpr, ph: i * .3, dir: u0 > .9 && k === 'owl' ? -1 : 1 }); });
    night(o.el, c, w, h, [{ x: w * .9, y: h * .72, r: w * .32, k: 1, color: '#ff9a45', a: .3 }], .5, '#2b2440');
    flame(c, w * .9, h * .82, h * .32, t, 2605); stars(c, 0, 0, w, h * .4, 14, t, 2606); } };
const DECO = {
  windowbox(c, hm) { local(c, hm.x, hm.y, hm.k, () => { const b = [[10, -15.5], [21, -15.5], [20.5, -11], [10.5, -11]]; gouache(c, b, '#a37c59', 1, false); ink(c, b, { close: true, smooth: false, w: 1, seed: 2711 }); const cols = ['#f0b3b6', '#f6cf6a', '#fbf3e2', '#d4704e']; for (let i = 0; i < 6; i++) { const x = 11 + i * 1.9, y = -16.5 - (i % 2) * 1.4; c.fillStyle = '#7ea85a'; c.beginPath(); c.arc(x, y + 1, 1.2, 0, TAU); c.fill(); c.fillStyle = cols[i % 4]; c.beginPath(); c.arc(x, y - .6, 1.15, 0, TAU); c.fill(); } }); },
  bunting(c, hm) { local(c, hm.x, hm.y, hm.k, () => { ink(c, [[-31, -29], [-15, -23], [0, -21.5], [15, -23], [31, -29]], { w: .7, seed: 2761 }); const cols = ['#c96f4f', '#f2c25a', '#6f8faa', '#f0b3b6', '#6f9a5a']; for (let i = 0; i < 7; i++) { const x = -25 + i * 8.3, y = -29 + 7.5 * (1 - Math.pow(x / 31, 2)), tri = [[x - 2.6, y], [x + 2.6, y], [x, y + 5]]; gouache(c, tri, cols[i % 5], 1, false); ink(c, tri, { close: true, smooth: false, w: .5, seed: 2762 + i }); } }); },
  wreath(c, hm) { local(c, hm.x, hm.y, hm.k, () => { for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; gouache(c, blob(Math.cos(a) * 4.2, -12 + Math.sin(a) * 4.2, 2.2, 1.2, 2720 + i, .1, 7, a + 1.6), i % 2 ? '#6f9a5a' : '#4f7a35'); } c.fillStyle = '#c9543e'; [.5, 2.6, 4.6].forEach(a => { c.beginPath(); c.arc(Math.cos(a) * 4, -12 + Math.sin(a) * 4, .9, 0, TAU); c.fill(); }); gouache(c, [[0, -8], [-2.6, -6], [-2.4, -9.4]], '#c9543e', 1, false); gouache(c, [[0, -8], [2.6, -6], [2.4, -9.4]], '#c9543e', 1, false); }); },
  weathervane(c, hm) { local(c, hm.x, hm.y, hm.k, () => { ink(c, [[0, -57], [0, -75]], { w: 1.1, seed: 2731, p: FLAT }); ink(c, [[-9, -71], [9, -71]], { w: .9, seed: 2732, p: FLAT }); gouache(c, [[10, -71], [6, -73.5], [6, -68.5]], INK, 1, false); gouache(c, [[-9, -71], [-12, -74.5], [-11, -71], [-12, -67.5]], INK, 1, false); c.fillStyle = '#e8b44e'; c.beginPath(); c.arc(0, -76, 1.6, 0, TAU); c.fill(); ink(c, [[-3, -64], [3, -64]], { w: .8, seed: 2733, p: FLAT }); }); },
  lanterns(c, hm) { local(c, hm.x, hm.y, hm.k, () => { ink(c, [[-38, -24], [-20, -18], [0, -16], [20, -18], [38, -24]], { w: .8, seed: 2741 }); [-28, -10, 10, 28].forEach((x, i) => { const y = -18 + Math.abs(x) * .1 + 2; glow(c, x, y, 7, '#ffd66e', .6, 'source-over'); const b = blob(x, y, 2, 2.6, 2742 + i, .08, 7); gouache(c, b, '#ffd877'); ink(c, b, { close: true, w: .6, seed: 2746 + i }); }); }); },
  mailbox(c, hm) { local(c, hm.x, hm.y, hm.k, () => { ink(c, [[36, 1], [36, -14]], { w: 2, color: '#6d4c35', seed: 2751, p: FLAT }); const bx = [[30, -14], [42, -14], [42, -21], [36, -24.5], [30, -21]]; gouache(c, bx, '#d4704e', 1, false); wash(c, bx, '#9e4630', { al: .3, seed: 2752, smooth: false }); ink(c, bx, { close: true, smooth: false, w: .9, seed: 2753 }); ink(c, [[42, -18], [42, -27]], { w: .8, seed: 2754, p: FLAT }); gouache(c, [[42, -27], [46.5, -27], [46.5, -24], [42, -24]], '#f2c25a', 1, false); }); }
};
S.deco = { anim: false,
  bg(c, w, h, o) { paper(c, w, h, '#f3ead9', 2701); const g = blob(w * .5, h * .86, w * .44, h * .06, 2702, .05, 12); gouache(c, g, '#bccf92'); wash(c, g, '#86a463', { al: .4, seed: 2703 });
    const hm = house(c, w * .47, h * .86, Math.min(w, h) * .58, { roof: o.color || ROOF.rabbit, seed: 2704, lit: o.name === 'lanterns' }); const f = DECO[o.name]; if (f) f(c, hm); return {}; } };

/* ---------- stickers ---------- */
const HT = { rabbit: 140, hedgehog: 62, frog: 56, mole: 82, sheep: 74, owl: 98, fox: 112, duck: 58, tortoise: 42, badger: 48, mouse: 51, capybara: 62, raccoon: 91, otter: 105, cat: 92, bear: 121 };
function heart(g, x, y, s, col = '#e2626b', lw = 1.2) { const p = new Path2D(); p.moveTo(x, y + s * .35); p.bezierCurveTo(x - s * .9, y - s * .25, x - s * .45, y - s * .95, x, y - s * .45); p.bezierCurveTo(x + s * .45, y - s * .95, x + s * .9, y - s * .25, x, y + s * .35); g.save(); g.fillStyle = col; g.fill(p); g.strokeStyle = INK; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(p); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(x - s * .32, y - s * .42, s * .12, s * .08, -.6, 0, TAU); g.fill(); g.restore(); }
function star4(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, rr = i % 2 ? r * .38 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); }
function cap(g, text, x, y, size, rot = -.05, col = INK, maxW = 0) { g.save(); const f = s => `700 ${Math.round(s)}px Gaegu, 'Comic Sans MS', cursive`; g.font = f(size); const mw = g.measureText(text).width; if (maxW && mw > maxW) { size *= maxW / mw; g.font = f(size); } g.translate(x, y); g.rotate(rot); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.strokeStyle = '#fffdf8'; g.lineWidth = size * .3; g.strokeText(text, 0, 0); g.fillStyle = col; g.fillText(text, 0, 0); g.restore(); }
function fitS(kinds, w, h, wf = .62, hf = .6) { const wd = kinds.reduce((a, k) => a + ((CR[k] || {}).wd || 70), 0), ht = Math.max(...kinds.map(k => HT[k] || 90)); return Math.round(Math.min(w * wf / (wd / 100), h * hf / (ht / 100))); }
function eyeFx(g, K, s, dir, fx, t) { const A = ANCH[K]; if (!A) return; const k = s / 100, r = Math.max(2.4, A.er * k * 1.9);
  A.eyes.forEach(([ex, ey], i) => { const x = ex * k * dir, y = ey * k;
    if (fx === 'hearts') heart(g, x, y + r * .3, r * 1.3, '#e2626b', 1);
    else if (fx === 'stars') { const a = .8 + .25 * Math.sin(t * 7 + i); g.save(); g.fillStyle = '#fff6c8'; g.strokeStyle = INK; g.lineWidth = 1; star4(g, x, y, r * 1.25 * a); g.restore(); }
    else if (fx === 'wide') { g.save(); g.fillStyle = '#fffdf8'; g.strokeStyle = INK; g.lineWidth = 1.1; g.beginPath(); g.arc(x, y, r * .95, 0, TAU); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(x, y, r * .38, 0, TAU); g.fill(); g.restore(); } }); }
function drop(g, x, y, sz, col = '#8fc3dd') { g.save(); g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = .9; g.beginPath(); g.moveTo(x, y - sz); g.quadraticCurveTo(x + sz * .8, y + sz * .2, x, y + sz * .7); g.quadraticCurveTo(x - sz * .8, y + sz * .2, x, y - sz); g.fill(); g.stroke(); g.restore(); }
function tears(g, K, s, dir, t, one) { const A = ANCH[K], k = s / 100; A.eyes.forEach(([ex, ey], i) => { if (one && i) return; const ph = (t * .9 + i * .5) % 1, x = ex * k * dir + (i ? 1 : -1) * A.er * k * 1.1, y = ey * k + A.er * k * 1.6 + ph * s * .14; g.save(); g.globalAlpha = 1 - ph; drop(g, x, y, Math.max(2.6, s * .03)); g.restore(); }); }
function paw(g, K, s, dir, ang, def) { const A = ANCH[K], k = s / 100, [bx, by, rx, ry] = A.bod, px = (bx + rx * .82) * k * dir, py = (by - ry * .3) * k, L = Math.max(rx * .6, 11) * k;
  g.save(); g.translate(px, py); g.rotate(dir * ang); const arm = blob(0, -L * .48, L * .3, L * .58, 4001, .06, 9); gouache(g, arm, def.fill || '#e8d8c0'); ink(g, arm, { close: true, w: 1.2, seed: 4002 }); g.restore();
  const am = dir > 0 ? -.75 : -Math.PI + .75; g.save(); g.strokeStyle = 'rgba(42,34,29,.6)'; g.lineWidth = 1.2; g.lineCap = 'round'; [1.25, 1.6].forEach(m => { g.beginPath(); g.arc(px, py, L * m, am - .3, am + .3); g.stroke(); }); g.restore();
  return [px + Math.sin(dir * ang) * L, py - Math.cos(dir * ang) * L]; }
function confetti(g, w, h, t, seed, n = 14) { const cols = ['#e2626b', '#f2c25a', '#6f8faa', '#8fb768', '#c7b6e0']; for (let i = 0; i < n; i++) { const ph = (t * .45 + hash(i, seed)) % 1, x = w * (.08 + .84 * hash(i, seed + 1)) + Math.sin(t * 2 + i) * 6, y = h * (.04 + ph * .7); g.save(); g.globalAlpha = Math.sin(ph * Math.PI); g.translate(x, y); g.rotate(t * 3 + i); g.fillStyle = cols[i % 5]; g.fillRect(-2.6, -1.3, 5.2, 2.6); g.restore(); } }
function sc(g, K, s, t, o, ex) { critter(g, K, 0, 0, s, Object.assign({ t, dpr: o.dpr, v: o.v, shadow: false, ph: .3 }, ex)); }
const STK = {
  wave(g, w, h, t, o, K, s, def) { const gy = h * .93; g.save(); g.translate(w / 2, gy); sc(g, K, s, t, o); paw(g, K, s, 1, .25 + Math.sin(t * 9) * .5, def); g.restore(); return 'hi!'; },
  hug(g, w, h, t, o, K, s) { const gy = h * .93, A = ANCH[K], k = s / 100, p = 1 + Math.sin(t * 5) * .08; g.save(); g.translate(w / 2, gy); g.rotate(Math.sin(t * 2) * .05); sc(g, K, s, t, o, { st: 'blink' }); heart(g, A.bod[0] * k, (A.bod[1] + A.bod[3] * .15) * k, Math.max(11, s * .2) * p); g.restore(); return 'hug!'; },
  sleepy(g, w, h, t, o, K, s) { const gy = h * .93, A = ANCH[K], k = s / 100; g.save(); g.translate(w / 2, gy); g.rotate(Math.sin(t * 1.3) * .05); sc(g, K, s, t, o, { sleep: true }); g.restore(); zzz(g, w / 2 + A.head[0] * k + A.head[2] * k * .6, gy + (A.head[1] - A.head[3]) * k, h * .2, t); return 'sleepy'; },
  saw(g, w, h, t, o, K, s) { const gy = h * .93; g.save(); g.translate(w / 2, gy); sc(g, K, s, t, o, { st: 'open' }); eyeFx(g, K, s, 1, 'stars', t); g.restore(); const z = h * .24, y = h * .2 + Math.sin(t * 2.2) * 3; local(g, w * .82 - z / 2, y - z / 2, z / 100, () => ICONS.dewdrop(g, 1.4)); return 'saw this'; },
  in(g, w, h, t, o, K, s) { const gy = h * .93, ph = (t * 1.1) % 1, air = ph < .55 ? Math.sin(ph / .55 * Math.PI) : 0, sq = ph >= .55 && ph < .72 ? 1 - Math.sin((ph - .55) / .17 * Math.PI) * .16 : 1; confetti(g, w, h, t, 4201, 12); g.save(); g.translate(w / 2, gy - air * h * .13); g.scale(1 + (1 - sq) * .8, sq); sc(g, K, s, t, o, air > .2 ? { st: 'blink' } : {}); g.restore(); return "I'm in!"; },
  omw(g, w, h, t, o, K, s) { const gy = h * .93, wp = ((CR[K] || {}).wd || 70) * s / 100, x = w / 2 + Math.sin(t * 1.5) * w * .03;
    for (let i = 0; i < 3; i++) { const ph = (t * 1.5 + i / 3) % 1; g.save(); g.globalAlpha = 1 - ph; g.fillStyle = '#efe6d6'; g.strokeStyle = 'rgba(42,34,29,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(x - wp * .5 - ph * w * .12, gy - 3 - ph * 7, 2 + ph * 5, 0, TAU); g.fill(); g.stroke(); g.restore(); }
    g.save(); g.strokeStyle = 'rgba(42,34,29,.55)'; g.lineWidth = 1.3; g.lineCap = 'round'; [.45, .6, .75].forEach((f, i) => { g.beginPath(); g.moveTo(x - wp * .55 - 6 - i * 3, gy - h * f * .5); g.lineTo(x - wp * .55 - 16 - i * 3, gy - h * f * .5); g.stroke(); }); g.restore();
    g.save(); g.translate(x, gy - Math.abs(Math.sin(t * 8)) * h * .025); g.rotate(.07); sc(g, K, s, t, o); g.restore(); return 'on my way'; },
  love(g, w, h, t, o, K, s) { const gy = h * .93; for (let i = 0; i < 3; i++) { const ph = (t * .5 + i / 3) % 1; g.save(); g.globalAlpha = 1 - ph; heart(g, w * (.18 + .32 * i), h * (.5 - ph * .42), h * .08 * (1 - ph * .3)); g.restore(); } g.save(); g.translate(w / 2, gy); sc(g, K, s, t, o, { st: 'open' }); eyeFx(g, K, s, 1, 'hearts', t); g.restore(); return 'love you'; },
  care(g, w, h, t, o, K, s) { const gy = h * .93, A = ANCH[K], k = s / 100; g.save(); g.translate(w / 2, gy); sc(g, K, s, t, o); const cx = (A.bod[0] + A.bod[2] * .35) * k, cy = (A.bod[1] + A.bod[3] * .35) * k, z = Math.max(7, s * .1);
    const cp = [[cx - z, cy - z * .9], [cx + z, cy - z * .9], [cx + z * .8, cy + z * .6], [cx - z * .8, cy + z * .6]]; gouache(g, cp, '#fbf3e2', 1, false); ink(g, cp, { close: true, smooth: false, w: 1.2, seed: 4010 }); ink(g, [[cx + z, cy - z * .5], [cx + z * 1.55, cy - z * .2], [cx + z * .9, cy + z * .2]], { w: 1.1, seed: 4011 }); gouache(g, [[cx - z * .88, cy - z * .82], [cx + z * .88, cy - z * .82], [cx + z * .85, cy - z * .55], [cx - z * .85, cy - z * .55]], '#c98a4a', 1, false);
    for (let i = 0; i < 2; i++) { const ph = (t * .6 + i * .5) % 1; g.save(); g.globalAlpha = Math.sin(ph * Math.PI) * .8; pencil(g, [[cx - z * .3 + i * z * .6, cy - z - ph * z * 1.6], [cx - z * .1 + i * z * .6, cy - z * 1.5 - ph * z * 1.6], [cx - z * .35 + i * z * .6, cy - z * 2 - ph * z * 1.6]], { w: 1.1, alpha: .9, seed: 4012 + i, passes: 1 }); g.restore(); }
    g.restore(); heart(g, w * .2, h * .24 + Math.sin(t * 2) * 2, h * .07); return 'here for you'; },
  laugh(g, w, h, t, o, K, s) { const gy = h * .93; g.save(); g.translate(w / 2, gy); g.rotate(Math.sin(t * 22) * .07); sc(g, K, s, t, o, { st: 'blink' }); tears(g, K, s, 1, t); g.restore(); for (let i = 0; i < 2; i++) { const ph = (t * 1.2 + i * .5) % 1; g.save(); g.globalAlpha = Math.sin(ph * Math.PI); cap(g, 'ha', w * (.16 + .68 * i), h * (.36 - ph * .2), h * .13, i ? .25 : -.25); g.restore(); } return 'HA!'; },
  thanks(g, w, h, t, o, K, s) { const gy = h * .93, b = Math.max(0, Math.sin(t * 2.2)) * .32; g.save(); g.translate(w / 2, gy); g.rotate(b); sc(g, K, s, t, o, b > .1 ? { st: 'blink' } : {}); g.restore(); g.save(); g.fillStyle = '#fff6c8'; g.strokeStyle = INK; g.lineWidth = 1; [[.16, .3], [.84, .22], [.8, .5]].forEach(([x, y], i) => star4(g, w * x, h * y, h * .05 * (.7 + .3 * Math.sin(t * 5 + i)))); g.restore(); return 'thank you'; },
  nope(g, w, h, t, o, K, s) { const gy = h * .93, A = ANCH[K], k = s / 100; g.save(); g.translate(w / 2, gy); g.rotate(-.05); sc(g, K, s, t, o, { dir: -1, st: 'blink' }); g.restore(); drop(g, w / 2 - (A.head[0] - A.head[2] * .9) * k, gy + (A.head[1] - A.head[3] * .5) * k + Math.sin(t * 3) * 1.5, Math.max(3.4, s * .045), '#bfe0ee'); return 'nope.'; },
  bigmood(g, w, h, t, o, K, s) { const gy = h * .93; g.save(); g.translate(w / 2, gy); g.scale(1.3 + Math.sin(t * 1.5) * .03, .6); sc(g, K, s, t, o, { st: 'sleep' }); g.restore(); return 'big mood'; },
  screm(g, w, h, t, o, K, s) { const gy = h * .93, f = Math.floor(t * 24), jx = (hash(f, 1) - .5) * 3, jy = (hash(f, 2) - .5) * 3; g.save(); g.translate(w / 2 + jx, gy + jy); sc(g, K, s, t, o, { st: 'open' }); eyeFx(g, K, s, 1, 'wide', t); g.restore(); ['a', 'a', 'a'].forEach((l, i) => cap(g, l, w * (.14 + i * .07), h * (.3 - i * .06), h * (.1 + i * .02), -.3 + i * .1)); return 'AAAA'; },
  yay(g, w, h, t, o, K, s) { const gy = h * .93, ph = (t * 1.4) % 1, air = Math.max(0, Math.sin(ph * TAU)) * .7; confetti(g, w, h, t, 4301, 16); g.save(); g.translate(w / 2, gy - air * h * .08); sc(g, K, s, t, o, { st: 'blink' }); g.restore(); return 'yay!'; },
  miss(g, w, h, t, o, K, s) { const gy = h * .93; g.save(); g.translate(w / 2, gy); g.rotate(Math.sin(t * 1.4) * .04); sc(g, K, s, t, o, { st: 'open' }); tears(g, K, s, 1, t * .6, true); g.restore(); const p = 1 + Math.sin(t * 3) * .06; heart(g, w * .8, h * .26, h * .09 * p); return 'miss you'; },
  umbrella(g, w, h, t, o, K, s) { const gy = h * .93, A = ANCH[K], k = s / 100, wp = ((CR[K] || {}).wd || 70) * s / 100, R = Math.min(w * .42, Math.max(wp * .62, s * .38)), ux = w / 2 + A.head[0] * k * .5, uy = Math.max(R * .55 + 4, gy + (A.top[1] - 10) * k);
    g.save(); g.strokeStyle = 'rgba(80,110,150,.7)'; g.lineWidth = 1.2; g.lineCap = 'round'; for (let i = 0; i < 10; i++) { const ph = (t * 1.2 + hash(i, 4401)) % 1, x = hash(i, 4402) * w, y = ph * gy; if (Math.abs(x - ux) < R && y > uy - R * .6) continue; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.5, y + 6); g.stroke(); } g.restore();
    g.save(); g.translate(w / 2, gy); sc(g, K, s, t, o); g.restore(); ink(g, [[ux, uy], [ux, uy + R * .95], [ux + R * .14, uy + R * 1.05]], { w: 1.6, seed: 4403 });
    const can = []; for (let i = 0; i <= 20; i++) { const a = Math.PI * (1 + i / 20); can.push([ux + Math.cos(a) * R, uy + Math.sin(a) * R * .72]); } for (let i = 4; i >= 0; i--) { const x0 = ux + R - i * R * .4, x1 = x0 - R * .4; can.push([x0 - R * .2, uy + R * .1]); can.push([x1, uy]); }
    gouache(g, can, '#d4704e'); g.save(); g.clip(toPath(can)); for (let i = -2; i <= 2; i += 2) gouache(g, [[ux + i * R * .2 - R * .1, uy + 2], [ux, uy - R * .75], [ux + i * R * .2 + R * .1, uy + 2]], '#f2c25a', .9, false); g.restore(); ink(g, can, { close: true, w: 1.4, seed: 4404 }); return 'cosy day'; },
  cake(g, w, h, t, o, K, s) { const gy = h * .93, wp = ((CR[K] || {}).wd || 70) * s / 100; g.save(); g.translate(w * .42, gy); sc(g, K, s * .92, t, o, { st: 'blink' }); g.restore(); const cx = Math.min(w * .82, w * .42 + wp * .5), z = h * .1;
    const ck = rbox(cx, gy - z * .7, z * 1.1, z * .7, z * .25, 4501); gouache(g, ck, '#fbf3e2', 1, false); ink(g, ck, { close: true, smooth: false, w: 1.3, seed: 4502 }); ink(g, [[cx - z * 1.1, gy - z * .95], [cx - z * .5, gy - z * .7], [cx, gy - z * .95], [cx + z * .5, gy - z * .7], [cx + z * 1.1, gy - z * .95]], { w: 2.2, color: '#e2626b', seed: 4503, p: FLAT });
    ink(g, [[cx, gy - z * 1.4], [cx, gy - z * 2.1]], { w: 2.2, color: '#6f8faa', seed: 4504, p: FLAT }); const fl = 1 + Math.sin(t * 14) * .15; gouache(g, blob(cx, gy - z * 2.4, z * .7, z * .7, 4506, .1, 9), '#ffe6a6', .85); drop(g, cx, gy - z * 2.4, z * .32 * fl, '#f6b74a'); confetti(g, w, h * .6, t, 4505, 8); return 'hbd!'; },
  clover(g, w, h, t, o, K, s, def) { const gy = h * .93; g.save(); g.translate(w / 2, gy); sc(g, K, s, t, o, { st: 'blink' }); const [tx, ty] = paw(g, K, s, 1, .15 + Math.sin(t * 3) * .1, def); ink(g, [[tx, ty], [tx + 2, ty - h * .1]], { w: 1.4, color: '#4f7a35', seed: 4601 }); const cx = tx + 2, cy = ty - h * .14, z = h * .055; for (let i = 0; i < 4; i++) heart(g, cx + Math.cos(i * Math.PI / 2) * z * .7, cy + Math.sin(i * Math.PI / 2) * z * .7, z, '#7ea85a', 1); g.restore(); return 'good luck!'; },
  hug2(g, w, h, t, o, K) { const B = o.cast[0] || { kind: 'hedgehog' }, KB = CR[B.kind] ? B.kind : 'hedgehog', s = fitS([K, KB], w, h, .86, .7), gy = h * .93, lean = .13 + Math.sin(t * 3) * .04, wa = ((CR[K] || {}).wd || 70) * s / 100, wb = ((CR[KB] || {}).wd || 70) * s / 100, ov = Math.min(wa, wb) * .22, tw = wa + wb - ov, xa = w / 2 - tw / 2 + wa / 2, xb = xa + wa / 2 + wb / 2 - ov;
    critter(g, KB, xb, gy, s, { t, dpr: o.dpr, v: B, shadow: false, st: 'blink', rot: -lean, dir: -1, ph: .6 }); critter(g, K, xa, gy, s, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink', rot: lean, ph: .2 });
    const top = gy - Math.max(HT[K] || 90, HT[KB] || 90) * s / 100, p = 1 + Math.sin(t * 5) * .1; heart(g, (xa + xb) / 2, Math.max(h * .14, top - 2), h * .1 * p); return 'hug!'; },
  squad(g, w, h, t, o, K) { const list = [Object.assign({ kind: K }, o.v)].concat(o.cast.filter(v => CR[v.kind])), kinds = list.map(v => v.kind), s = fitS(kinds, w, h, .95, .66), gy = h * .93, tot = kinds.reduce((a, k) => a + ((CR[k] || {}).wd || 70) * s / 100, 0); let x = w / 2 - tot / 2;
    list.forEach((v, i) => { const wp = ((CR[v.kind] || {}).wd || 70) * s / 100, up = Math.max(0, Math.sin(t * 6 + i * 1.3)); critter(g, v.kind, x + wp / 2, gy - up * h * .06, s, { t, dpr: o.dpr, v, shadow: false, st: up > .4 ? 'blink' : undefined, ph: i * .3, dir: v.kind === 'hedgehog' || v.kind === 'sheep' ? -1 : 1 }); x += wp; }); return 'the gang'; }
};
const CROP = { wave: 1, hug: 1, sleepy: 1, saw: 1, in: 1, omw: 1, love: 1, care: 1, laugh: 1, thanks: 1, nope: 1, bigmood: 1, screm: 1, yay: 1, miss: 1, umbrella: 1, cake: 1, clover: 1 };
function faceShot(g, w, h, t, o, K, s, def, fx) { const A = ANCH[K], hr0 = Math.max(A.head[2], A.head[3] * 1.1) / 100, R = Math.min(w * .42, h * .47), cx = w / 2, cy = h * .53, S2 = Math.round((R * .68) / hr0), k = S2 / 100, sq = Math.sin(t * 3) * .04;
  const cp = new Path2D(); cp.ellipse(cx, cy, R, R * .98, 0, 0, TAU); g.save(); g.fillStyle = def.tint || '#f3e6d4'; g.fill(cp); g.clip(cp);
  g.translate(cx, cy + hr0 * k * 100 * .12); g.scale(1 + sq, 1 - sq); g.translate(-A.head[0] * k, -A.head[1] * k); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: fx === 'squish' ? 'blink' : (fx ? 'open' : undefined) }); if (fx && fx !== 'squish') eyeFx(g, K, S2, 1, fx, t); g.restore();
  g.save(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(cp); g.restore();
  [-1, 1].forEach((d, i) => { const px = cx + d * R * .42, py = cy + R * .8, pw = blob(px, py, R * .2, R * .14, 4801 + i, .06, 9); gouache(g, pw, def.fill || '#e8d8c0'); ink(g, pw, { close: true, w: 1.3, seed: 4803 + i }); for (let j = -1; j <= 1; j++) ink(g, [[px + j * R * .07, py - R * .12], [px + j * R * .07, py - R * .04]], { w: .9, seed: 4806 + i * 3 + j, p: FLAT }); }); }
Object.assign(STK, {
  face(g, w, h, t, o, K, s, def) { faceShot(g, w, h, t, o, K, s, def, 'squish'); return 'miss ur face'; },
  faceLove(g, w, h, t, o, K, s, def) { faceShot(g, w, h, t, o, K, s, def, 'hearts'); for (let i = 0; i < 3; i++) { const ph = (t * .55 + i / 3) % 1; g.save(); g.globalAlpha = 1 - ph; heart(g, w * (.12 + .38 * i), h * (.3 - ph * .26), h * .09 * (1 - ph * .3)); g.restore(); } return 'love you'; },
  faceStar(g, w, h, t, o, K, s, def) { faceShot(g, w, h, t, o, K, s, def, 'stars'); const z = h * .26, y = h * .14 + Math.sin(t * 2.2) * 3; local(g, w * .84 - z / 2, y - z / 2, z / 100, () => ICONS.dewdrop(g, 1.4)); return 'saw this'; },
  peek(g, w, h, t, o, K, s, def) { const A = ANCH[K], S2 = Math.round(s * 1.35), k = S2 / 100, py = h * .72, bob = Math.sin(t * 2.2) * .5 + .5, headY = py - A.head[3] * k * (.2 + bob * .6), fx = w / 2 - A.head[0] * k;
    g.save(); g.beginPath(); g.rect(0, 0, w, py + 2); g.clip(); critter(g, K, fx, headY - A.head[1] * k, S2, { t, dpr: o.dpr, v: o.v, shadow: false }); g.restore();
    const pl = [[w * .05, py], [w * .95, py - 2], [w * .96, py + h * .16], [w * .04, py + h * .17]]; gouache(g, pl, '#c49b6f', 1, false); wash(g, pl, '#7a5236', { al: .35, seed: 4811, smooth: false }); pencil(g, [[w * .12, py + h * .07], [w * .55, py + h * .075]], { w: .9, alpha: .6, seed: 4812, passes: 1 }); pencil(g, [[w * .6, py + h * .11], [w * .88, py + h * .105]], { w: .9, alpha: .6, seed: 4813, passes: 1 }); ink(g, pl, { close: true, smooth: false, w: 1.5, seed: 4814 });
    [-1, 1].forEach((d, i) => { const px = w / 2 + d * Math.max(A.head[2] * k * .75, w * .12), pw = blob(px, py + 1, w * .075, h * .05, 4815 + i, .08, 8); gouache(g, pw, def.fill || '#e8d8c0'); ink(g, pw, { close: true, w: 1.2, seed: 4817 + i }); }); return 'hi?'; },
  hang(g, w, h, t, o, K, s) { const by = h * .14, sw = Math.sin(t * 1.8) * .18, S2 = Math.round(Math.min(s * 1.05, h * .74 / ((HT[K] || 90) / 100)));
    ink(g, [[w * .03, by + 3], [w * .5, by - 2], [w * .97, by + 4]], { w: 4.5, color: '#6d4c35', seed: 4821, p: FLAT });
    g.save(); g.translate(w / 2, by + 2); g.rotate(Math.PI + sw); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'open' }); g.restore();
    [[.1, -.5], [.86, .5], [.66, -.3]].forEach(([x, r], i) => { const l = blob(w * x, by - 3, w * .07, w * .03, 4822 + i, .08, 8, r); gouache(g, l, '#8fb768'); ink(g, l, { close: true, w: 1, seed: 4826 + i }); }); return 'hanging in there'; },
  flop(g, w, h, t, o, K) { const ht = HT[K] || 90, wd = (CR[K] || {}).wd || 70, S2 = Math.round(Math.min(w * .8 / (ht / 100), h * .55 / (wd / 100))), k = S2 / 100, gy = h * .92, sh = Math.sin(t * 20) * 1.2;
    ink(g, [[w * .05, gy + 1], [w * .95, gy]], { w: 1.4, seed: 4831, p: FLAT });
    g.save(); g.translate(w / 2 + ht * k / 2 + sh, gy - wd * k / 2 - 1); g.rotate(-Math.PI / 2 + Math.sin(t * 20) * .03); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink' }); tears(g, K, S2, 1, t); g.restore();
    for (let i = 0; i < 2; i++) { const ph = (t * 1.2 + i * .5) % 1; g.save(); g.globalAlpha = Math.sin(ph * Math.PI); cap(g, 'ha', w * (.2 + .55 * i), h * (.3 - ph * .2), h * .14, i ? .25 : -.25); g.restore(); } return 'HA!'; },
  corner(g, w, h, t, o, K, s, def) { const S2 = Math.round(s * 1.2), ex = w * .62, lean = -.24 + Math.sin(t * 1.6) * .05;
    g.save(); g.translate(ex + w * .02, h * .97); g.rotate(lean); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'open' }); g.restore();
    const wl = [[ex, h * .02], [w * .97, h * .03], [w * .97, h * .99], [ex, h * .99]]; gouache(g, wl, '#e9d6b8', 1, false); wash(g, wl, '#b0905f', { al: .35, seed: 4841, smooth: false }); for (let i = 1; i < 3; i++) pencil(g, [[ex + (w * .97 - ex) * i / 3, h * .05], [ex + (w * .97 - ex) * i / 3, h * .97]], { w: .8, alpha: .5, seed: 4842 + i, passes: 1 }); ink(g, wl, { close: true, smooth: false, w: 1.5, seed: 4845 });
    const pw = blob(ex - 1, h * .48, w * .05, h * .06, 4846, .08, 8); gouache(g, pw, def.fill || '#e8d8c0'); ink(g, pw, { close: true, w: 1.2, seed: 4847 }); return 'you up?'; },
  window(g, w, h, t, o, K) { const wall = [[w * .14, h * .36], [w * .86, h * .36], [w * .86, h * .99], [w * .14, h * .99]], roof = [[w * .05, h * .4], [w * .5, h * .06], [w * .95, h * .4]], cx = w / 2, cy = h * .67, R = w * .22, A = ANCH[K];
    gouache(g, wall, '#f2e6cf', 1, false); wash(g, wall, '#d6bf9c', { al: .35, seed: 4851, smooth: false }); ink(g, wall, { close: true, smooth: false, w: 1.5, seed: 4852 }); gouache(g, roof, '#c96f4f', 1, false); wash(g, roof, '#8a3e26', { al: .4, seed: 4853, smooth: false }); ink(g, roof, { close: true, smooth: false, w: 1.6, seed: 4854 });
    const wp = new Path2D(); wp.ellipse(cx, cy, R, R * 1.05, 0, 0, TAU); g.save(); g.fillStyle = '#ffd98a'; g.fill(wp); g.clip(wp); const S2 = Math.round(R * .82 / (A.head[2] / 100)), k = S2 / 100; critter(g, K, cx - A.head[0] * k, cy + R * .2 - A.head[1] * k + Math.sin(t * 2) * 1.5, S2, { t, dpr: o.dpr, v: o.v, shadow: false }); g.restore();
    g.save(); g.strokeStyle = '#7d5a3e'; g.lineWidth = 4; g.stroke(wp); g.restore(); ink(g, blob(cx, cy, R + 2, R * 1.05 + 2, 4855, .01, 14), { close: true, w: 1.4, seed: 4856 });
    const sill = [[cx - R * 1.2, cy + R * 1.05], [cx + R * 1.2, cy + R * 1.05], [cx + R * 1.15, cy + R * 1.3], [cx - R * 1.15, cy + R * 1.3]]; gouache(g, sill, '#a37c59', 1, false); ink(g, sill, { close: true, smooth: false, w: 1.2, seed: 4857 }); [-.8, -.3, .3, .8].forEach((u, i) => { g.fillStyle = ['#f0b3b6', '#f6cf6a', '#fbf3e2', '#f0b3b6'][i]; g.beginPath(); g.arc(cx + u * R, cy + R * 1.0, 3, 0, TAU); g.fill(); }); return 'home!'; },
  sign(g, w, h, t, o, K) { const ht = HT[K] || 90, A = ANCH[K], S2 = Math.round(Math.min(w * .5 / (((CR[K] || {}).wd || 70) / 100), h * .46 / (ht / 100))), k = S2 / 100, gy = h * .97, topY = gy - ht * k, sy = Math.max(h * .04, topY - h * .38), sw = Math.sin(t * 3) * .06, bob = Math.abs(Math.sin(t * 3)) * 2;
    [-1, 1].forEach(d => ink(g, [[w / 2 + d * A.bod[2] * k * .8, gy + A.bod[1] * k - bob], [w / 2 + d * w * .2, sy + h * .2]], { w: 2.4, color: '#6d4c35', seed: 4861 + d, p: FLAT }));
    g.save(); g.translate(w / 2, sy + h * .12 - bob); g.rotate(sw); const bd = rbox(0, 0, w * .45, h * .15, 6, 4863); gouache(g, bd, '#fbf3e2', 1, false); wash(g, bd, '#d8c3a2', { al: .3, seed: 4864, smooth: false }); ink(g, bd, { close: true, smooth: false, w: 1.6, seed: 4865 }); cap(g, o.cap || "I'M IN", 0, 1, h * .15, 0, INK, w * .8); g.restore();
    g.save(); g.translate(w / 2, gy - bob); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink' }); g.restore(); return '-'; },
  tumble(g, w, h, t, o, K) { const ht = HT[K] || 90, wd = (CR[K] || {}).wd || 70, S2 = Math.round(Math.min(w, h) * .6 / (Math.max(ht, wd) / 100)), k = S2 / 100, cx = w / 2 + Math.sin(t * 1.2) * w * .04, cy = h * .5, a = t * 5, R = Math.max(ht, wd) * k * .55;
    g.save(); g.strokeStyle = 'rgba(42,34,29,.5)'; g.lineWidth = 1.5; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx, cy, R + 3 + i * 4, a + 2 + i * .3, a + 2.9 + i * .3); g.stroke(); } g.restore();
    for (let i = 0; i < 3; i++) { const ph = (t * 1.5 + i / 3) % 1; g.save(); g.globalAlpha = 1 - ph; g.fillStyle = '#efe6d6'; g.strokeStyle = 'rgba(42,34,29,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(cx - R * .6 - ph * w * .14, h * .9 - ph * 6, 2 + ph * 5, 0, TAU); g.fill(); g.stroke(); g.restore(); }
    g.save(); g.translate(cx, cy); g.rotate(a); g.translate(0, ht * k * .45); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink' }); g.restore(); return 'omw!!!'; },
  burrito(g, w, h, t, o, K, s) { const A = ANCH[K], S2 = Math.round(s * 1.1), k = S2 / 100, gy = h * .95, line = gy + (A.head[1] + A.head[3] * .3) * k;
    g.save(); g.translate(w / 2, gy); g.rotate(Math.sin(t * 1.2) * .03); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'sleep' }); g.restore();
    const bh = (gy - line) / 2 + 5, bl = rbox(w / 2, line + bh - 3, w * .42, bh, Math.min(w * .2, bh * .9), 4871); gouache(g, bl, '#8fb3cf'); g.save(); g.clip(toPath(bl, true, false)); for (let i = -6; i < 8; i++) ink(g, [[w * (.1 + i * .12), gy + 4], [w * (.3 + i * .12), line - 6]], { w: 3, color: '#f6f0e2', seed: 4872 + i, p: FLAT, alpha: .8 }); g.restore(); ink(g, bl, { close: true, smooth: false, w: 1.6, seed: 4890 }); ink(g, [[w * .14, line + bh * .5], [w * .5, line + bh * .65], [w * .86, line + bh * .5]], { w: 1, seed: 4891, alpha: .6 });
    zzz(g, w * .74, line - A.head[3] * k * .8, h * .18, t); return 'do not disturb'; },
  mug(g, w, h, t, o, K, s) { const A = ANCH[K], mw = w * .34, rim = h * .58, mb = h * .97, S2 = Math.round(Math.min(s, (mw * 1.3) / (((CR[K] || {}).wd || 70) / 100))), k = S2 / 100;
    for (let i = 0; i < 2; i++) { const ph = (t * .6 + i * .5) % 1; g.save(); g.globalAlpha = Math.sin(ph * Math.PI) * .8; pencil(g, [[w * (.3 + i * .4), rim - 8 - ph * h * .2], [w * (.33 + i * .4), rim - 16 - ph * h * .2], [w * (.29 + i * .4), rim - 24 - ph * h * .2]], { w: 1.2, alpha: .9, seed: 4900 + i, passes: 1 }); g.restore(); }
    gouache(g, blob(w / 2, rim, mw, h * .045, 4902, .03, 14), '#a9774a');
    g.save(); g.beginPath(); g.rect(0, 0, w, rim + 6); g.clip(); critter(g, K, w / 2 - A.head[0] * k, rim + 2 - A.head[3] * k * .3 - A.head[1] * k + Math.sin(t * 2) * 1.5, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink' }); g.restore();
    const body = [[w / 2 - mw, rim], [w / 2 + mw, rim], [w / 2 + mw * .9, mb], [w / 2 - mw * .9, mb]]; ink(g, [[w / 2 + mw * .92, rim + h * .1], [w / 2 + mw * 1.35, rim + h * .14], [w / 2 + mw * 1.3, rim + h * .26], [w / 2 + mw * .9, rim + h * .29]], { w: 3.4, color: INK, seed: 4903 }); gouache(g, body, '#fbf3e2', 1, false); wash(g, body, '#d8c3a2', { al: .3, seed: 4904, smooth: false }); ink(g, body, { close: true, smooth: false, w: 1.6, seed: 4905 }); ink(g, blob(w / 2, rim, mw, h * .045, 4902, .03, 14), { close: true, w: 1.4, seed: 4906 }); heart(g, w / 2, rim + (mb - rim) * .55, h * .1, '#e2626b', 1); return 'tea?'; },
  stack(g, w, h, t, o, K) { const list = [Object.assign({ kind: K }, o.v)].concat(o.cast.filter(v => CR[v.kind])).sort((a, b) => ((CR[b.kind].wd || 70) - (CR[a.kind].wd || 70))), tot = list.reduce((a, v) => a + (HT[v.kind] || 90) * .86, 0), mw = Math.max(...list.map(v => CR[v.kind].wd || 70)), S2 = Math.round(Math.min(h * .9 / (tot / 100), w * .78 / (mw / 100))); let y = h * .97;
    list.forEach((v, i) => { const sw = Math.sin(t * 2.2 + i * .8) * (i + 1) * 1.6; critter(g, v.kind, w / 2 + sw, y, S2, { t, dpr: o.dpr, v, shadow: false, st: i === list.length - 1 ? 'blink' : undefined, rot: sw * .012, ph: i * .3, dir: v.kind === 'hedgehog' || v.kind === 'sheep' ? -1 : 1 }); y -= (HT[v.kind] || 90) * .86 * S2 / 100; }); return 'friend tower'; }
});
function fitK(K, w, h, wf, hf) { return Math.round(Math.min(w * wf / (((CR[K] || {}).wd || 70) / 100), h * hf / ((HT[K] || 90) / 100))); }
function pawDot(g, x, y, r, def) { const p = blob(x, y, r, r * .85, 5001, .08, 8); gouache(g, p, def.fill || '#e8d8c0'); ink(g, p, { close: true, w: 1.1, seed: 5002 }); }
const LEAFC = ['#e0873e', '#d9643f', '#e8b44e', '#b85a30', '#c9a24a'];
function leafDot(g, x, y, r, rot, col, outline) { const l = blob(x, y, r, r * .5, 5010 + ((x * 7 + y) | 0) % 50, .1, 7, rot); gouache(g, l, col); if (outline) ink(g, l, { close: true, w: .8, seed: 5070 }); }
Object.assign(STK, {
  swing(g, w, h, t, o, K) { const by = h * .13, a = Math.sin(t * 2.2) * .42, L = h * .62, S2 = fitK(K, w, h, .4, .36), wd = (CR[K] || {}).wd || 70, sw = Math.max(wd * S2 / 200 + 4, w * .13);
    ink(g, [[w * .02, by + 3], [w * .5, by - 1], [w * .98, by + 2]], { w: 5, color: '#6d4c35', seed: 4911, p: FLAT });
    g.save(); g.translate(w / 2, by + 1); g.rotate(a); [-1, 1].forEach(d => ink(g, [[d * sw, 0], [d * sw, L]], { w: 1.3, color: '#8a6446', seed: 4912 + d, p: FLAT }));
    critter(g, K, 0, L - 1, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: Math.abs(a) > .3 ? 'blink' : 'open' });
    const seat = [[-sw - 5, L - 2], [sw + 5, L - 2], [sw + 4, L + 5], [-sw - 4, L + 5]]; gouache(g, seat, '#c49b6f', 1, false); ink(g, seat, { close: true, smooth: false, w: 1.3, seed: 4915 }); g.restore();
    [[.12, -.5], [.88, .5]].forEach(([x, r], i) => { const l = blob(w * x, by - 3, w * .08, w * .035, 4916 + i, .08, 8, r); gouache(g, l, '#8fb768'); ink(g, l, { close: true, w: 1, seed: 4918 + i }); }); return 'swing by?'; },
  boat(g, w, h, t, o, K) { const wy = h * .72, bob = Math.sin(t * 2) * 2.5, rk = Math.sin(t * 2 + .6) * .06, S2 = fitK(K, w, h, .48, .5);
    const water = blob(w / 2, wy + h * .12, w * .47, h * .15, 4921, .04, 14); gouache(g, water, '#cfe3e6'); wash(g, water, '#6aa2b2', { al: .45, seed: 4922 }); ink(g, water, { close: true, w: 1.3, seed: 4923, alpha: .8 });
    for (let i = 0; i < 3; i++) { const ph = (t * .5 + i / 3) % 1; g.save(); g.globalAlpha = (1 - ph) * .8; g.strokeStyle = '#3f6f7c'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(w / 2, wy + h * .08, w * (.2 + ph * .2), h * (.03 + ph * .02), 0, 0, TAU); g.stroke(); g.restore(); }
    ink(g, [[w * .12, wy + h * .14], [w * .1, wy - h * .16]], { w: 1.2, color: '#5d7a42', seed: 4927 }); g.fillStyle = '#7a5235'; g.beginPath(); g.ellipse(w * .1, wy - h * .18, 2, 5, 0, 0, TAU); g.fill();
    g.save(); g.translate(w / 2, wy + bob); g.rotate(rk); critter(g, K, 0, h * .02, S2, { t, dpr: o.dpr, v: o.v, shadow: false });
    const lf = [[-w * .37, -h * .1], [-w * .2, h * .05], [w * .2, h * .05], [w * .39, -h * .12], [w * .2, -h * .04], [-w * .2, -h * .04]]; gouache(g, lf, '#8fb768'); wash(g, lf, '#4f7a35', { al: .4, seed: 4924 }); ink(g, lf, { close: true, w: 1.4, seed: 4925 }); ink(g, [[-w * .3, -h * .03], [w * .32, -h * .05]], { w: .9, color: '#4f7a35', seed: 4926 }); g.restore(); return 'drifting by'; },
  leafpile(g, w, h, t, o, K) { const cyc = (t * .55) % 1, fall = cyc < .45 ? cyc / .45 : 1, land = cyc >= .45 ? (cyc - .45) / .55 : 0, S2 = fitK(K, w, h, .5, .48), ht = (HT[K] || 90) * S2 / 100, py = h * .8, cy = lerp(h * .48, py + ht * .4, fall * fall);
    const pile = blob(w / 2, py + h * .07, w * .44, h * .16, 4931, .08, 14); gouache(g, pile, '#d9a052'); wash(g, pile, '#a8562c', { al: .35, seed: 4932 });
    const r = rng(4933); for (let i = 0; i < 26; i++) leafDot(g, w * (.1 + r() * .8), py - h * .05 + r() * h * .14, w * .035, r() * 3, LEAFC[i % 5]);
    critter(g, K, w / 2, cy, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink', rot: (1 - fall) * .25 });
    const q = rng(4934); for (let i = 0; i < 30; i++) { const x = w * (.08 + q() * .84), y = py + q() * h * .14, rr = w * (.03 + q() * .015); if (Math.hypot((x - w / 2) / (w * .44), (y - py - h * .07) / (h * .16)) < 1) leafDot(g, x, y, rr, q() * 3, LEAFC[i % 5], i % 4 === 0); }
    if (land > 0) for (let i = 0; i < 10; i++) { const a = Math.PI * (.15 + .7 * hash(i, 4935)), d = land * (w * .3 + hash(i, 4936) * w * .15); g.save(); g.globalAlpha = 1 - land; leafDot(g, w / 2 + Math.cos(a) * d, py - Math.sin(a) * d * 1.1 + land * land * h * .25, w * .03, t * 4 + i, LEAFC[i % 5], true); g.restore(); }
    return 'jumping in!'; },
  water(g, w, h, t, o, K, s, def) { const gy = h * .93, S2 = fitK(K, w, h, .42, .6), k = S2 / 100, A = ANCH[K], cx = w * .33, grow = .3 + .7 * ((t * .22) % 1);
    critter(g, K, cx, gy, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink' });
    const hx = cx + (A.bod[0] + A.bod[2] * .85) * k, hy = gy + (A.bod[1] - A.bod[3] * .1) * k, z = w * .08;
    const cn = rbox(hx + z * .8, hy, z * .75, z * .6, 4, 4941); gouache(g, cn, '#7fa8c0', 1, false); wash(g, cn, '#3f6f8c', { al: .3, seed: 4942, smooth: false }); ink(g, cn, { close: true, smooth: false, w: 1.3, seed: 4943 }); const sx = hx + z * 2.4, sy = hy - z * 1.1; ink(g, [[hx + z * 1.4, hy - z * .1], [sx, sy]], { w: 2.6, color: '#3f6f8c', seed: 4944, p: FLAT }); ink(g, [[hx + z * .3, hy - z * .6], [hx + z * .8, hy - z * 1.2], [hx + z * 1.3, hy - z * .6]], { w: 1.4, seed: 4945 }); pawDot(g, hx + z * .1, hy, z * .38, def);
    const px = w * .84, top = gy - h * .32 * grow; for (let i = 0; i < 4; i++) { const ph = (t * 1.6 + i / 4) % 1; drop(g, lerp(sx, px, ph), lerp(sy, top - 4, ph) - Math.sin(ph * Math.PI) * h * .04, 2.4); }
    gouache(g, blob(px, gy, w * .12, h * .035, 4946, .08, 10), '#a9825e'); ink(g, [[px, gy - 2], [px, top]], { w: 1.6, color: '#4f7a35', seed: 4947 });
    [[-1, .45], [1, .7]].forEach(([d, u], i) => { const l = blob(px + d * w * .06 * grow, gy - (gy - top) * u, w * .065 * grow, w * .03 * grow, 4948 + i, .08, 8, d * -.4); gouache(g, l, '#8fb768'); ink(g, l, { close: true, w: 1, seed: 4950 + i }); });
    if (grow > .8) { const b = blob(px, top - 3, w * .045 * grow, w * .05 * grow, 4952, .08, 9); gouache(g, b, '#f0b3b6'); ink(g, b, { close: true, w: 1, seed: 4953 }); } return 'growing!'; },
  mailbox(g, w, h, t, o, K) { const bx = w / 2, top = h * .46, bw = w * .3, bh = h * .2, cyc = (t * .45) % 1, up = Math.sin(Math.min(1, cyc / .28) * Math.PI / 2), S2 = fitK(K, w, h, .5, .44), k = S2 / 100, A = ANCH[K];
    ink(g, [[bx, top + bh * 2], [bx, h * .98]], { w: 5, color: '#6d4c35', seed: 4961, p: FLAT }); ink(g, [[bx - w * .14, h * .97], [bx + w * .14, h * .97]], { w: 1.4, seed: 4962, p: FLAT });
    g.save(); g.beginPath(); g.rect(0, 0, w, top + 3); g.clip(); critter(g, K, bx - A.head[0] * k, top + h * .08 - up * (A.head[3] * 2.2 * k + h * .06) - A.head[1] * k, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: up > .9 ? 'open' : 'blink' }); g.restore();
    const box = rbox(bx, top + bh, bw, bh, bh * .7, 4963); gouache(g, box, '#d4704e', 1, false); wash(g, box, '#9e4630', { al: .35, seed: 4964, smooth: false }); ink(g, box, { close: true, smooth: false, w: 1.6, seed: 4965 }); ink(g, [[bx - bw * .7, top + 1], [bx + bw * .7, top + 1]], { w: 2.4, seed: 4966, p: FLAT });
    ink(g, [[bx + bw + 2, top + bh * 1.4], [bx + bw + 2, top - h * .04]], { w: 1.4, seed: 4967, p: FLAT }); gouache(g, [[bx + bw + 2, top - h * .04], [bx + bw + w * .1, top - h * .04], [bx + bw + w * .1, top + h * .04], [bx + bw + 2, top + h * .04]], '#f2c25a', 1, false);
    if (cyc > .3) { const ph = (cyc - .3) / .7, z = h * .2; g.save(); g.globalAlpha = 1 - ph * .6; g.translate(bx - w * .3 * ph, top - h * .32 * ph); g.rotate(-ph * .6); local(g, -z / 2, -z / 2, z / 100, () => ICONS.envelope(g, 1.4)); g.restore(); } return 'got mail!'; },
  balloon(g, w, h, t, o, K, s, def) { const fl = Math.sin(t * 1.4) * h * .04, S2 = fitK(K, w, h, .38, .4), k = S2 / 100, A = ANCH[K], gy = h * .9 + fl, sw = Math.sin(t * 1.1) * .08, hand = [w / 2 + A.bod[2] * k * .55, gy + (A.bod[1] - A.bod[3] * .55) * k];
    const bal = [[w * .3, h * .2, '#e2626b'], [w * .56, h * .12, '#f2c25a'], [w * .76, h * .24, '#6f8faa']];
    bal.forEach(([x, y], i) => ink(g, [[x + sw * 20, y + h * .12 + fl], [hand[0], hand[1]]], { w: .9, seed: 4971 + i, p: FLAT }));
    critter(g, K, w / 2, gy, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink', rot: sw }); pawDot(g, hand[0], hand[1], w * .03, def);
    bal.forEach(([x, y, col], i) => { const b = blob(x + sw * 20, y + fl, w * .11, h * .125, 4975 + i, .04, 12); gouache(g, b, col); wash(g, b, shade(col, .3), { al: .3, seed: 4980 + i }); ink(g, b, { close: true, w: 1.3, seed: 4985 + i }); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(x + sw * 20 - w * .04, y + fl - h * .05, w * .022, h * .035, -.5, 0, TAU); g.fill(); }); return 'brb'; },
  marsh(g, w, h, t, o, K, s, def) { const gy = h * .93, S2 = fitK(K, w, h, .4, .56), k = S2 / 100, A = ANCH[K], cx = w * .32, fx = w * .76;
    gouache(g, blob(fx, gy - h * .12, w * .15, h * .14, 4990, .1, 10), '#ffd28a', .85);
    [[-1, 0], [1, 0]].forEach(([d], i) => ink(g, [[fx - w * .12, gy - 2 + d * 2], [fx + w * .12, gy - 2 - d * 2]], { w: 4, color: '#6d4c35', seed: 4991 + i, p: FLAT }));
    flame(g, fx, gy - 2, h * .26, t, 4993);
    critter(g, K, cx, gy, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'blink' });
    const hx = cx + (A.bod[0] + A.bod[2] * .8) * k, hy = gy + A.bod[1] * k, ex = fx - w * .04, ey = gy - h * .34; ink(g, [[hx, hy], [ex, ey]], { w: 1.6, color: '#8a6446', seed: 4994, p: FLAT }); pawDot(g, hx, hy, w * .03, def);
    const toast = (t * .2) % 1, mm = rbox(ex, ey - 3, w * .045, h * .04, 3, 4995); gouache(g, mm, mix('#fbf6ea', '#c98a4a', toast), 1, false); ink(g, mm, { close: true, smooth: false, w: 1.1, seed: 4996 });
    sparks(g, fx, gy, h * .2, t, 4997); return 'cosy night'; },
  hammock(g, w, h, t, o, K) { const p1 = [w * .07, h * .3], p2 = [w * .93, h * .3], sag = h * .64, sw = Math.sin(t * 1.4) * .05, ht = HT[K] || 90, wd = (CR[K] || {}).wd || 70, S2 = Math.round(Math.min(w * .62 / (ht / 100), h * .36 / (wd / 100))), k = S2 / 100;
    [p1, p2].forEach((p, i) => ink(g, [[p[0], p[1] - h * .08], [p[0] + (i ? 2 : -2), h * .97]], { w: 4.5, color: '#6d4c35', seed: 5021 + i, p: FLAT }));
    g.save(); g.translate(w / 2, h * .3); g.rotate(sw); g.translate(-w / 2, -h * .3);
    g.save(); g.translate(w / 2 + ht * k / 2, sag - wd * k * .32); g.rotate(-Math.PI / 2 - .04); critter(g, K, 0, 0, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'sleep' }); g.restore();
    const fab = [p1, [w * .26, sag + h * .04], [w * .5, sag + h * .1], [w * .74, sag + h * .04], p2, [w * .8, sag - h * .04], [w * .5, sag + h * .01], [w * .2, sag - h * .04]]; gouache(g, fab, '#d4704e'); g.save(); g.clip(toPath(fab)); for (let i = 0; i < 8; i++) ink(g, [[w * (.1 + i * .11), h * .25], [w * (.1 + i * .11), h * .9]], { w: 3, color: '#f2c25a', seed: 5023 + i, p: FLAT, alpha: .7 }); g.restore(); ink(g, fab, { close: true, w: 1.5, seed: 5031 }); g.restore();
    zzz(g, w * .3, sag - h * .2, h * .16, t); return 'nap time'; },
  kite(g, w, h, t, o, K, s, def) { const gy = h * .93, S2 = fitK(K, w, h, .34, .5), k = S2 / 100, A = ANCH[K], cx = w * .28, kx = w * .72 + Math.sin(t * 1.3) * w * .05, ky = h * .2 + Math.cos(t * 1.1) * h * .04, hand = [cx + A.bod[2] * k * .7, gy + (A.bod[1] - A.bod[3] * .5) * k];
    ink(g, [hand, [(hand[0] + kx) / 2, (hand[1] + ky) / 2 + h * .1], [kx, ky + h * .1]], { w: .9, seed: 5041, p: FLAT });
    const tl = []; for (let i = 0; i < 7; i++) tl.push([kx - i * w * .035, ky + h * .1 + i * h * .035 + Math.sin(t * 6 + i) * 3]); ink(g, tl, { w: 1, seed: 5042 }); tl.slice(1).forEach(([x, y], i) => { if (i % 2) return; gouache(g, [[x - 4, y - 3], [x, y], [x - 4, y + 3]], '#f2c25a', 1, false); gouache(g, [[x + 4, y - 3], [x, y], [x + 4, y + 3]], '#f2c25a', 1, false); });
    const kt = [[kx, ky - h * .12], [kx + w * .1, ky], [kx, ky + h * .1], [kx - w * .1, ky]]; gouache(g, kt, '#e2626b', 1, false); gouache(g, [[kx, ky - h * .12], [kx + w * .1, ky], [kx, ky]], '#f2c25a', 1, false); ink(g, [[kx, ky - h * .12], [kx, ky + h * .1]], { w: .9, seed: 5043, p: FLAT }); ink(g, [[kx - w * .1, ky], [kx + w * .1, ky]], { w: .9, seed: 5044, p: FLAT }); ink(g, kt, { close: true, smooth: false, w: 1.5, seed: 5045 });
    critter(g, K, cx, gy, S2, { t, dpr: o.dpr, v: o.v, shadow: false, st: 'open' }); pawDot(g, hand[0], hand[1], w * .028, def); return 'up we go'; }
});
S.sticker = { anim: true, bg() { return {}; },
  fg(c, w, h, t, o) { const d = o.dpr, L = o.el.layer('stk'), g = L.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, L.width, L.height); g.setTransform(d, 0, 0, d, 0, 0);
    const K = CR[o.kind] ? o.kind : 'rabbit', v = o.v || {}, def = Object.assign({}, CR[K], (COATS[K] || {})[v.coat] || {}), pose = STK[o.pose] ? o.pose : 'wave', small = Math.min(w, h) < 72, grp = !CROP[pose], full = pose === 'sign', ch = (small || full) ? h : h * .84, s = fitS([K], w, ch, .85, .74);
    if (small && !grp) { const A = ANCH[K], z = 1.6, hy = ch * .93 + A.head[1] * s / 100, hx = w / 2 + A.head[0] * s / 100; g.save(); g.translate(w / 2, h * .54); g.scale(z, z); g.translate(-hx, -hy); }
    const capt = STK[pose](g, w, ch, t, o, K, s, def), text = o.cap ? o.cap : capt;
    if (small && !grp) g.restore();
    if (!small && !full && text && text !== '-') cap(g, text, w * .5, h * .875, Math.min(h * .14, w * .17), -.05, INK, w * .88);
    const O = o.el.layer('stko'), q = O.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.clearRect(0, 0, O.width, O.height); const r = Math.max(2.2, Math.min(w, h) * .03) * d; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; q.drawImage(L, Math.cos(a) * r, Math.sin(a) * r); } q.globalCompositeOperation = 'source-in'; q.fillStyle = '#fffdf8'; q.fillRect(0, 0, O.width, O.height);
    c.save(); const pk = .88, pW = O.width, pH = O.height; c.setTransform(pk, 0, 0, pk, pW * (1 - pk) / 2, pH * (1 - pk) * .32); c.shadowColor = 'rgba(60,40,20,.3)'; c.shadowBlur = 5 * d * pk; c.shadowOffsetY = 1.5 * d * pk; c.drawImage(O, 0, 0); c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; c.drawImage(L, 0, 0); c.restore(); } };
S.gift = { anim: true, bg() { return {}; },
  fg(c, w, h, t, o) { const cyc = (t % 4.5) / 4.5, open = clamp((cyc - .2) / .18, 0, 1), cx = w / 2, by = h * .9, bw = Math.min(w * .5, h * .55), bh = bw * .66, col = o.color || '#d4704e';
    glow(c, cx, by - bh, bw * 1.3, '#ffd66e', .2 + open * .4, 'source-over');
    if (open > 0) { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * .38, rr = bw * (.5 + open * .55); c.save(); c.globalAlpha = open; c.fillStyle = '#fff6c8'; c.strokeStyle = INK; c.lineWidth = 1; star4(c, cx + Math.cos(a) * rr, by - bh + Math.sin(a) * rr, bw * .07 * (1 + .2 * Math.sin(t * 6 + i))); c.restore(); } [-1, 1].forEach((d, i) => heart(c, cx + d * bw * .32, by - bh - open * bh * (.7 + i * .25), bw * .14 * open)); confetti(c, w, h * .7, t, 4701, 14); }
    const box = [[cx - bw / 2, by - bh], [cx + bw / 2, by - bh], [cx + bw / 2 - 2, by], [cx - bw / 2 + 2, by]]; gouache(c, box, col, 1, false); wash(c, box, shade(col, .35), { al: .35, seed: 4702, smooth: false }); gouache(c, [[cx - bw * .08, by - bh], [cx + bw * .08, by - bh], [cx + bw * .08, by], [cx - bw * .08, by]], '#f2c25a', 1, false); ink(c, box, { close: true, smooth: false, w: 1.6, seed: 4703 });
    c.save(); c.translate(cx - bw * .56, by - bh); c.rotate(-open * .55); c.translate(0, -open * bh * .35); const lid = [[0, 0], [bw * 1.12, 0], [bw * 1.12, -bh * .26], [0, -bh * .26]]; gouache(c, lid, shade(col, .08), 1, false); gouache(c, [[bw * .48, 0], [bw * .64, 0], [bw * .64, -bh * .26], [bw * .48, -bh * .26]], '#f2c25a', 1, false); ink(c, lid, { close: true, smooth: false, w: 1.6, seed: 4704 });
    [[-1, -.5], [1, .5]].forEach(([d, r], i) => { const lp = blob(bw * .56 + d * bw * .14, -bh * .26 - bw * .08, bw * .14, bw * .08, 4705 + i, .08, 9, r); gouache(c, lp, '#f2c25a'); ink(c, lp, { close: true, w: 1.2, seed: 4707 + i }); }); c.restore(); } };
DECO.flowerbed = (c, hm) => local(c, hm.x, hm.y, hm.k, () => { gouache(c, rbox(-15, 1.2, 9, 2.2, 2, 2781), '#9a6e46', 1, false); const cols = ['#f0b3b6', '#f6cf6a', '#fbf3e2', '#c7b6e0']; for (let i = 0; i < 7; i++) { const x = -23 + i * 2.6, y = -2.5 - (i % 2) * 1.6; ink(c, [[x, 1], [x, y]], { w: .5, color: '#4f7a35', seed: 2782 + i }); c.fillStyle = cols[i % 4]; c.beginPath(); c.arc(x, y - .8, 1.3, 0, TAU); c.fill(); } });
DECO.pumpkins = (c, hm) => local(c, hm.x, hm.y, hm.k, () => { [[12.5, -1.8, 3.4], [18.5, -1.2, 2.5]].forEach(([x, y, r], i) => { const p = blob(x, y, r, r * .8, 2790 + i, .06, 9); gouache(c, p, '#e0873e'); wash(c, p, '#a8562c', { al: .35, seed: 2792 + i }); ink(c, p, { close: true, w: .7, seed: 2794 + i }); ink(c, [[x, y - r * .8], [x + .6, y - r * 1.25]], { w: .8, color: '#4f7a35', seed: 2796 + i }); }); });
S.cottage = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season], items = (o.items || '').split(',').filter(Boolean); paper(c, w, h, P.sky, 5201); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .38]], P.sky2, { al: .5, seed: 5209, smooth: false, off: 6, gran: .06, edge: .12 }); sun(c, w * .84, h * .15, w * .06);
    hill(c, w, h, h * .56, h * .02, .01, 5202, P.mid, { washC: P.midW, alpha: .4 });
    tree(c, w * .1, h * .86, h * .6, P, 5204);
    const gr = blob(w * .5, h * .92, w * .52, h * .1, 5203, .04, 14); gouache(c, gr, P.near); wash(c, gr, P.nearW, { al: .4, seed: 5206 }); pencil(c, gr.slice(8, 14), { w: 1, alpha: .5, seed: 5207 });
    const hm = house(c, w * .5, h * .87, Math.min(w, h) * .62, { roof: o.color || ROOF.rabbit, seed: 5205, lit: items.includes('lanterns') });
    items.forEach(n => DECO[n] && DECO[n](c, hm)); tufts(c, 0, w, h * .86, h, 30, 5208, P.shade); return { hm }; },
  fg(c, w, h, t, o) { const hm = o.meta.hm; smoke(c, hm.chim[0], hm.chim[1], w * .05, t, 5210); if (o.kind) critter(c, o.kind, w * .84, h * .95, Math.min(w, h) * .24, { t, dpr: o.dpr, v: o.v, dir: -1 }); } };
S.cart = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, P.sky, 5101); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .28], [-10, h * .34]], P.sky2, { al: .5, seed: 5100, smooth: false, off: 6, gran: .06, edge: .12 }); sun(c, w * .84, h * .15, w * .06);
    const Y = hill(c, w, h, h * .46, h * .025, .01, 5102, P.far, { washC: P.farW, alpha: .4 }); [.12, .34].forEach((x, i) => house(c, w * x, Y(w * x) + 4, w * .1, { roof: [ROOF.rabbit, ROOF.sheep][i], seed: 5103 + i }));
    hill(c, w, h, h * .62, h * .014, .008, 5105, P.near, { washC: P.nearW, line: 'ink', alpha: .7 });
    pathRibbon(c, [[-20, h * .9], [w * .3, h * .84], [w * .7, h * .88], [w + 20, h * .83]], w * .18, w * .18, P, 5106);
    const cx = w * .54, cy = h * .8, cw = w * .56, ch = h * .15, top = cy - ch - h * .26, L = cx - cw / 2, R = cx + cw / 2;
    ink(c, [[L + 4, cy - 4], [L - w * .14, cy + h * .02]], { w: 2.4, color: '#6d4c35', seed: 5107, p: FLAT }); ink(c, [[L + 4, cy - 12], [L - w * .14, cy - 6]], { w: 2.4, color: '#6d4c35', seed: 5108, p: FLAT });
    [L + 5, R - 5].forEach((x, i) => ink(c, [[x, cy - ch * .5], [x, top + 6]], { w: 2.4, color: '#6d4c35', seed: 5109 + i, p: FLAT }));
    const body = rbox(cx, cy - ch * .5, cw / 2, ch / 2, 6, 5111); gouache(c, body, '#b98a5e', 1, false); wash(c, body, '#7a5236', { al: .4, seed: 5112, smooth: false }); for (let i = 1; i < 3; i++) pencil(c, [[L + 3, cy - ch * i / 3], [R - 3, cy - ch * i / 3]], { w: .9, alpha: .55, seed: 5113 + i, passes: 1 }); ink(c, body, { close: true, smooth: false, w: 1.6, seed: 5116 });
    const cnt = cy - ch; [['#c96f4f', -.36], ['#6f8faa', -.28], ['#f2c25a', -.2]].forEach(([col, u], i) => { const r = [[cx + u * cw - 9, cnt - i * 0], [cx + u * cw + 9, cnt], [cx + u * cw + 9, cnt - 5 - i * 4.5], [cx + u * cw - 9, cnt - 5 - i * 4.5]]; });
    [['#c96f4f', 0], ['#6f8faa', 1], ['#f2c25a', 2], ['#5E7F4A', 3]].forEach(([col, i]) => { const yy = cnt - 4 - i * 4.4, r = [[cx - cw * .38, yy + 4.2], [cx - cw * .14, yy + 4.2], [cx - cw * .15, yy], [cx - cw * .37, yy]]; gouache(c, r, col, 1, false); ink(c, r, { close: true, smooth: false, w: 1, seed: 5120 + i }); });
    [[.05, '#e8d8b8'], [.16, '#d9643f'], [.27, '#e8b44e']].forEach(([u, col], i) => { const jx = cx + u * cw, j = rbox(jx, cnt - 7, 5.5, 7, 2.5, 5125 + i); gouache(c, j, '#dbe7e6', .9, false); gouache(c, rbox(jx, cnt - 5, 4.6, 4.6, 2, 5128 + i), col, .85, false); ink(c, j, { close: true, smooth: false, w: 1, seed: 5131 + i }); gouache(c, rbox(jx, cnt - 14.5, 4.6, 1.6, 1, 5134 + i), '#c49b6f', 1, false); });
    const pot = [[cx + cw * .36, cnt], [cx + cw * .44, cnt], [cx + cw * .45, cnt - 9], [cx + cw * .35, cnt - 9]]; gouache(c, pot, '#c9734a', 1, false); ink(c, pot, { close: true, smooth: false, w: 1, seed: 5137 }); [[-.3, -16], [.3, -18], [0, -21]].forEach(([d, yy], i) => { const lf = blob(cx + cw * .4 + d * 12, cnt + yy, 5, 2.4, 5138 + i, .1, 7, d * 2); gouache(c, lf, '#8fb768'); ink(c, lf, { close: true, w: .8, seed: 5141 + i }); });
    const can = [], sc = 7; for (let i = 0; i <= sc; i++) can.push([L - cw * .08 + i * (cw * 1.16 / sc), top]); const can2 = can.slice(); for (let i = sc; i >= 0; i--) { const x = L - cw * .08 + i * (cw * 1.16 / sc); can2.push([x, top + h * .05]); if (i) can2.push([x - cw * 1.16 / sc / 2, top + h * .075]); }
    const peak = [[L - cw * .08, top], [cx, top - h * .06], [R + cw * .08, top]]; const shp = peak.concat(can2.slice(sc + 1)); gouache(c, shp, '#fbf3e2', 1, false); c.save(); c.clip(toPath(shp, true, false)); for (let i = 0; i < 8; i += 2) { const x0 = L - cw * .08 + i * cw * 1.16 / 8, x1 = x0 + cw * 1.16 / 8; gouache(c, [[x0, top - h * .07], [x1, top - h * .07], [x1, top + h * .08], [x0, top + h * .08]], '#c96f4f', 1, false); } c.restore(); wash(c, shp, '#8a3e26', { al: .2, seed: 5145, smooth: false }); ink(c, shp, { close: true, smooth: false, w: 1.6, seed: 5146 });
    const sg = rbox(cx, top - h * .1, cw * .3, h * .04, 4, 5147); gouache(c, sg, '#e7c99c', 1, false); ink(c, sg, { close: true, smooth: false, w: 1.3, seed: 5148 }); ink(c, [[cx - cw * .2, top - h * .06], [cx - cw * .2, top - h * .05]], { w: 1, seed: 5149 }); ink(c, [[cx + cw * .2, top - h * .06], [cx + cw * .2, top - h * .05]], { w: 1, seed: 5150 });
    c.save(); c.fillStyle = INK; c.font = `700 ${Math.round(h * .045)}px Gaegu, cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText("Rocco's cart", cx, top - h * .1); c.restore();
    [[-.3, '#c96f4f'], [-.12, '#f2c25a'], [.32, '#6f8faa']].forEach(([u, col], i) => { const x = cx + u * cw, y0 = top + h * .07; ink(c, [[x, y0], [x + 1, y0 + h * .09]], { w: 3.4, color: col, seed: 5151 + i, p: FLAT }); ink(c, [[x + 4, y0], [x + 5, y0 + h * .075]], { w: 3.4, color: shade(col, .15), seed: 5154 + i, p: FLAT }); });
    [cx + cw * .1].forEach((x, i) => { ink(c, [[x, top + h * .07], [x, top + h * .1]], { w: .9, seed: 5157 }); const b = [[x - 4.5, top + h * .1], [x + 4.5, top + h * .1], [x + 3.8, top + h * .1 + 11], [x - 3.8, top + h * .1 + 11]]; gouache(c, b, '#ffe39a', 1, false); ink(c, b, { close: true, smooth: false, w: 1, seed: 5158 }); });
    [L + cw * .18, R - cw * .18].forEach((x, i) => { const r = ch * .45, wy = cy + 1; gouache(c, blob(x, wy, r, r, 5160 + i, .02, 12), '#a37c59', .25); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; pencil(c, [[x, wy], [x + Math.cos(a) * r, wy + Math.sin(a) * r]], { w: 1, alpha: .7, seed: 5162 + i * 9 + k, passes: 1 }); } ink(c, blob(x, wy, r, r, 5180 + i, .02, 12), { close: true, w: 2.2, color: '#5b412e', seed: 5182 + i }); c.fillStyle = '#5b412e'; c.beginPath(); c.arc(x, wy, 2.4, 0, TAU); c.fill(); });
    tufts(c, 0, w, h * .64, h, 40, 5190, P.shade); flowers(c, 0, w, h * .66, h, 12, 5191, P.flower);
    return { cx, cy, cw, ch, top }; },
  fg(c, w, h, t, o) { const { cx, cy, cw, top } = o.meta; cloud(c, ((w * .3 + t * 3) % (w + 160)) - 80, h * .1, w * .2, 25, o.dpr);
    critter(c, 'raccoon', cx - cw * .62, cy + h * .06, w * .2, { t, dpr: o.dpr, v: { outfit: 'straw', oc: '#c9543e' }, ph: .3 });
    if (o.kind) critter(c, o.kind, cx + cw * .64, cy + h * .08, w * .17, { t, dpr: o.dpr, v: o.v, dir: -1, ph: .7 });
    const lx = cx + cw * .1, ly = top + h * .1 + 6; glow(c, lx, ly, w * .07, '#ffd66e', .45 + .1 * Math.sin(t * 2), 'source-over');
    glints(c, [[cx + cw * .05, cy - h * .2], [cx + cw * .27, cy - h * .19], [cx - cw * .3, cy - h * .2]], t, 5192); } };
S.doorstep = { anim: true,
  bg(c, w, h, o) { return S.door.bg(c, w, h, o); },
  fg(c, w, h, t, o) { const s = o.meta.s, by = h * .86, k = CR[o.kind] ? o.kind : 'owl', col = o.color || '#d4704e';
    c.save(); c.fillStyle = INK; c.font = `700 ${Math.round(9 * s)}px Gaegu, cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(NAMES[k] || '', w / 2, by - 70 * s); c.restore();
    if (o.state === 'found') { const sz = Math.min(52 * s, 46 * s * 100 / (HT[k] || 90)); critter(c, k, w / 2 - 6 * s, by + 4 * s, sz, { t, dpr: o.dpr, v: o.v, st: 'open', ph: .4 }); const A = ANCH[k]; c.save(); c.translate(w / 2 - 6 * s, by + 4 * s); eyeFx(c, k, sz, 1, 'stars', t); c.restore(); }
    const px = Math.min(w / 2 + 25 * s, w - 13 * s * 1.25 - 5 * s - 10), py = by + 3.5 * s, pw = Math.min(13 * s, (w - px) * .5), ph = 9.5 * s * pw / (13 * s), bob = Math.sin(t * 2.2) * .6 * s;
    glow(c, px, py - ph, 28 * s, '#ffd66e', .3 + .1 * Math.sin(t * 2), 'source-over');
    const box = [[px - pw, py - ph * 2 + bob], [px + pw, py - ph * 2 + bob], [px + pw, py], [px - pw, py]]; gouache(c, box, col, 1, false); wash(c, box, shade(col, .35), { al: .3, seed: 5301, smooth: false });
    c.save(); c.clip(toPath(box, true, false)); c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(px - pw + hash(i, 5302) * pw * 2, py - ph * 2 + hash(i, 5303) * ph * 2, 1.2 * s, 0, TAU); c.fill(); } c.restore();
    gouache(c, [[px - pw * .15, py - ph * 2 + bob], [px + pw * .15, py - ph * 2 + bob], [px + pw * .15, py], [px - pw * .15, py]], '#f2c25a', 1, false); gouache(c, [[px - pw, py - ph + bob * .5 - ph * .12], [px + pw, py - ph + bob * .5 - ph * .12], [px + pw, py - ph + ph * .12], [px - pw, py - ph + ph * .12]], '#f2c25a', 1, false); ink(c, box, { close: true, smooth: false, w: 1.5, seed: 5304 });
    [[-1, -.5], [1, .5]].forEach(([d, r], i) => { const lp = blob(px + d * pw * .32, py - ph * 2 - ph * .3 + bob, pw * .35, ph * .28, 5305 + i, .08, 9, r); gouache(c, lp, '#f2c25a'); ink(c, lp, { close: true, w: 1.2, seed: 5307 + i }); });
    const tgx = Math.min(px + pw * 1.25, w - 5 * s - 6); ink(c, [[px + pw * .6, py - ph * 1.4 + bob], [tgx, py - ph * .6]], { w: .8, seed: 5309 }); const tg = rbox(tgx, py - ph * .3, 5 * s, 3.4 * s, 1.5 * s, 5310); gouache(c, tg, '#fbf3e2', 1, false); ink(c, tg, { close: true, smooth: false, w: 1, seed: 5311 });
    c.save(); c.fillStyle = INK; c.font = `700 ${Math.round(4 * s)}px Gaegu, cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.cap || 'for you', tgx, py - ph * .3); c.restore();
    glints(c, [[px - pw * 1.4, py - ph * 2.3], [px + pw * 1.5, py - ph * 2.6], [px + pw * .2, py - ph * 3]], t, 5312); } };
S.book = { anim: false,
  bg(c, w, h, o) { const cl = o.color || '#7d8f6a';
    if (o.state !== 'open') { const bw = Math.min(w * .62, h * .66 / 1.2), bh = bw * 1.2, x0 = w / 2 - bw / 2, y0 = h / 2 - bh / 2;
      c.save(); c.fillStyle = 'rgba(60,40,20,.18)'; c.beginPath(); c.ellipse(w / 2 + 6, y0 + bh + 6, bw * .55, 8, 0, 0, TAU); c.fill(); c.restore();
      const pg = rbox(w / 2 + 4, h / 2 + 3, bw / 2, bh / 2 - 2, 4, 5401); gouache(c, pg, '#f7efe0', 1, false); for (let i = 0; i < 4; i++) pencil(c, [[x0 + bw + 2, y0 + 8 + i * 2], [x0 + bw + 2, y0 + bh - 6 - i * 2]], { w: .6, alpha: .35, seed: 5402 + i, passes: 1 });
      const cv = rbox(w / 2, h / 2, bw / 2, bh / 2, 5, 5406); gouache(c, cv, cl, 1, false); wash(c, cv, shade(cl, .35), { al: .35, seed: 5407, smooth: false, gran: .3 });
      c.save(); c.clip(toPath(cv, true, false)); for (let i = 0; i < 40; i++) pencil(c, [[x0 - 10 + i * bw / 20, y0], [x0 - 10 + i * bw / 20 - bh * .3, y0 + bh]], { w: .6, color: shade(cl, .4), alpha: .25, seed: 5410 + i, passes: 1 }); gouache(c, [[x0, y0], [x0 + bw * .1, y0], [x0 + bw * .1, y0 + bh], [x0, y0 + bh]], shade(cl, .25), .6, false); c.restore(); ink(c, cv, { close: true, smooth: false, w: 1.6, seed: 5450 });
      const lb = rbox(w / 2 + bw * .05, y0 + bh * .24, bw * .34, bh * .09, 3, 5451); gouache(c, lb, '#fbf6ea', 1, false); ink(c, lb, { close: true, smooth: false, w: 1, seed: 5452 });
      c.save(); c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `400 ${Math.round(bw * .075)}px 'Young Serif', Georgia, serif`; c.fillText(o.name || 'The Thursday Lot', w / 2 + bw * .05, y0 + bh * .225); c.font = `700 ${Math.round(bw * .06)}px Gaegu, cursive`; c.fillText('our year · 2026', w / 2 + bw * .05, y0 + bh * .285); c.restore();
      const wn = rbox(w / 2 + bw * .05, y0 + bh * .62, bw * .25, bh * .22, 3, 5453); gouache(c, wn, '#f7efe0', 1, false); ink(c, wn, { close: true, smooth: false, w: 1, seed: 5454 }); local(c, w / 2 + bw * .05, y0 + bh * .8, bh * .4 / 85, () => PRESSED.daisy(c));
    } else { const bw = Math.min(w * .9, h * 1.5), bh = bw * .52, x0 = w / 2 - bw / 2, y0 = h / 2 - bh / 2;
      c.save(); c.fillStyle = 'rgba(60,40,20,.16)'; c.beginPath(); c.ellipse(w / 2, y0 + bh + 4, bw * .48, 6, 0, 0, TAU); c.fill(); c.restore();
      gouache(c, rbox(w / 2, h / 2 + 3, bw / 2 + 3, bh / 2 + 1, 4, 5460), cl, 1, false);
      [[x0, w / 2, -1], [w / 2, x0 + bw, 1]].forEach(([a, b, d], i) => { const pgp = [[a, y0 + (d < 0 ? 4 : 0)], [(a + b) / 2, y0 - 3], [b, y0 + (d < 0 ? 0 : 4)], [b, y0 + bh - (d < 0 ? 0 : 3)], [(a + b) / 2, y0 + bh - 6], [a, y0 + bh - (d < 0 ? 3 : 0)]]; gouache(c, pgp, '#fbf6ea'); ink(c, pgp, { close: true, w: 1.1, seed: 5461 + i }); });
      c.save(); const gr = c.createLinearGradient(w / 2 - 14, 0, w / 2 + 14, 0); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(.5, 'rgba(60,40,20,.18)'); gr.addColorStop(1, 'rgba(60,40,20,0)'); c.fillStyle = gr; c.fillRect(w / 2 - 14, y0, 28, bh); c.restore();
      local(c, x0 + bw * .2, y0 + bh * .88, bh * .7 / 85, () => PRESSED[o.name || 'poppy'] ? PRESSED[o.name || 'poppy'](c) : PRESSED.poppy(c));
      for (let i = 0; i < 4; i++) pencil(c, [[x0 + bw * .32, y0 + bh * (.3 + i * .12)], [x0 + bw * .45, y0 + bh * (.3 + i * .12)]], { w: .8, alpha: .6, seed: 5470 + i, passes: 1 });
      [[.6, .3, -.04], [.8, .55, .05]].forEach(([u, v, r], i) => { c.save(); c.translate(x0 + bw * u, y0 + bh * v); c.rotate(r); const pw = bw * .15, phh = bh * .3; c.fillStyle = '#e8ddcb'; c.fillRect(-pw / 2, -phh / 2, pw, phh); for (let j = 0; j < 8; j++) pencil(c, [[-pw / 2 + j * pw / 7, -phh / 2], [-pw / 2 + j * pw / 7 - phh * .4, phh / 2]], { w: .6, color: '#b5a68e', alpha: .5, seed: 5480 + i * 9 + j, passes: 1 }); c.strokeStyle = 'rgba(42,34,29,.5)'; c.lineWidth = .8; c.strokeRect(-pw / 2, -phh / 2, pw, phh); c.fillStyle = 'rgba(232,180,78,.5)'; c.fillRect(-pw * .3, -phh / 2 - 3, pw * .6, 6); c.restore(); });
      c.save(); c.fillStyle = '#4a3f37'; c.font = `700 ${Math.round(bh * .08)}px Gaegu, cursive`; c.fillText('picnic by the river', x0 + bw * .58, y0 + bh * .86); c.restore(); }
    return {}; } };


/* ---------- final pass: poses, spots, photos, porch, letters, move-in, empty cottage ---------- */
Object.assign(ICONS, {
  search(c, lw, col) { ink(c, blob(42, 42, 24, 24, 7001, .03, 10), { close: true, w: lw, color: col, seed: 7002 }); ink(c, [[60, 60], [84, 84]], { w: lw * 1.3, color: col, seed: 7003, p: FLAT }); },
  pin(c, lw, col) { ink(c, [[50, 62], [50, 90]], { w: lw, color: col, seed: 7010, p: FLAT }); ink(c, [[30, 62], [70, 62], [62, 46], [62, 22], [38, 22], [38, 46]], { close: true, smooth: false, w: lw, color: col, seed: 7011 }); },
  reply(c, lw, col) { ink(c, [[40, 22], [14, 46], [40, 70]], { w: lw, color: col, seed: 7020 }); ink(c, [[16, 46], [56, 46], [78, 56], [86, 80]], { w: lw, color: col, seed: 7021 }); },
  trash(c, lw, col) { ink(c, [[24, 30], [76, 30], [70, 88], [30, 88]], { close: true, smooth: false, w: lw, color: col, seed: 7030 }); ink(c, [[16, 30], [84, 30]], { w: lw, color: col, seed: 7031, p: FLAT }); ink(c, [[40, 30], [42, 16], [58, 16], [60, 30]], { w: lw * .9, color: col, seed: 7032 }); },
  link(c, lw, col) { ink(c, blob(36, 58, 20, 12, 7040, .03, 10, -.78), { close: true, w: lw, color: col, seed: 7041 }); ink(c, blob(64, 42, 20, 12, 7042, .03, 10, -.78), { close: true, w: lw, color: col, seed: 7043 }); },
  flag(c, lw, col) { ink(c, [[26, 90], [26, 14]], { w: lw, color: col, seed: 7050, p: FLAT }); ink(c, [[26, 18], [48, 12], [62, 22], [82, 18], [82, 52], [62, 56], [46, 46], [26, 52]], { close: true, w: lw, color: col, seed: 7051 }); },
  block(c, lw, col) { ink(c, blob(50, 50, 36, 36, 7060, .02, 12), { close: true, w: lw, color: col, seed: 7061 }); ink(c, [[25, 75], [75, 25]], { w: lw, color: col, seed: 7062, p: FLAT }); },
  share(c, lw, col) { ink(c, [[50, 62], [50, 12]], { w: lw, color: col, seed: 7070, p: FLAT }); ink(c, [[32, 28], [50, 10], [68, 28]], { w: lw, color: col, seed: 7071 }); ink(c, [[34, 42], [20, 42], [20, 88], [80, 88], [80, 42], [66, 42]], { w: lw, color: col, seed: 7072, smooth: false }); },
  gear(c, lw, col) { const p = []; for (let k = 0; k < 32; k++) { const a = k / 32 * TAU, r = (k % 4 < 2) ? 38 : 30; p.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]); } ink(c, p, { close: true, smooth: false, w: lw, color: col, seed: 7080 }); ink(c, blob(50, 50, 12, 12, 7081, .03, 9), { close: true, w: lw, color: col, seed: 7082 }); },
  ear(c, lw, col) { ink(c, [[34, 40], [36, 24], [52, 14], [70, 22], [74, 42], [64, 58], [58, 72], [48, 86], [34, 82]], { w: lw, color: col, seed: 7090 }); ink(c, [[46, 42], [52, 32], [62, 36], [60, 50]], { w: lw * .85, color: col, seed: 7091 }); },
  muted(c, lw, col) { ICONS.mic(c, lw, col); ink(c, [[18, 16], [84, 86]], { w: lw * 1.1, color: col, seed: 7095, p: FLAT }); },
  people(c, lw, col) { ink(c, blob(36, 34, 13, 14, 7100, .04, 9), { close: true, w: lw, color: col, seed: 7101 }); ink(c, [[12, 84], [16, 62], [36, 54], [56, 62], [60, 84]], { w: lw, color: col, seed: 7102 }); ink(c, blob(68, 32, 11, 12, 7103, .04, 9), { close: true, w: lw * .9, color: col, seed: 7104 }); ink(c, [[64, 52], [80, 56], [88, 80]], { w: lw * .9, color: col, seed: 7105 }); },
  check(c, lw, col) { ink(c, [[18, 52], [40, 74], [84, 26]], { w: lw * 1.2, color: col, seed: 7110, smooth: false }); },
  clock(c, lw, col) { ink(c, blob(50, 50, 36, 36, 7120, .02, 12), { close: true, w: lw, color: col, seed: 7121 }); ink(c, [[50, 26], [50, 52], [66, 62]], { w: lw, color: col, seed: 7122, smooth: false }); },
  heart(c, lw, col) { const p = [[50, 86], [20, 58], [12, 38], [20, 20], [38, 16], [50, 30], [62, 16], [80, 20], [88, 38], [80, 58]]; gouache(c, p, '#e8857c'); wash(c, p, '#b8483e', { al: .35, seed: 7131 }); ink(c, p, { close: true, w: lw, seed: 7132 }); },
  key(c, lw, col) { ink(c, blob(32, 50, 18, 18, 7140, .03, 10), { close: true, w: lw, color: col, seed: 7141 }); ink(c, [[50, 50], [88, 50]], { w: lw, color: col, seed: 7142, p: FLAT }); ink(c, [[76, 50], [76, 64]], { w: lw, color: col, seed: 7143, p: FLAT }); ink(c, [[86, 50], [86, 60]], { w: lw, color: col, seed: 7144, p: FLAT }); },
  play(c, lw, col) { c.fillStyle = col; c.beginPath(); c.moveTo(34, 22); c.lineTo(80, 50); c.lineTo(34, 78); c.closePath(); c.fill(); },
  more(c, lw, col) { c.fillStyle = col; [26, 50, 74].forEach(x => { c.beginPath(); c.arc(x, 50, lw * 2.2, 0, TAU); c.fill(); }); }
});
const SZ = k => (CR[k] && CR[k].stage) || { rabbit: .5, hedgehog: .78, frog: .78, mole: .62, sheep: .66, owl: .58 }[k] || .6;
const FLIP = k => (k === 'hedgehog' || k === 'sheep') ? -1 : 1;
function ground(c, w, h, y, P, seed, k = .42) { const g = blob(w * .5, y, w * k, h * .06, seed, .05, 14); gouache(c, g, P.near); wash(c, g, P.nearW, { al: .4, seed: seed + 1 }); pencil(c, g.slice(0, 8), { w: 1, alpha: .5, seed: seed + 2 }); tufts(c, w * .2, w * .8, y - h * .03, y + h * .03, 10, seed + 3, P.shade); }
function defOf(K, v) { return Object.assign({}, CR[K], (COATS[K] || {})[(v || {}).coat] || {}); }
S.pose = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season], p = o.pose || 'awake'; if (o.color === 'none' && p !== 'widget' && p !== 'fire') return {};
    if (p === 'widget') { c.fillStyle = '#262a46'; c.fillRect(0, 0, w, h); stars(c, 0, 0, w, h * .4, 6, 0, 6150); return {}; }
    paper(c, w, h, p === 'fire' ? '#eadcc6' : '#f6efe3', 6101); ground(c, w, h, h * .86, P, 6110, p === 'fire' ? .48 : .4);
    if (p === 'fire') firering(c, w * .74, h * .85, w * .12, 6103, false);
    return {}; },
  fg(c, w, h, t, o) { const K = CR[o.kind] ? o.kind : 'rabbit', p = o.pose || 'awake', D = o.dpr, dir = FLIP(K), gy = h * .86, sz = fitS([K], w, h, .8, .7);
    if (p === 'awake') critter(c, K, w * .5, gy, sz, { t, dpr: D, dir, shadow: false, v: o.v });
    else if (p === 'sleep') { critter(c, K, w * .5, gy, sz, { t, dpr: D, dir, shadow: false, sleep: true, v: o.v }); zzz(c, w * .5 + sz * .28, gy - sz * .9, sz * .22, t); }
    else if (p === 'wave' || p === 'hug') { const s = fitS([K], w, h, .8, .7); STK[p](c, w, h * .86 / .93, t, o, K, s, defOf(K, o.v)); }
    else if (p === 'fire') { const fl = 1 + noise1(t * 5, 3) * .05; critter(c, K, w * .38, gy, sz * .82, { t, dpr: D, dir: 1, shadow: false, v: o.v });
      night(o.el, c, w, h, [{ x: w * .7, y: h * .76, r: w * .95 * fl, k: 1, color: '#ff9a45', a: .3 }], .85); glow(c, w * .74, h * .74, w * .36 * fl, '#ffb050', .5); flame(c, w * .74, h * .84, w * .17, t, 5); sparks(c, w * .74, h * .84, w * .13, t, 6); }
    else if (p === 'walk') { const hop = Math.abs(Math.sin(t * 5)) * sz * .06, tl = Math.sin(t * 5) * .05;
      for (let i = 0; i < 3; i++) { const ph = (t * .9 + i / 3) % 1; c.save(); c.globalAlpha = (1 - ph) * .6; pencil(c, blob(w * .5 - sz * .3 - ph * w * .25, gy - 3 - ph * 4, 2 + ph * 4, 1.5 + ph * 3, 6160 + i, .2, 7), { close: true, w: .8, color: '#8a7f75', alpha: .8, seed: 6160 + i, passes: 1 }); c.restore(); }
      critter(c, K, w * .52, gy - hop, sz * .9, { t, dpr: D, dir: 1, shadow: false, v: o.v, rot: tl }); }
    else if (p === 'widget') { const x = w * .5, y = h * .62, r = Math.min(w, h) * .3; glow(c, x, y, r * 1.6, '#ffc768', .45); const win = [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]; gouache(c, win, '#ffdc84', 1, false); ink(c, win, { close: true, smooth: false, w: 1.2, seed: 6170 });
      c.save(); c.beginPath(); c.rect(x - r, y - r, r * 2, r * 2); c.clip(); critter(c, K, x, y + r * 1.1, fitS([K], r * 2, r * 2, 1, 1.25), { t, dpr: D, dir, shadow: false, v: o.v }); c.restore(); }
  } };
const SPOTS = { notif: ['owl', 'bell'], photos: ['frog', 'photo'], contacts: ['mouse', 'envelope'], location: ['fox', 'lantern'], error: ['duck', 'raincloud'], offline: ['capybara', 'moon'], empty: ['mouse', 'leaf'], search: ['badger', 'search'], blocked: ['cat', 'door'], left: ['otter', 'door'], report: ['bear', 'flag'], upload: ['tortoise', 'photo'], code: ['owl', 'envelope'], done: ['rabbit', 'sparkle'], media: ['frog', 'camera'], pinned: ['mouse', 'pin'], removed: ['badger', 'leaf'], account: ['raccoon', 'key'], letter: ['sheep', 'envelope'] };
S.spot = { anim: true,
  bg(c, w, h, o) { ground(c, w, h, h * .86, SEASONS[o.season], 6201 + (o.name || '').length, .44); return {}; },
  fg(c, w, h, t, o) { const sp = SPOTS[o.name] || SPOTS.done, K = CR[o.kind] ? o.kind : sp[0], sz = fitS([K], w * .62, h, .9, .66), sl = o.state === 'sleep' || o.name === 'offline', dir = FLIP(K);
    critter(c, K, w * .4, h * .86, sz, { t, dpr: o.dpr, dir, shadow: false, sleep: sl, v: o.v }); if (sl) zzz(c, w * .4 + sz * .28, h * .86 - sz * .9, sz * .22, t);
    const ps = Math.min(w, h) * .34, bob = Math.sin(t * 1.6) * ps * .06, px = w * .74, py = h * .34 + bob; glow(c, px, py, ps * .95, '#ffd66e', .32, 'source-over');
    local(c, px - ps / 2, py - ps / 2, ps / 100, () => ICONS[sp[1]](c, clamp(ps / 22, 1.2, 2.6), INK)); } };
S.snap = { anim: false,
  bg(c, w, h, o) { const P = SEASONS[o.season], n = o.name || 'allotment', dusk = n === 'dusk';
    paper(c, w, h, dusk ? '#efd2b8' : P.sky, 6301);
    wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .5], [-10, h * .56]], dusk ? '#e59a6e' : P.sky2, { al: .5, seed: 6302, smooth: false, off: 6, gran: .05, edge: .1 });
    sun(c, w * .72, h * (dusk ? .46 : .2), Math.min(w, h) * .08);
    hill(c, w, h, h * .5, h * .04, 2.4 / w, 6303, P.far, { washC: P.farW, alpha: .4 });
    hill(c, w, h, h * .64, h * .025, 1.6 / w, 6304, P.near, { washC: P.nearW, line: 'ink', alpha: .6 });
    if (n === 'river') { pond(c, w * .5, h * .84, w * .44, h * .1, P, 6305); tree(c, w * .14, h * .7, h * .7, P, 6306); }
    else if (n === 'picnic') { const b = [[w * .2, h * .74], [w * .78, h * .72], [w * .86, h * .92], [w * .12, h * .94]]; gouache(c, b, '#e5928a', 1, false); wash(c, b, '#b8483e', { al: .3, seed: 6307, smooth: false });
      for (let i = 1; i < 5; i++) { pencil(c, [[lerp(w * .2, w * .12, i / 5 * 0) + (w * .58) * i / 5 + w * .2 - w * .2, h * .73], [w * .12 + w * .74 * i / 5, h * .93]], { w: 1.4, color: '#fbf3e2', alpha: .9, seed: 6308 + i, passes: 1 }); }
      pencil(c, [[w * .16, h * .83], [w * .82, h * .82]], { w: 1.4, color: '#fbf3e2', alpha: .9, seed: 6315, passes: 1 }); ink(c, b, { close: true, smooth: false, w: 1.2, seed: 6316 });
      const bk = blob(w * .62, h * .76, w * .1, h * .06, 6317, .05, 10); gouache(c, bk, '#c9a26e'); wash(c, bk, '#7a5a3a', { al: .4, seed: 6318 }); ink(c, bk, { close: true, w: 1.2, seed: 6319 }); ink(c, [[w * .54, h * .74], [w * .62, h * .64], [w * .7, h * .74]], { w: 1.3, seed: 6320 }); }
    else if (n === 'garden') { fence(c, w * .04, w * .96, h * .74, 6321); flowers(c, 0, w, h * .78, h, 34, 6322, '#f0b3b6'); flowers(c, 0, w, h * .8, h, 20, 6323, P.flower || '#f6f0e2'); }
    else { patch(c, w * .5, h * .82, w * .7, h * .16, P, 6330); stake(c, w * .18, h * .76, h * .18, 6331); }
    tufts(c, 0, w, h * .66, h, 24, 6340, P.shade); return {}; } };
S.porch = { anim: true,
  bg(c, w, h, o) { const cast = o.cast.length ? o.cast : [{ kind: 'rabbit' }, { kind: 'owl' }], roof = ROOF[cast[0].kind] || '#c96f4f', wy = h * .74;
    paper(c, w, h, '#efe4d0', 6401);
    const wall = [[-10, wy], [-10, -10], [w + 10, -10], [w + 10, wy]]; gouache(c, wall, '#f1e3c9', 1, false); wash(c, wall, '#cdb48f', { al: .35, seed: 6402, smooth: false, off: 3 });
    for (let i = 0; i < 8; i++) pencil(c, [[-10, h * .14 + i * h * .08], [w + 10, h * .14 + i * h * .08 + 2]], { w: .7, alpha: .16, seed: 6403 + i, passes: 1 });
    const win = [[w * .07, h * .22], [w * .3, h * .22], [w * .3, h * .46], [w * .07, h * .46]]; gouache(c, win, o.night ? '#ffd877' : '#d2dfe0', 1, false); ink(c, win, { close: true, smooth: false, w: 1.4, seed: 6420 });
    pencil(c, [[w * .185, h * .22], [w * .185, h * .46]], { w: .9, alpha: .8, seed: 6426, passes: 1 }); pencil(c, [[w * .07, h * .34], [w * .3, h * .34]], { w: .9, alpha: .8, seed: 6427, passes: 1 });
    const d = [[w * .72, wy], [w * .72, h * .3], [w * .8, h * .22], [w * .88, h * .3], [w * .88, wy]]; gouache(c, d, roof); wash(c, d, shade(roof, .35), { al: .4, seed: 6421 }); ink(c, d, { w: 1.5, seed: 6422 });
    c.fillStyle = '#e8b44e'; c.beginPath(); c.arc(w * .855, h * .52, 2.4, 0, TAU); c.fill();
    const eave = [[-10, -10], [w + 10, -10], [w + 10, h * .1], [-10, h * .12]]; gouache(c, eave, roof, 1, false); wash(c, eave, shade(roof, .35), { al: .45, seed: 6423, smooth: false }); ink(c, [[-10, h * .12], [w + 10, h * .1]], { w: 1.6, seed: 6424 });
    [w * .04, w * .96].forEach((x, i) => { const p = [[x - 4, h * .11], [x + 4, h * .11], [x + 4, wy], [x - 4, wy]]; gouache(c, p, '#c49b6f', 1, false); ink(c, p, { close: true, smooth: false, w: 1.2, seed: 6428 + i }); });
    const fl = [[-10, wy], [w + 10, wy], [w + 10, h + 10], [-10, h + 10]]; gouache(c, fl, '#c49b6f', 1, false); wash(c, fl, '#6d4c35', { al: .35, seed: 6425, smooth: false });
    for (let i = 1; i < 4; i++) pencil(c, [[-10, wy + i * (h - wy) / 4], [w + 10, wy + i * (h - wy) / 4 + 1]], { w: .9, alpha: .5, seed: 6430 + i, passes: 1 }); ink(c, [[-10, wy], [w + 10, wy]], { w: 1.4, seed: 6435 });
    const by = h * .8, b0 = w * .16, b1 = w * .84, bk = [[b0, by - h * .2], [b1, by - h * .2], [b1, by - h * .17], [b0, by - h * .17]], st = [[b0 - 4, by - h * .1], [b1 + 4, by - h * .1], [b1 + 4, by - h * .075], [b0 - 4, by - h * .075]];
    [bk, st].forEach((p, i) => { gouache(c, p, '#a37c59', 1, false); wash(c, p, '#5a3d28', { al: .35, seed: 6440 + i, smooth: false }); ink(c, p, { close: true, smooth: false, w: 1.3, seed: 6442 + i }); });
    [b0 + 8, b1 - 8].forEach((x, i) => { ink(c, [[x, by - h * .2], [x, by - h * .075]], { w: 2, color: '#5a3d28', seed: 6444 + i, p: FLAT }); ink(c, [[x, by - h * .075], [x - 2, by + 2]], { w: 2.2, color: '#5a3d28', seed: 6446 + i, p: FLAT }); });
    const pot = [[w * .9, wy + 4], [w * .98, wy + 4], [w * .97, wy + 22], [w * .91, wy + 22]]; gouache(c, pot, '#c9734e', 1, false); ink(c, pot, { close: true, smooth: false, w: 1.1, seed: 6450 });
    [[-.4, 1.2], [0, 1.5], [.4, 1.1]].forEach(([dx, hh], i) => { const lf = blob(w * .94 + dx * 12, wy - hh * 9, 4.5, 9, 6451 + i, .1, 8, dx); gouache(c, lf, '#86b05e'); ink(c, lf, { close: true, w: .9, seed: 6455 + i }); });
    return { seatY: by - h * .1, cast }; },
  fg(c, w, h, t, o) { const m = o.meta, cast = m.cast, sy = m.seatY, s = h * .3;
    (o.state === 'empty' ? [] : cast.slice(0, 2)).forEach((v, i) => { const K = CR[v.kind] ? v.kind : 'rabbit', fl = FLIP(K), dir = i === 0 ? (fl === -1 ? 1 : 1) : -1; critter(c, K, w * (i ? .66 : .34), sy, s * Math.min(1.25, SZ(K) / .6), { t, dpr: o.dpr, dir: (K === 'hedgehog' || K === 'sheep') ? (i ? -1 : 1) : 1, shadow: false, v, sleep: v.sleep, ph: i * .5 }); if (v.sleep) zzz(c, w * (i ? .64 : .36) + s * .2, sy - s * .7, s * .18, t); });
    [[w * .5 - 10, sy - 1], [w * .5 + 8, sy - 1]].forEach(([x, y], i) => { const mg = [[x - 5, y - 11], [x + 5, y - 11], [x + 4.5, y], [x - 4.5, y]]; gouache(c, mg, i ? '#6f8faa' : '#c96f4f', 1, false); ink(c, mg, { close: true, smooth: false, w: 1, seed: 6460 + i }); smoke(c, x, y - 12, 8, t + i * 2, 6462 + i); });
    const lx = w * .5, ly = h * .2; ink(c, [[lx, h * .1], [lx, ly - 10]], { w: 1, seed: 6470 }); lantern(c, lx, ly, 22, t);
    if (o.night) { night(o.el, c, w, h, [{ x: lx, y: ly, r: w * .7, k: 1, color: '#ffc768', a: .3 }, { x: w * .185, y: h * .34, r: w * .3, k: .8, color: '#ffc768', a: .2 }], .82); glow(c, lx, ly, 40, '#ffd170', .7); }
    else glow(c, lx, ly, 24, '#ffd170', .35, 'source-over');
  } };
S.writing = { anim: true, bg() { return {}; },
  fg(c, w, h, t, o) { const K = CR[o.kind] ? o.kind : 'rabbit', C = CR[K], size = h * 1.5 * (C.az || 1), px = w * .46, pw = w * .48, py = h * .2, ph = h * .62;
    c.save(); c.beginPath(); c.arc(h * .5, h * .5, h * .5, 0, TAU); c.clip(); c.fillStyle = C.tint || '#efe4d0'; c.fillRect(0, 0, h, h);
    const sp = critterSprite(K, Math.round(size), 'open', FLIP(K), o.dpr, o.v), kk = size / 100; c.drawImage(sp.cv, h * .5 - C.head[0] * kk * FLIP(K) - sp.ox, h * .58 - C.head[1] * kk - sp.oy, sp.W, sp.H); c.restore();
    const pp = [[px, py], [px + pw, py - 2], [px + pw + 2, py + ph], [px + 1, py + ph + 1]]; gouache(c, pp, '#fffaf0', 1, false); ink(c, pp, { close: true, smooth: false, w: 1, seed: 6501 });
    const cyc = (t * .4) % 1; let tip = [px + pw * .12, py + ph * .3];
    for (let r = 0; r < 3; r++) { const pr = clamp(cyc * 3.4 - r, 0, 1); if (pr <= 0) continue; const y = py + ph * (.3 + r * .22), x0 = px + pw * .12, x1 = x0 + pw * .74 * pr * (r === 2 ? .55 : 1); pencil(c, [[x0, y], [(x0 + x1) / 2, y + (hash(r, 7) - .5) * 2], [x1, y]], { w: 1, alpha: .85, seed: 6502 + r, passes: 1 }); tip = [x1, y]; }
    local(c, tip[0], tip[1], 1, () => { c.rotate(-.6); const pn = [[0, 0], [3, -4], [3, -20], [-3, -20], [-3, -4]]; gouache(c, pn, '#e8b44e', 1, false); ink(c, pn, { close: true, smooth: false, w: .9, seed: 6510 }); }); } };
function bunting(c, x0, y0, x1, y1, sag, n, seed) { const P = []; for (let i = 0; i <= 20; i++) { const u = i / 20; P.push([lerp(x0, x1, u), lerp(y0, y1, u) + Math.sin(u * Math.PI) * sag]); } ink(c, P, { w: 1, seed, p: FLAT }); const cols = ['#e2626b', '#f2c25a', '#6f8faa', '#8fb768', '#f0b3b6'];
  for (let i = 0; i < n; i++) { const u = (i + .5) / n, x = lerp(x0, x1, u), y = lerp(y0, y1, u) + Math.sin(u * Math.PI) * sag, s = Math.abs(x1 - x0) / n * .42, tri = [[x - s, y], [x + s, y], [x, y + s * 1.6]]; gouache(c, tri, cols[i % 5], 1, false); ink(c, tri, { close: true, smooth: false, w: .8, seed: seed + i + 1 }); } }
S.movein = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, P.sky, 6601); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .36]], P.sky2, { al: .5, seed: 6602, smooth: false, off: 6, gran: .06, edge: .12 }); sun(c, w * .82, h * .14, w * .06);
    const Y = hill(c, w, h, h * .58, h * .02, .01, 6603, P.mid, { washC: P.midW, alpha: .4 }), hm = house(c, w * .5, Y(w * .5) + 6, w * .34, { roof: ROOF[o.kind] || '#5f8a8b', seed: 6604 });
    bunting(c, -4, hm.peak[1] + w * .1, hm.peak[0], hm.peak[1] + 4, w * .05, 6, 6610); bunting(c, hm.peak[0], hm.peak[1] + 4, w + 4, hm.peak[1] + w * .12, w * .05, 6, 6620);
    hill(c, w, h, h * .7, h * .012, .007, 6605, P.near, { washC: P.nearW, line: 'ink', alpha: .7 }); pathRibbon(c, [[w * .5, h + 10], [w * .46, h * .86], [w * .5, Y(w * .5) + 4]], w * .3, w * .06, P, 6606);
    tufts(c, 0, w, h * .72, h, 40, 6607, P.shade); flowers(c, 0, w, h * .74, h, 16, 6608, P.flower); return { hm }; },
  fg(c, w, h, t, o) { const K = CR[o.kind] ? o.kind : 'duck', D = o.dpr; smoke(c, o.meta.hm.chim[0], o.meta.hm.chim[1], w * .04, t, 6630);
    o.cast.forEach((v, i) => { const x = w * [.12, .3, .7, .88, .2, .8][i % 6], y = h * (i < 4 ? .92 : .8), s = w * .17 * SZ(v.kind) / .6, hop = Math.abs(Math.sin(t * 4 + i * 1.3)) * 7; critter(c, v.kind, x, y - hop, s, { t, dpr: D, dir: x < w / 2 ? 1 : -1, v, ph: i * .3 }); });
    critter(c, K, w * .5, h * .84, w * .26 * SZ(K) / .6, { t, dpr: D, v: o.v, ph: .1 }); confetti(c, w, h, t, 6640, 20); } };
S.leftcot = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; paper(c, w, h, P.sky, 6701); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .36]], P.sky2, { al: .45, seed: 6702, smooth: false, off: 6, gran: .06, edge: .12 });
    const Y = hill(c, w, h, h * .6, h * .02, .01, 6703, P.mid, { washC: P.midW, alpha: .4 }), roof = mix(ROOF[o.kind] || '#9b7454', '#b9b2a8', .45), hm = house(c, w * .5, Y(w * .5) + 6, w * .4, { roof, seed: 6704, chimney: true });
    const k = hm.k; [[-24, -6], [-20, -14], [-23, -22], [-17, -28], [-12, -33]].forEach(([x, y], i) => { const lf = blob(w * .5 + x * k, hm.door[1] + (y + 9) * k, 3.6 * k, 2.4 * k, 6710 + i, .1, 7, i); gouache(c, lf, '#7ea85a'); ink(c, lf, { close: true, w: .7, seed: 6720 + i }); });
    const cur = [[hm.win[0] - hm.winR, hm.win[1] - hm.winR], [hm.win[0] + hm.winR, hm.win[1] - hm.winR], [hm.win[0] + hm.winR, hm.win[1] + hm.winR], [hm.win[0] - hm.winR, hm.win[1] + hm.winR]]; gouache(c, cur, '#d9b8a8', .95, false);
    const sx = hm.door[0], sy = hm.door[1] - 2 * k, sg = [[sx - 13 * k, sy - 4 * k], [sx + 13 * k, sy - 5 * k], [sx + 13 * k, sy + 4 * k], [sx - 13 * k, sy + 5 * k]]; gouache(c, sg, '#fbf3e2', 1, false); ink(c, sg, { close: true, smooth: false, w: 1, seed: 6730 });
    c.save(); c.fillStyle = INK; c.font = '700 ' + Math.round(6.4 * k) + 'px Gaegu, cursive'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('gone wandering', sx, sy); c.restore();
    hill(c, w, h, h * .72, h * .012, .007, 6705, P.near, { washC: P.nearW, line: 'ink', alpha: .7 }); tufts(c, 0, w, h * .74, h, 40, 6706, P.shade); flowers(c, 0, w, h * .76, h, 12, 6707, P.flower);
    const lx = sx + 22 * k, ly = hm.door[1] + 9 * k; return { hm, lx, ly }; },
  fg(c, w, h, t, o) { const m = o.meta; lantern(c, m.lx, m.ly, 10, t); glow(c, m.lx, m.ly - 4, 28 + Math.sin(t * 2) * 2, '#ffd170', .55, 'source-over'); fireflies(c, 3, w * .2, h * .55, w * .8, h * .8, t, 6740); } };
function mist(c, w, h, t) { for (let i = 0; i < 4; i++) { const y = h * (.35 + i * .16), x = ((t * (6 + i * 2) + i * 140) % (w + 300)) - 150; c.save(); c.globalAlpha = .55; const g = c.createRadialGradient(x, y, 0, x, y, w * .7); g.addColorStop(0, 'rgba(240,241,238,.95)'); g.addColorStop(1, 'rgba(240,241,238,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore(); } c.save(); c.fillStyle = 'rgba(236,236,232,.38)'; c.fillRect(0, 0, w, h); c.restore(); }
function revealMask(c, w, h, p, d) { if (p >= 1) return; const R = Math.hypot(w, h) * .62 * p, cx = w * .5, cy = h * .62, pts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU, r = R * (1 + (hash(k, 77) - .5) * .25); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * .9]); }
  c.save(); c.setTransform(d, 0, 0, d, 0, 0); c.globalCompositeOperation = 'destination-in'; c.fillStyle = '#000'; if (R > 1) c.fill(toPath(pts)); else c.fillRect(0, 0, 0, 0); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#F2EADC'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
  if (R > 1) pencil(c, pts, { close: true, w: 1.2, alpha: .55, seed: 78, passes: 2 }); c.restore(); }


const MOUTH = { rabbit: [0, -66.5, 1], sheep: [30.5, -45, .8], frog: [0, -25.5, 1.5], owl: [0, -49.5, 1.1], hedgehog: [40, -15, .8], mole: [0, -55, .9] };
const EYEBG = K => { const d = CR[K]; return K === 'sheep' ? [d.face, '#f6efe2'] : K === 'owl' ? [d.disc, INK] : K === 'hedgehog' ? [d.face, INK] : [d.fill, INK]; };
function talkAmt(t, seed) { const gate = noise1(t * 1.3, seed) > -.35 ? 1 : 0, syl = .5 + .5 * Math.sin(t * 13 + noise1(t * 2, seed + 3) * 4); return gate * clamp(syl * (.55 + .45 * (noise1(t * 9, seed + 1) * .5 + .5)), 0, 1); }
function faceFx(c, K, x, y, s, dir, st, emo, t, seed) { const A = ANCH[K]; if (!A) return; const Mo = MOUTH[K] || [A.eyes.reduce((s, e) => s + e[0], 0) / A.eyes.length, A.eyes[0][1] + A.er * 3.8, 1]; const k = s / 100, r = A.er * k, [bg, eyeC] = EYEBG(K);
  const eyesUp = emo === 'laugh' || emo === 'joy' || emo === 'tender';
  if (eyesUp) A.eyes.forEach(([ex, ey]) => { const ex2 = x + ex * k * dir, ey2 = y + ey * k; c.save(); c.fillStyle = bg; c.beginPath(); c.ellipse(ex2, ey2, r * 1.35, r * 1.45, 0, 0, TAU); c.fill(); c.restore();
    ink(c, emo === 'tender' ? [[ex2 - r, ey2 - r * .1], [ex2, ey2 + r * .55], [ex2 + r, ey2 - r * .1]] : [[ex2 - r * 1.05, ey2 + r * .35], [ex2, ey2 - r * .6], [ex2 + r * 1.05, ey2 + r * .35]], { w: Math.max(1, s / 60), color: eyeC, seed: seed + 1, p: FLAT }); });
  if (emo === 'surprise') A.eyes.forEach(([ex, ey]) => { const ex2 = x + ex * k * dir, ey2 = y + ey * k; c.save(); c.fillStyle = K === 'sheep' ? '#f6efe2' : '#fffdf8'; c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.arc(ex2, ey2, r * 1.15, 0, TAU); c.fill(); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(ex2, ey2, r * .45, 0, TAU); c.fill(); c.restore(); });
  const talking = st === 'talk', m = talking ? (emo === 'laugh' ? .65 + .35 * Math.abs(Math.sin(t * 16)) : emo === 'surprise' ? .7 : talkAmt(t, seed)) : (emo === 'joy' || emo === 'laugh' ? .25 : 0);
  if (m <= .04 && !talking) return; const mx = x + Mo[0] * k * dir, my = y + Mo[1] * k, mw = r * 1.8 * Mo[2] * (emo === 'surprise' ? .6 : .75 + .35 * m), mh = r * (.3 + 2.2 * m) * (emo === 'surprise' ? 1.1 : 1);
  c.save(); c.fillStyle = bg; c.beginPath(); c.ellipse(mx, my - r * .1, mw * 1.25, Math.max(r * .9, mh * .8), 0, 0, TAU); c.fill();
  c.beginPath(); if (emo === 'joy' || emo === 'laugh') { c.moveTo(mx - mw, my - mh * .25); c.quadraticCurveTo(mx, my - mh * .45, mx + mw, my - mh * .25); c.quadraticCurveTo(mx + mw * .6, my + mh, mx, my + mh); c.quadraticCurveTo(mx - mw * .6, my + mh, mx - mw, my - mh * .25); } else c.ellipse(mx, my, mw, mh * .6 + .4, 0, 0, TAU);
  c.fillStyle = '#4a2420'; c.fill(); c.lineWidth = Math.max(.8, s / 90); c.strokeStyle = INK; c.stroke(); c.clip(); c.fillStyle = '#e07a76'; c.beginPath(); c.ellipse(mx, my + mh * .75, mw * .7, mh * .5, 0, 0, TAU); c.fill(); c.restore(); }
function emoGlyph(c, K, x, y, s, dir, emo, t, seed) { const A = ANCH[K]; if (!A || !emo) return; const k = s / 100, gx = x + (A.top[0] + 14) * k * dir, gy = y + A.top[1] * k - s * .06, b = Math.sin(t * 3 + seed) * 2;
  if (emo === 'laugh') { c.save(); c.font = '700 ' + Math.round(s * .17) + 'px Gaegu, cursive'; c.textAlign = 'center'; c.fillStyle = '#ffd98a'; c.translate(gx, gy + b); c.rotate(-.12); c.fillText('ha ha', 0, 0); c.restore(); }
  else if (emo === 'joy') { c.save(); c.fillStyle = '#fff3c0'; c.strokeStyle = '#5a3a1a'; c.lineWidth = .8; [[0, 0, 1], [s * .12, -s * .08, .7]].forEach(([dx, dy, z], i) => star4(c, gx + dx, gy + dy + b, s * .05 * z * (.8 + .3 * Math.sin(t * 6 + i)))); c.restore(); }
  else if (emo === 'surprise') { c.save(); c.font = '700 ' + Math.round(s * .2) + 'px Gaegu, cursive'; c.textAlign = 'center'; c.fillStyle = '#ffd98a'; c.fillText('!', gx, gy + b); c.restore(); }
  else if (emo === 'tender') heart(c, gx, gy + b, s * .06, '#f08a86', 1);
  else if (emo === 'think') { c.save(); c.fillStyle = 'rgba(255,240,210,.85)'; [0, 1, 2].forEach(i => { c.beginPath(); c.arc(gx + i * s * .05, gy - i * s * .03 + b, s * (.012 + i * .006), 0, TAU); c.fill(); }); c.restore(); } }
S.fireroom = { anim: true,
  bg(c, w, h, o) { return S.campfire.bg(c, w, h, o); },
  fg(c, w, h, t, o) { const [fx, fy] = o.meta.fire, fl = 1 + noise1(t * 5, 3) * .05 + noise1(t * 11, 4) * .03, D = o.dpr;
    const ST = {}; (o.items || '').split(',').filter(Boolean).forEach(s => { const [k, st, emo] = s.split(':'); ST[k] = { st, emo }; });
    const POS = [['owl', .5, .54, .16, 1, .1], ['sheep', .16, .65, .22, 1, .3], ['frog', .32, .695, .17, 1, .5], ['rabbit', .68, .7, .17, -1, .7], ['hedgehog', .85, .65, .18, -1, .9]], drawn = [];
    POS.forEach(([K, px, py, ps, dir, ph], i) => { const S0 = ST[K] || {}, laugh = S0.emo === 'laugh' && S0.st === 'talk', x = w * px, y = h * py - (laugh ? Math.abs(Math.sin(t * 10)) * 2.5 : 0), s = w * ps;
      critter(c, K, x, y, s, { t, dpr: D, dir, ph, rot: S0.st === 'talk' ? dir * .03 : 0 }); if (S0.st === 'talk' || S0.emo) faceFx(c, K, x, y, s, dir, S0.st, S0.emo, t, 8100 + i * 7); drawn.push([K, x, y, s, dir, S0.emo, i]); });
    const bob = Math.abs(Math.sin(t * 2.2)) * 2, mx = w * .87, my = h * .495; critter(c, 'mole', mx, my - bob, w * .09, { t, dir: -1, dpr: D, ph: .4 });
    const lx = mx - w * .05, ly = my - w * .035 - bob;
    night(o.el, c, w, h, [{ x: fx, y: fy - 20, r: w * .54 * fl, k: 1, color: '#ff9a45', a: .32 }, { x: lx, y: ly, r: w * .17, k: .85, color: '#ffc768', a: .3 }, ...Object.values(o.meta.homes).map(hm => ({ x: hm.win[0], y: hm.win[1], r: 16, k: .7 }))], .9);
    Object.values(o.meta.homes).forEach(hm => litWindow(c, hm)); lantern(c, lx, ly, w * .035, t); glow(c, lx, ly, w * .07, '#ffd170', .7);
    glow(c, fx, fy - w * .06, w * .32 * fl, '#ffb050', .5); flame(c, fx, fy, w * .17, t, 7); sparks(c, fx, fy, w * .17, t, 8);
    drawn.forEach(([K, x, y, s, dir, emo, i]) => emoGlyph(c, K, x, y, s, dir, emo, t, i));
    stars(c, 0, h * .02, w, h * .32, 46, t, 9); moon(c, w * .82, h * .11, w * .045); fireflies(c, 6, w * .05, h * .4, w * .95, h * .55, t, 10); } };


const SLOTS = [[.16, .66, .21, 1], [.84, .66, .2, -1], [.5, .545, .15, 1], [.32, .71, .17, 1], [.68, .71, .17, -1], [.29, .575, .13, 1], [.71, .575, .13, -1], [.9, .765, .17, -1]];
S.fire2 = { anim: true,
  bg(c, w, h, o) { return S.campfire.bg(c, w, h, o); },
  fg(c, w, h, t, o) { const [fx, fy] = o.meta.fire, D = o.dpr, unlit = o.state === 'unlit', quiet = o.state === 'quiet';
    const L = (o.items || '').split(',').filter(Boolean).map(s => { const [k, st, emo] = s.split(':'); return { k, st: st || '', emo: emo || '' }; });
    const laugh = L.some(p => p.emo === 'laugh' && p.st === 'talk'), lift = 1 + (laugh ? .2 + .1 * Math.sin(t * 9) : 0), fl = (1 + noise1(t * 5, 3) * .05 + noise1(t * 11, 4) * .03) * lift;
    const drawn = [], lans = [];
    L.forEach((p, i) => { const sl = SLOTS[i % 8], K = CR[p.k] ? p.k : 'rabbit'; let x = w * sl[0], y = h * sl[1], s = w * sl[2], dir = sl[3];
      if (p.st === 'walk') { const ph = clamp(((t * .2) % 1) * 1.5, 0, 1); x = lerp(w * .97, x, ph); y = lerp(h * .5, y, ph) - (ph < 1 ? Math.abs(Math.sin(t * 6)) * 3 : 0); if (ph < 1) dir = -1; }
      if (p.st === 'home') { const ph = (t * .16) % 1; x = lerp(w * .62, w * .98, ph); y = lerp(h * .64, h * .49, ph) - Math.abs(Math.sin(t * 6)) * 3; s *= lerp(.95, .55, ph); dir = 1; }
      critter(c, K, x, y, s, { t, dpr: D, dir, ph: i * .23, sleep: p.st === 'doze', rot: p.st === 'talk' ? dir * .03 : 0 });
      if (p.st === 'wave') { c.save(); c.translate(x, y); paw(c, K, s, dir, .25 + Math.sin(t * 9) * .5, defOf(K)); c.restore(); }
      if (p.st === 'talk' || p.emo) faceFx(c, K, x, y, s, dir, p.st, p.emo, t, 8200 + i * 7);
      if (p.st === 'doze') zzz(c, x + s * .25, y - s * .85, s * .25, t + i);
      if (p.st === 'lantern') lans.push([x + dir * s * .36, y - s * .55, s]);
      drawn.push([K, x, y, s, dir, p, i]); });
    night(o.el, c, w, h, [{ x: fx, y: fy - 20, r: w * (unlit ? .2 : quiet ? .32 : .54) * fl, k: unlit ? .55 : 1, color: '#ff9a45', a: unlit ? .1 : .32 }, ...Object.values(o.meta.homes).map(hm => ({ x: hm.win[0], y: hm.win[1], r: 16, k: .7 })), ...lans.map(([lx, ly]) => ({ x: lx, y: ly, r: w * .17, k: .9, color: '#ffc768', a: .3 }))], .9);
    Object.values(o.meta.homes).forEach(hm => litWindow(c, hm));
    lans.forEach(([lx, ly, s]) => { ink(c, [[lx, ly - s * .3], [lx, ly - s * .14]], { w: 1, seed: 91 }); lantern(c, lx, ly, s * .17, t); glow(c, lx, ly, s * .55, '#ffd170', .7); });
    if (unlit) { for (let i = 0; i < 6; i++) { const a = .35 + .65 * Math.abs(Math.sin(t * 1.3 + i * 1.7)); c.fillStyle = 'rgba(255,140,60,' + (a * .85) + ')'; c.beginPath(); c.arc(fx + (hash(i, 5) - .5) * w * .13, fy - 2 + (hash(i, 6) - .5) * 6, 1.7, 0, TAU); c.fill(); } smoke(c, fx, fy - 6, w * .05, t, 8300); }
    else { const sz = w * (quiet ? .09 : .17) * lift; glow(c, fx, fy - w * .06, w * .32 * fl * (quiet ? .55 : 1), '#ffb050', .5); flame(c, fx, fy, sz, t, 7); sparks(c, fx, fy, sz, t, 8); }
    drawn.forEach(([K, x, y, s, dir, p, i]) => { emoGlyph(c, K, x, y, s, dir, p.emo, t, i); if (p.st === 'wave') { c.save(); c.font = '700 ' + Math.round(s * .17) + 'px Gaegu, cursive'; c.textAlign = 'center'; c.fillStyle = '#ffd98a'; c.fillText('night all!', x, y - s * .95); c.restore(); } });
    stars(c, 0, h * .02, w, h * .32, 46, t, 9); moon(c, w * .8, h * (o.alt ? .36 : .21), w * .045); fireflies(c, quiet || unlit ? 9 : 6, w * .05, h * .4, w * .95, h * .55, t, 10); } };
S.solo = { anim: true,
  bg(c, w, h) { const g = c.createRadialGradient(w * .5, h * .9, 0, w * .5, h * .6, w * .8); g.addColorStop(0, '#7a5038'); g.addColorStop(1, '#231b2b'); c.fillStyle = g; c.fillRect(0, 0, w, h); return {}; },
  fg(c, w, h, t, o) { const K = CR[o.kind] ? o.kind : 'rabbit', [st, emo] = (o.items || ':').split(':'), A = ANCH[K], dir = FLIP(K), s = Math.min(w, h) * 100 / Math.max(A.head[2], A.head[3]) * .36;
    const hx = w * .5 - A.head[0] * s / 100 * dir, hy = h * .56 - A.head[1] * s / 100; glow(c, w * .5, h * .95, w * .7, '#ffb050', .3);
    critter(c, K, hx, hy, s, { t, dpr: o.dpr, dir, shadow: false, v: o.v }); if (st === 'talk' || emo) faceFx(c, K, hx, hy, s, dir, st, emo, t, 8400); emoGlyph(c, K, hx, hy, s, dir, emo, t, 1); } };
const PORT = { a: ['#e9d3b6', '#b07a54', '#2b1d17', '#d6a24a'], b: ['#dfe3d6', '#f0c7a8', '#9a4a2a', '#6f9a5a'], c: ['#e6dccd', '#7a4e33', '#151012', '#5f8fb5'], d: ['#eadfd6', '#d9ad8a', '#9a9490', '#c9543e'] };
S.portrait = { anim: false,
  bg(c, w, h, o) { const [room, skin, hair, top] = PORT[o.name] || PORT.a, m = Math.min(w, h); paper(c, w, h, room, 9001 + (o.name || 'a').charCodeAt(0)); glow(c, w * .78, h * .2, m * .6, '#ffd59a', .5, 'source-over');
    local(c, w / 2, h / 2, m / 100, () => { const sh = blob(0, 50, 46, 26, 9010, .05, 12); gouache(c, sh, top); wash(c, sh, shade(top, .4), { al: .4, seed: 9011 }); ink(c, sh.slice(6, 12), { w: 1.2, seed: 9012 });
      const nk = [[-7, 14], [7, 14], [8, 30], [-8, 30]]; gouache(c, nk, shade(skin, .12), 1, false);
      const back = o.name === 'c' ? blob(0, -8, 30, 30, 9020, .16, 14) : blob(0, -6, 25, 28, 9020, .06, 12); gouache(c, back, hair); wash(c, back, shade(hair, .3), { al: .4, seed: 9021 });
      const hd = blob(0, -2, 19, 23, 9022, .03, 12); gouache(c, hd, skin); wash(c, blob(6, 4, 12, 16, 9023, .1, 9), shade(skin, .25), { al: .35, seed: 9024, clip: toPath(hd) }); ink(c, hd, { close: true, w: 1.1, seed: 9025, alpha: .8 });
      const fr = o.name === 'd' ? [[-20, -4], [-18, -20], [0, -27], [18, -20], [20, -4], [12, -16], [-8, -18]] : [[-19, -8], [-14, -22], [0, -27], [14, -22], [19, -8], [8, -18], [-6, -20]]; gouache(c, fr, hair); ink(c, fr.slice(0, 5), { w: 1, seed: 9026, alpha: .7 });
      c.fillStyle = INK; [-7, 7].forEach(x => { c.beginPath(); c.ellipse(x, 0, 1.6, 2, 0, 0, TAU); c.fill(); });
      ink(c, [[-5, 9], [0, 12], [5, 9]], { w: 1.1, seed: 9027, p: FLAT }); blush(c, -11, 6, 3.4, 9028); blush(c, 11, 6, 3.4, 9029); }); return {}; } };
S.lframe = { anim: false,
  bg(c, w, h, o) { const m = Math.min(w, h), r = m / 2 - Math.max(4, m * .04), cx = w / 2, cy = h / 2, pts = []; for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; pts.push([cx + Math.cos(a) * r * (1 + (hash(k, 9101) - .5) * .02), cy + Math.sin(a) * r * (1 + (hash(k, 9102) - .5) * .02)]); }
    c.save(); c.lineWidth = Math.max(4, m * .05); c.strokeStyle = o.color || '#c9973e'; c.globalAlpha = .85; c.stroke(toPath(pts)); c.restore();
    ink(c, pts, { close: true, w: Math.max(1.2, m / 70), seed: 9103 }); pencil(c, pts.map(([x, y]) => [cx + (x - cx) * 1.06, cy + (y - cy) * 1.06]), { close: true, w: 1, alpha: .5, seed: 9104, passes: 1 });
    if (o.state !== 'plain') { const lx = cx + r * .72, ly = cy - r * .72; ink(c, [[lx, ly - m * .07], [lx, ly - m * .03]], { w: 1, seed: 9105 }); lantern(c, lx, ly + m * .03, m * .08, 0); glow(c, lx, ly + m * .03, m * .14, '#ffd170', .6, 'source-over'); } return {}; } };
const farmFg0 = S.farm.fg; S.farm.fg = function (c, w, h, t, o) { farmFg0.call(this, c, w, h, t, o); if (o.state !== 'fire') return; const fx = w * .2, fy = h * .93, fl = 1 + noise1(t * 5, 3) * .06;
  glow(c, fx, fy - w * .03, w * .26 * fl, '#ffb050', o.night ? .55 : .35, o.night ? 'screen' : 'source-over'); flame(c, fx, fy, w * .07, t, 17); sparks(c, fx, fy, w * .06, t, 18); critter(c, 'mole', fx - w * .1, fy + h * .01, w * .07, { t, dpr: o.dpr, ph: .4 }); };
const widFg0 = S.widget.fg; S.widget.fg = function (c, w, h, t, o) { widFg0.call(this, c, w, h, t, o); if (o.state !== 'fire') return; const fx = w * .42, fy = h * .95, fl = 1 + noise1(t * 5, 3) * .06;
  glow(c, fx, fy - h * .08, h * .5 * fl, '#ffb050', .55); critter(c, 'hedgehog', fx - h * .2, fy, h * .2, { t, dpr: o.dpr, ph: .2 }); critter(c, 'sheep', fx + h * .2, fy, h * .22, { t, dpr: o.dpr, dir: -1, ph: .6 }); flame(c, fx, fy, h * .16, t, 27); sparks(c, fx, fy, h * .12, t, 28); };


/* ---------- field guide plants ---------- */
const PL = {
  clover: ['spring', 'clover', '#e8a3bf', '#c46a8e', 'tre', 'bunch'], tulip: ['spring', 'cup', '#e2626b', '#a83a3f', 'blade', 'bunch'], bluebell: ['spring', 'bell', '#7f95d6', '#4d5fa6', 'blade', 'bunch'], sweetpea: ['spring', 'frill', '#d9a0d8', '#9a5aa0', 'oval', 'bunch'], blossom: ['spring', 'twig', '#f3c1c8', '#d97f8e', 'oval', 'bunch'], daffodil: ['spring', 'trumpet', '#f6d34e', '#e39a2a', 'blade', 'bunch'],
  sunflower: ['summer', 'head', '#f2c230', '#6b4226', 'big', 'seeds'], lavender: ['summer', 'spike', '#9a86c8', '#6a559a', 'grass', 'bunch'], poppy: ['summer', 'cup', '#e2553a', '#2a1a14', 'oval', 'pod'], cornflower: ['summer', 'frill', '#5f86d0', '#2f4f9a', 'grass', 'bunch'], strawberry: ['summer', 'daisy', '#fbf3e2', '#e8b44e', 'tre', 'berry'], chamomile: ['summer', 'daisy', '#fffaf0', '#f2c230', 'grass', 'bunch'],
  pumpkin: ['autumn', 'cup', '#f2b23e', '#c77a20', 'big', 'gourd'], aster: ['autumn', 'daisy', '#a78ad6', '#f2c230', 'oval', 'bunch'], marigold: ['autumn', 'frill', '#f0962e', '#c4561c', 'oval', 'bunch'], apple: ['autumn', 'twig', '#fbf3e2', '#f3c1c8', 'oval', 'apple'], chrysanthemum: ['autumn', 'pom', '#d9643f', '#a83a1f', 'oval', 'bunch'], heather: ['autumn', 'spike', '#c77aa8', '#8a4a74', 'grass', 'bunch'],
  snowdrop: ['winter', 'bell', '#fbfbf6', '#9fb57a', 'blade', 'bunch'], hellebore: ['winter', 'cup', '#e9d6e3', '#9a6a8a', 'big', 'bunch'], holly: ['winter', 'berry', '#c9302c', '#7a1a18', 'holly', 'berry'], jasmine: ['winter', 'star', '#f6d34e', '#e3a02a', 'grass', 'bunch'], cyclamen: ['winter', 'frill', '#e57aa8', '#a83a6a', 'heart', 'bunch'],
  moonflower: ['night', 'moon', '#fbfbf6', '#d7e6f0', 'heart', 'bunch'], rose: ['any', 'rose', '#e2626b', '#a83a3f', 'oval', 'bunch'], plum: ['farm', 'twig', '#fbf3e2', '#f0c7d0', 'oval', 'plum'] };
function leafAt(c, x, y, sz, ang, kind, col, seed) { if (kind === 'blade' || kind === 'grass') { const L = sz * (kind === 'grass' ? 1.6 : 1.8), wd = sz * (kind === 'grass' ? .32 : .26), pts = [[x, y], [x + Math.cos(ang) * L * .5 - Math.sin(ang) * wd, y + Math.sin(ang) * L * .5 + Math.cos(ang) * wd], [x + Math.cos(ang) * L, y + Math.sin(ang) * L], [x + Math.cos(ang) * L * .5 + Math.sin(ang) * wd, y + Math.sin(ang) * L * .5 - Math.cos(ang) * wd]]; gouache(c, pts, col); ink(c, pts, { close: true, w: .9, seed }); return; }
  if (kind === 'tre') { for (let k = -1; k <= 1; k++) { const a = ang + k * .9, l = blob(x + Math.cos(a) * sz * .45, y + Math.sin(a) * sz * .45, sz * .42, sz * .36, seed + k, .06, 8, a); gouache(c, l, col); ink(c, l, { close: true, w: .8, seed: seed + 5 + k }); } return; }
  if (kind === 'holly') { const pts = []; for (let k = 0; k < 12; k++) { const u = k / 11, r = k % 2 ? sz * .2 : sz * .38; pts.push([x + Math.cos(ang) * sz * 1.4 * u - Math.sin(ang) * r * Math.sin(u * Math.PI), y + Math.sin(ang) * sz * 1.4 * u + Math.cos(ang) * r * Math.sin(u * Math.PI)]); } for (let k = 11; k >= 0; k--) { const u = k / 11, r = k % 2 ? sz * .2 : sz * .38; pts.push([x + Math.cos(ang) * sz * 1.4 * u + Math.sin(ang) * r * Math.sin(u * Math.PI), y + Math.sin(ang) * sz * 1.4 * u - Math.cos(ang) * r * Math.sin(u * Math.PI)]); } gouache(c, pts, '#3f6e3a', 1, false); ink(c, pts, { close: true, smooth: false, w: .8, seed }); return; }
  const rx = sz * (kind === 'big' ? 1 : kind === 'heart' ? .7 : .62), ry = sz * (kind === 'big' ? .55 : .38), l = blob(x + Math.cos(ang) * rx, y + Math.sin(ang) * rx, rx, ry, seed, .06, 10, ang); gouache(c, l, col); wash(c, l, '#3f6e2f', { al: .3, seed: seed + 1, gran: .05 }); ink(c, l, { close: true, w: .9, seed: seed + 2 }); }
function petals(c, x, y, r, n, col, edge, seed, rr = .55, rot = 0) { for (let i = 0; i < n; i++) { const a = rot + i / n * TAU, p = blob(x + Math.cos(a) * r * .62, y + Math.sin(a) * r * .62, r * .48, r * rr * .48 + .5, seed + i, .08, 8, a); gouache(c, p, col); ink(c, p, { close: true, w: .75, seed: seed + 20 + i, color: shade(edge, .2), alpha: .8 }); } }
function flowerHead(c, type, x, y, r, P, sleepy, seed) { const col = P[2], c2 = P[3];
  if (sleepy) { const b = blob(x, y + r * .2, r * .32, r * .5, seed, .06, 9); gouache(c, b, col); wash(c, b, c2, { al: .35, seed: seed + 1 }); ink(c, b, { close: true, w: .9, seed: seed + 2 }); return; }
  if (type === 'daisy' || type === 'star') { petals(c, x, y, r, type === 'star' ? 6 : 11, col, c2 === '#e8b44e' || c2 === '#f2c230' ? '#a08a6a' : c2, seed, type === 'star' ? .7 : .45); const cc = blob(x, y, r * .26, r * .26, seed + 40, .06, 9); gouache(c, cc, c2); ink(c, cc, { close: true, w: .8, seed: seed + 41 }); }
  else if (type === 'head') { petals(c, x, y, r * 1.1, 16, col, '#b07a1c', seed, .4); const cc = blob(x, y, r * .45, r * .45, seed + 40, .04, 11); gouache(c, cc, c2); for (let i = 0; i < 14; i++) { const a = i * 2.4, rad = Math.sqrt(i / 14) * r * .38; c.fillStyle = '#3a2416'; c.beginPath(); c.arc(x + Math.cos(a) * rad, y + Math.sin(a) * rad, 1, 0, TAU); c.fill(); } ink(c, cc, { close: true, w: .9, seed: seed + 41 }); }
  else if (type === 'cup' || type === 'rose') { [-1, 1, 0].forEach((k, i) => { const p = blob(x + k * r * .3, y - (k ? 0 : r * .12), r * .38, r * .55, seed + i, .06, 9, k * .3); gouache(c, p, i === 2 ? tint(col, .12) : col); wash(c, p, c2, { al: .3, seed: seed + 5 + i, gran: .05 }); ink(c, p, { close: true, w: .85, seed: seed + 10 + i }); }); if (type === 'rose') ink(c, [[x - r * .12, y - r * .1], [x + r * .1, y - r * .2], [x + r * .12, y + r * .05], [x - r * .05, y + r * .1], [x, y - r * .05]], { w: .9, seed: seed + 15, color: c2 }); }
  else if (type === 'bell') { [[-.5, .1], [.05, .35], [.55, .1]].forEach(([dx, dy], i) => { const bx = x + dx * r, by = y + dy * r, b = [[bx - r * .22, by], [bx - r * .2, by - r * .3], [bx, by - r * .38], [bx + r * .2, by - r * .3], [bx + r * .22, by], [bx + r * .1, by - r * .05], [bx, by + r * .05], [bx - r * .1, by - r * .05]]; ink(c, [[bx, by - r * .38], [bx - dx * r * .3, by - r * .7]], { w: .8, color: '#4f7a35', seed: seed + 30 + i }); gouache(c, b, col); wash(c, b, c2, { al: .3, seed: seed + i, gran: .04 }); ink(c, b, { close: true, w: .8, seed: seed + 10 + i }); }); }
  else if (type === 'trumpet' || type === 'moon') { const back = blob(x, y, r * .55, r * .55, seed, .05, 10); gouache(c, back, col); if (type === 'moon') { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; pencil(c, [[x, y], [x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .5]], { w: .8, color: '#a9c0d0', alpha: .8, seed: seed + 50 + i, passes: 1 }); } } else petals(c, x, y, r * .9, 6, col, c2, seed + 3, .6); ink(c, back, { close: true, w: .85, seed: seed + 1 }); const tr = blob(x, y, r * .2, r * .2, seed + 2, .05, 8); gouache(c, tr, c2); ink(c, tr, { close: true, w: .8, seed: seed + 4 }); }
  else if (type === 'spike') { for (let i = 0; i < 7; i++) { [-1, 1].forEach(k => { const b = blob(x + k * r * .13, y + r * .4 - i * r * .2, r * .17, r * .13, seed + i * 2 + k, .1, 7); gouache(c, b, i % 2 ? col : c2); }); } }
  else if (type === 'frill' || type === 'pom') { const n = type === 'pom' ? 18 : 9; for (let i = 0; i < n; i++) { const a = i / n * TAU, rad = type === 'pom' ? r * (.25 + (i % 3) * .14) : r * .5, p = blob(x + Math.cos(a) * rad, y + Math.sin(a) * rad, r * .26, r * .2, seed + i, .25, 7, a); gouache(c, p, i % 2 ? col : tint(col, .15)); ink(c, p, { close: true, w: .6, seed: seed + 30 + i, alpha: .6 }); } const cc = blob(x, y, r * .16, r * .16, seed + 60, .1, 7); gouache(c, cc, c2); }
  else if (type === 'clover') { for (let i = 0; i < 16; i++) { const a = i * 2.4, rad = Math.sqrt(i / 16) * r * .5, p = blob(x + Math.cos(a) * rad, y + Math.sin(a) * rad, r * .17, r * .12, seed + i, .1, 6, a); gouache(c, p, i % 3 ? col : c2); } ink(c, blob(x, y, r * .55, r * .55, seed + 40, .1, 10), { close: true, w: .8, seed: seed + 41, alpha: .7 }); }
  else if (type === 'twig') { ink(c, [[x - r, y + r * .4], [x, y], [x + r * .9, y - r * .5]], { w: 1.8, color: '#6d4c35', seed }); [[-.5, .2], [.1, -.05], [.6, -.35]].forEach(([dx, dy], i) => { const fx = x + dx * r, fy = y + dy * r; petals(c, fx, fy, r * .36, 5, col, c2, seed + 10 * i, .9); c.fillStyle = c2; c.beginPath(); c.arc(fx, fy, r * .07, 0, TAU); c.fill(); }); }
  else if (type === 'berry') { [[-.25, .1], [.15, -.05], [.05, .3], [.35, .25]].forEach(([dx, dy], i) => { const b = blob(x + dx * r, y + dy * r, r * .17, r * .17, seed + i, .05, 8); gouache(c, b, col); ink(c, b, { close: true, w: .7, seed: seed + 10 + i }); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + dx * r - r * .05, y + dy * r - r * .05, r * .04, 0, TAU); c.fill(); }); } }
function produce(c, kind, x, y, r, P, seed) {
  if (kind === 'gourd') { const g = blob(x, y - r * .45, r * .75, r * .55, seed, .05, 12); gouache(c, g, '#e88a34'); wash(c, g, '#a8521c', { al: .4, seed: seed + 1 }); [-.35, 0, .35].forEach((k, i) => pencil(c, [[x + k * r * .8, y - r * .95], [x + k * r * .9, y - r * .45], [x + k * r * .8, y + r * .05]], { w: 1, color: '#8a3a12', alpha: .6, seed: seed + 3 + i, passes: 1 })); ink(c, g, { close: true, w: 1.1, seed: seed + 2 }); ink(c, [[x, y - r * 1], [x + r * .1, y - r * 1.25]], { w: 2, color: '#5d7a42', seed: seed + 9 }); return; }
  if (kind === 'apple' || kind === 'plum' || kind === 'berry') { const cl = kind === 'apple' ? '#d9443a' : kind === 'plum' ? '#7b4a86' : P[2]; [[-.4, 0], [.35, .05], [0, -.35], [.05, .3]].forEach(([dx, dy], i) => { const b = blob(x + dx * r, y - r * .4 + dy * r, r * .3, r * .3, seed + i, .05, 9); gouache(c, b, cl); wash(c, b, shade(cl, .4), { al: .35, seed: seed + 5 + i, gran: .04 }); ink(c, b, { close: true, w: .9, seed: seed + 10 + i }); c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(x + dx * r - r * .1, y - r * .4 + dy * r - r * .1, r * .06, 0, TAU); c.fill(); }); return; }
  if (kind === 'seeds' || kind === 'pod') { const b = blob(x, y - r * .4, r * .55, r * .4, seed, .06, 10); gouache(c, b, '#c9a26e'); wash(c, b, '#7a5a3a', { al: .4, seed: seed + 1 }); ink(c, b, { close: true, w: 1, seed: seed + 2 }); for (let i = 0; i < 9; i++) { c.fillStyle = kind === 'pod' ? '#2a1a14' : '#3a2416'; c.beginPath(); c.ellipse(x + (hash(i, seed) - .5) * r * .7, y - r * .5 + (hash(i, seed + 1) - .5) * r * .3, r * .06, r * .1, hash(i, seed + 2) * 3, 0, TAU); c.fill(); } return; }
  [-.35, 0, .35].forEach((k, i) => { ink(c, [[x + k * r * .3, y], [x + k * r, y - r * 1.4]], { w: 1.3, color: '#4f7a35', seed: seed + i }); flowerHead(c, P[1], x + k * r, y - r * 1.5, r * .62, P, false, seed + 20 * i); }); const rb = [[x - r * .3, y - r * .4], [x + r * .3, y - r * .38], [x + r * .32, y - r * .2], [x - r * .32, y - r * .22]]; gouache(c, rb, '#e8b44e', 1, false); ink(c, rb, { close: true, smooth: false, w: .8, seed: seed + 70 }); }
S.plant = { anim: true,
  bg(c, w, h, o) { const P = PL[o.name] || PL.clover, st = +o.stage || 0, m = Math.min(w, h), s = m / 100, v = o.state, cx = w / 2, gy = h * .86, sleepy = st === 5;
    if (o.color !== 'none') paper(c, w, h, o.color || (P[0] === 'night' || v === 'night' ? '#2b2e4a' : '#f6efe3'), 7301);
    local(c, cx, gy, s, () => { const mound = [[-34, 4], [-22, -4], [-6, -8], [8, -8], [24, -4], [36, 4], [36, 12], [-34, 12]]; gouache(c, mound, '#b98d68'); wash(c, mound, '#7d5a3e', { al: .45, seed: 7302 }); ink(c, mound.slice(0, 6), { w: 1.2, seed: 7303 });
      if (st === 0) { const sd = blob(0, -8, 7, 5, 7304, .06, 9, -.3); gouache(c, sd, '#9b6f45'); ink(c, sd, { close: true, w: 1.1, seed: 7305 }); return; }
      if (st === 4) { produce(c, P[5], 0, -6, 26, P, 7400); return; }
      const lc = mix('#8fb768', '#9aa38a', sleepy ? .45 : 0), topY = st === 1 ? -26 : st === 2 ? -52 : -64, tip = sleepy ? [16, -40] : [0, topY];
      const stem = sleepy ? [[0, -6], [2, -30], [12, -46], tip] : [[0, -6], [-2, (topY - 6) / 2], tip]; ink(c, stem, { w: 1.7, color: sleepy ? '#7a8a62' : '#4f7a35', seed: 7310 });
      const lk = P[4]; if (st === 1) { leafAt(c, -1, -20, 9, -2.6, lk === 'grass' || lk === 'blade' ? 'oval' : lk, lc, 7320); leafAt(c, 1, -22, 9, -.5, lk === 'grass' || lk === 'blade' ? 'oval' : lk, lc, 7330); return; }
      leafAt(c, -1, -14, 11, sleepy ? -3.4 : -2.5, lk, lc, 7340); leafAt(c, 1, -20, 11, sleepy ? .4 : -.6, lk, lc, 7350); if (lk !== 'tre') leafAt(c, -1, -30, 9, sleepy ? -3.2 : -2.7, lk, lc, 7360);
      if (st === 2) { const b = blob(tip[0], tip[1] - 6, 6.5, 10, 7370, .06, 9); gouache(c, b, mix(P[2], '#8fb768', .45)); wash(c, b, P[3], { al: .3, seed: 7371 }); ink(c, b, { close: true, w: 1, seed: 7372 }); return; }
      const sat = sleepy ? [PL[o.name] ? P[0] : '', P[1], mix(P[2], '#b8b0a6', .45), mix(P[3], '#8a8278', .45), P[4], P[5]] : (v === 'rain' ? [P[0], P[1], mix(P[2], '#7fb7d8', .45), mix(P[3], '#3f6f9a', .4), P[4], P[5]] : v === 'frost' ? [P[0], P[1], mix(P[2], '#ffffff', .5), mix(P[3], '#9fb3c2', .4), P[4], P[5]] : v === 'gold' ? [P[0], P[1], mix(P[2], '#f2c230', .55), mix(P[3], '#c48a1c', .5), P[4], P[5]] : P);
      flowerHead(c, P[1], tip[0], tip[1] - (P[1] === 'spike' ? 6 : 6), P[1] === 'head' ? 22 : P[1] === 'twig' ? 22 : 19, sat, sleepy, 7380); });
    return { s, cx, gy }; },
  fg(c, w, h, t, o) { const st = +o.stage || 0, v = o.state, m = Math.min(w, h), cx = w / 2, fy = h * .86 - m * .6;
    if (st === 5) { const dark = (PL[o.name] || [])[0] === 'night' || v === 'night'; c.save(); if (dark) c.filter = 'invert(1) brightness(1.6)'; zzz(c, cx + m * .1, h * .86 - m * .62, m * .12, t); c.restore(); }
    if (st === 3 && v === 'rain') for (let i = 0; i < 9; i++) { const ph = (t * .7 + hash(i, 31)) % 1, x = w * (.15 + hash(i, 32) * .7), y = h * (.05 + ph * .75); c.save(); c.globalAlpha = (1 - ph) * .8; c.strokeStyle = '#7fb7d8'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 8); c.stroke(); c.restore(); }
    if (st === 3 && (v === 'gold' || v === 'rare' || v === 'rain' || v === 'frost')) glints(c, [[cx - m * .2, fy], [cx + m * .22, fy - m * .08], [cx + m * .05, fy - m * .24]], t, 7390);
    if (st === 3 && (PL[o.name] || [])[0] === 'night') glow(c, cx, fy + m * .04, m * .4, '#e8f0ff', .35 + .1 * Math.sin(t * 1.4)); } };


/* ---------- shop v2: cottage styles, companions, rare coats, reactive items ---------- */
const RARE = { moonlit: { fill: '#dfe1f2', wash: '#6a6fa8', tint: '#e3e4f3' }, calico: { fill: '#fbf3e6', wash: '#d08a4a', tint: '#f6e8d6' }, golden: { fill: '#f4d68a', wash: '#c4902c', tint: '#f6e6bf' }, frost: { fill: '#f1f5f8', wash: '#9fb3c2', tint: '#e9f0f4' } };
Object.keys(CR).forEach(k => { COATS[k] = Object.assign(COATS[k] || {}, RARE); });
let styleHouse = function (c, name, x, y, s, t, seed) { const k = s / 100, win = [];
  local(c, x, y, k, () => {
    if (name === 'windmill') { const tw = [[-22, 0], [-14, -78], [14, -78], [22, 0]]; gouache(c, tw, '#efe2c8', 1, false); wash(c, tw, '#b89a72', { al: .35, seed, smooth: false }); ink(c, tw, { close: true, smooth: false, w: 1.6, seed: seed + 1 }); const cap = [[-18, -76], [0, -96], [18, -76]]; gouache(c, cap, '#8a6f98', 1, false); ink(c, cap, { close: true, smooth: false, w: 1.5, seed: seed + 2 }); const d = [[-6, 0], [-6, -16], [6, -16], [6, 0]]; gouache(c, d, '#6d4c35', 1, false); ink(c, d, { w: 1.1, seed: seed + 3, smooth: false });
      win.push([0, -48]); c.fillStyle = '#d2dfe0'; c.fillRect(-5, -54, 10, 12); ink(c, [[-5, -54], [5, -54], [5, -42], [-5, -42]], { close: true, smooth: false, w: 1, seed: seed + 4 });
      const r = (t || 0) * .6; for (let i = 0; i < 4; i++) { const an = r + i * Math.PI / 2, ca = Math.cos(an), sa = Math.sin(an), sail = [[0, -82], [ca * 54 - sa * 3, -82 + sa * 54 + ca * 3], [ca * 54 - sa * 13, -82 + sa * 54 + ca * 13], [ca * 10 - sa * 13, -82 + sa * 10 + ca * 13]]; gouache(c, sail, '#fbf3e2', .95, false); ink(c, sail, { close: true, smooth: false, w: 1.1, seed: seed + 10 + i }); } c.fillStyle = INK; c.beginPath(); c.arc(0, -82, 3, 0, TAU); c.fill(); }
    else if (name === 'treehouse') { const tr = [[-8, 0], [-6, -60], [6, -60], [8, 0]]; gouache(c, tr, '#a37c59', 1, false); wash(c, tr, '#6b4a33', { al: .4, seed }); ink(c, tr, { close: true, w: 1.5, seed: seed + 1 }); [[-38, -96, 30, 22], [0, -110, 38, 26], [36, -96, 28, 22]].forEach((b, i) => { const p = blob(b[0], b[1], b[2], b[3], seed + 20 + i, .08, 11); gouache(c, p, '#8fb768'); wash(c, p, '#4f7a35', { al: .35, seed: seed + 30 + i }); ink(c, p, { close: true, w: 1.2, seed: seed + 40 + i, alpha: .85 }); });
      const pl = [[-30, -60], [30, -60], [30, -55], [-30, -55]]; gouache(c, pl, '#8a6446', 1, false); ink(c, pl, { close: true, smooth: false, w: 1.2, seed: seed + 5 }); const hs = [[-20, -60], [-20, -84], [20, -84], [20, -60]]; gouache(c, hs, '#f1e3c9', 1, false); ink(c, hs, { close: true, smooth: false, w: 1.4, seed: seed + 6 }); const rf = [[-25, -82], [0, -98], [25, -82]]; gouache(c, rf, '#c96f4f', 1, false); ink(c, rf, { close: true, smooth: false, w: 1.4, seed: seed + 7 });
      win.push([8, -72]); c.fillStyle = '#d2dfe0'; c.fillRect(3, -77, 10, 10); [0, 1, 2, 3, 4].forEach(i => pencil(c, [[-26, -55 + i * 11], [-18, -55 + i * 11]], { w: 1, alpha: .8, seed: seed + 50 + i, passes: 1 })); ink(c, [[-26, -55], [-26, 0]], { w: 1, seed: seed + 60 }); ink(c, [[-18, -55], [-18, 0]], { w: 1, seed: seed + 61 }); }
    else if (name === 'houseboat') { const wv = [[-60, 0], [60, 0], [60, 14], [-60, 14]]; gouache(c, wv, '#9cc3cc', 1, false); wash(c, wv, '#4f8a9a', { al: .4, seed, smooth: false }); for (let i = 0; i < 4; i++) pencil(c, [[-50 + i * 28, 6 + (i % 2) * 4], [-38 + i * 28, 6 + (i % 2) * 4]], { w: 1, color: '#fff', alpha: .8, seed: seed + 70 + i, passes: 1 });
      const hull = [[-46, -14], [46, -14], [38, 4], [-38, 4]]; gouache(c, hull, '#5f8a8b', 1, false); wash(c, hull, '#2f5a5b', { al: .35, seed: seed + 1, smooth: false }); ink(c, hull, { close: true, smooth: false, w: 1.5, seed: seed + 2 }); const cab = [[-28, -14], [-28, -40], [20, -40], [20, -14]]; gouache(c, cab, '#f1e3c9', 1, false); ink(c, cab, { close: true, smooth: false, w: 1.4, seed: seed + 3 }); const rf = [[-32, -38], [24, -38], [18, -48], [-26, -48]]; gouache(c, rf, '#d6a24a', 1, false); ink(c, rf, { close: true, smooth: false, w: 1.3, seed: seed + 4 });
      win.push([-14, -27]); win.push([6, -27]); c.fillStyle = '#d2dfe0'; c.fillRect(-19, -32, 10, 10); c.fillRect(1, -32, 10, 10); ink(c, [[24, -40], [24, -62]], { w: 1.2, seed: seed + 5 }); const fl = [[24, -62], [38, -58], [24, -54]]; gouache(c, fl, '#e2626b', 1, false); }
    else if (name === 'lighthouse') { const tw = [[-16, 0], [-10, -88], [10, -88], [16, 0]]; gouache(c, tw, '#fbf3e2', 1, false); c.save(); c.clip(toPath(tw, true, false)); [0, 1, 2].forEach(i => { c.fillStyle = '#c9543e'; c.fillRect(-20, -26 - i * 26, 40, 12); }); c.restore(); ink(c, tw, { close: true, smooth: false, w: 1.6, seed });
      const lm = [[-12, -88], [-12, -102], [12, -102], [12, -88]]; gouache(c, lm, '#ffe39a', 1, false); ink(c, lm, { close: true, smooth: false, w: 1.3, seed: seed + 1 }); const cp = [[-15, -102], [0, -114], [15, -102]]; gouache(c, cp, '#2a221d', 1, false); win.push([0, -95]); const d = [[-5, 0], [-5, -14], [5, -14], [5, 0]]; gouache(c, d, '#6d4c35', 1, false); }
    else if (name === 'mushroom') { const st = [[-18, 0], [-14, -40], [14, -40], [18, 0]]; gouache(c, st, '#f4ead6', 1, false); wash(c, st, '#c9b08a', { al: .35, seed }); ink(c, st, { close: true, w: 1.5, seed: seed + 1 }); const cap = []; for (let i = 0; i <= 16; i++) { const an = Math.PI * (1 - i / 16); cap.push([Math.cos(an) * 48, -38 - Math.sin(an) * 36]); } cap.push([40, -34], [-40, -34]); gouache(c, cap, '#d9443a'); wash(c, cap, '#8a2a22', { al: .35, seed: seed + 2 }); ink(c, cap, { close: true, w: 1.6, seed: seed + 3 });
      [[-24, -56, 6], [0, -66, 7], [24, -54, 5], [-8, -46, 4], [34, -44, 3.5]].forEach(([dx, dy, r], i) => { const sp = blob(dx, dy, r, r * .8, seed + 10 + i, .1, 7); gouache(c, sp, '#fbf3e2'); }); const d = [[-6, 0], [-6, -16], [0, -20], [6, -16], [6, 0]]; gouache(c, d, '#8a6446'); ink(c, d, { w: 1.1, seed: seed + 4 }); win.push([10, -26]); c.fillStyle = '#d2dfe0'; c.beginPath(); c.arc(10, -26, 4.5, 0, TAU); c.fill(); ink(c, blob(10, -26, 4.5, 4.5, seed + 5, .02, 8), { close: true, w: .9, seed: seed + 6 }); }
    else if (name === 'carriage') { ink(c, [[-62, 2], [62, 2]], { w: 2, color: '#6d4c35', seed, p: FLAT }); for (let i = 0; i < 9; i++) pencil(c, [[-58 + i * 14, 6], [-54 + i * 14, -1]], { w: 1.4, color: '#8a6446', alpha: .8, seed: seed + 80 + i, passes: 1 }); const bd = [[-50, -6], [-50, -40], [50, -40], [50, -6]]; gouache(c, bd, '#4f7a58', 1, false); wash(c, bd, '#244a30', { al: .35, seed: seed + 1, smooth: false }); ink(c, bd, { close: true, smooth: false, w: 1.6, seed: seed + 2 });
      const rf = [[-54, -40], [-46, -50], [46, -50], [54, -40]]; gouache(c, rf, '#c96f4f', 1, false); ink(c, rf, { close: true, smooth: false, w: 1.4, seed: seed + 3 }); [-32, -10, 12, 34].forEach((wx, i) => { c.fillStyle = '#d2dfe0'; c.fillRect(wx - 7, -34, 14, 14); ink(c, [[wx - 7, -34], [wx + 7, -34], [wx + 7, -20], [wx - 7, -20]], { close: true, smooth: false, w: 1, seed: seed + 10 + i }); if (i % 2 === 0) win.push([wx, -27]); }); [-34, 34].forEach((wx, i) => { const wh = blob(wx, -4, 8, 8, seed + 20 + i, .03, 10); gouache(c, wh, '#3a2e26'); ink(c, wh, { close: true, w: 1.1, seed: seed + 22 + i }); }); }
  });
  return win.map(([wx, wy]) => [x + wx * k, y + wy * k]); };
S.style = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season], m = Math.min(w, h); paper(c, w, h, o.color || P.sky, 9201); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .3], [-10, h * .4]], P.sky2, { al: .5, seed: 9202, smooth: false, off: 6, gran: .06, edge: .12 }); if (!o.night) sun(c, w * .82, h * .18, m * .07);
    hill(c, w, h, h * .62, h * .02, 1.6 / w, 9203, o.name === 'houseboat' ? '#bcd3cf' : P.mid, { washC: P.midW, alpha: .4 }); hill(c, w, h, h * .8, h * .012, 1 / w, 9204, P.near, { washC: P.nearW, line: 'ink', alpha: .6 }); tufts(c, 0, w, h * .8, h, Math.round(w / 8), 9205, P.shade); return {}; },
  fg(c, w, h, t, o) { const m = Math.min(w, h), nm = o.name || 'windmill', s = m * (nm === 'carriage' || nm === 'houseboat' ? .62 : .6), wins = styleHouse(c, nm, w * .5, h * .82, s, o.night ? t : t, 9300);
    if (o.kind) critter(c, o.kind, w * .2, h * .9, m * .26, { t, dpr: o.dpr, v: o.v });
    if (o.night) { night(o.el, c, w, h, wins.map(([x, y]) => ({ x, y, r: m * .25, k: .85, color: '#ffc768', a: .3 })), .84); wins.forEach(([x, y]) => { glow(c, x, y, m * .07, '#ffcf70', .7); c.fillStyle = '#ffdc84'; c.beginPath(); c.arc(x, y, m * .02, 0, TAU); c.fill(); }); stars(c, 0, 0, w, h * .4, 14, t, 9310); if (nm === 'lighthouse') { const [lx, ly] = wins[0], an = t * .9; c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(255,220,130,.22)'; c.beginPath(); c.moveTo(lx, ly); c.arc(lx, ly, w, an - .18, an + .18); c.closePath(); c.fill(); c.restore(); } } } };
function duckling(c, x, y, s, t, seed) { const hop = Math.abs(Math.sin(t * 5)) * s * .08; local(c, x, y - hop, s / 100, () => { const b = blob(0, -26, 26, 20, seed, .05, 10); gouache(c, b, '#f6d56a'); wash(c, b, '#d9a12a', { al: .35, seed: seed + 1 }); ink(c, b, { close: true, w: 1.4, seed: seed + 2 }); const hd = blob(16, -50, 15, 14, seed + 3, .04, 9); gouache(c, hd, '#f6d56a'); ink(c, hd, { close: true, w: 1.3, seed: seed + 4 }); const bk = [[28, -50], [40, -47], [28, -44]]; gouache(c, bk, '#e8873e', 1, false); ink(c, bk, { close: true, smooth: false, w: 1, seed: seed + 5 }); c.fillStyle = INK; c.beginPath(); c.arc(20, -53, 2.6, 0, TAU); c.fill(); }); }
function snail(c, x, y, s, t, seed) { local(c, x, y, s / 100, () => { const bd = [[-30, 0], [-28, -8], [20, -10], [34, -24], [40, -22], [36, -6], [30, 0]]; gouache(c, bd, '#d9c7a8'); ink(c, bd, { close: true, w: 1.2, seed }); const sh = blob(-2, -26, 22, 22, seed + 1, .03, 12); gouache(c, sh, '#c97a4a'); wash(c, sh, '#7a3e1e', { al: .4, seed: seed + 2 }); ink(c, sh, { close: true, w: 1.4, seed: seed + 3 }); const sp = []; for (let i = 0; i < 30; i++) { const an = i * .42, r = 18 - i * .55; sp.push([-2 + Math.cos(an) * r, -26 + Math.sin(an) * r]); } ink(c, sp, { w: 1, seed: seed + 4 }); [[36, -24, 40, -38], [40, -22, 48, -34]].forEach(([a0, b0, a1, b1], i) => { ink(c, [[a0, b0], [a1, b1 + Math.sin(t * 2 + i) * 2]], { w: 1, seed: seed + 5 + i }); c.fillStyle = INK; c.beginPath(); c.arc(a1, b1 + Math.sin(t * 2 + i) * 2, 2, 0, TAU); c.fill(); }); }); }
function moth(c, x, y, s, t, seed) { const flap = .55 + .45 * Math.abs(Math.sin(t * 12)); local(c, x, y, s / 100, () => { [-1, 1].forEach(d => { const wg = blob(d * 16, -2, 18 * flap, 14, seed + d, .06, 9, d * .3); gouache(c, wg, '#efe4cf', .95); wash(c, wg, '#b89a72', { al: .35, seed: seed + 3 + d }); ink(c, wg, { close: true, w: 1, seed: seed + 5 + d }); }); const bd = blob(0, 0, 4, 12, seed + 8, .05, 8); gouache(c, bd, '#8a6446'); ink(c, bd, { close: true, w: .9, seed: seed + 9 }); }); }
S.buddy = { anim: true,
  bg(c, w, h, o) { const P = SEASONS[o.season]; if (o.color !== 'none') paper(c, w, h, o.color || '#f6efe3', 9401); ground(c, w, h, h * .86, P, 9402, .44); return {}; },
  fg(c, w, h, t, o) { const K = CR[o.kind] ? o.kind : 'rabbit', s = fitS([K], w * .7, h, .8, .7), x = w * .44, y = h * .86, dir = FLIP(K), A = ANCH[K], k = s / 100, nm = o.name || 'duckling';
    if (nm === 'moth') { const lx = x + dir * s * .4, ly = y - s * .55; critter(c, K, x, y, s, { t, dpr: o.dpr, dir, shadow: false, v: o.v }); ink(c, [[lx, ly - s * .25], [lx, ly - s * .12]], { w: 1, seed: 9410 }); lantern(c, lx, ly, s * .14, t); glow(c, lx, ly, s * .4, '#ffd170', .55, 'source-over'); const an = t * 2.2; moth(c, lx + Math.cos(an) * s * .2, ly - s * .05 + Math.sin(an * 1.3) * s * .12, s * .16, t, 9420); return; }
    critter(c, K, x, y, s, { t, dpr: o.dpr, dir, shadow: false, v: o.v });
    if (nm === 'duckling') { const ph = (t * .25) % 2, dx = ph < 1 ? ph : 2 - ph; duckling(c, x + s * .5 + dx * w * .05, y + 2, s * .78, t, 9430); }
    if (nm === 'snail') { const [nx, ny] = A.top || A.neck; snail(c, x + (A.top ? A.top[0] + 10 : A.neck[0] + 14) * k * dir, y + (A.top ? A.top[1] + 12 : A.neck[1]) * k, s * .42, t, 9440); } } };
S.react = { anim: true,
  bg(c, w, h, o) { if (o.color !== 'none') paper(c, w, h, o.color || '#f6efe3', 9501); return {}; },
  fg(c, w, h, t, o) { const m = Math.min(w, h), cx = w / 2, cy = h / 2, nm = o.name;
    if (nm === 'chime') { ink(c, [[cx - m * .25, cy - m * .32], [cx + m * .25, cy - m * .32]], { w: 2, color: '#6d4c35', seed: 9510, p: FLAT }); const ring = (t % 3) < .9; [-.18, -.06, .06, .18].forEach((dx, i) => { const sw = ring ? Math.sin(t * 14 + i) * .12 : Math.sin(t * 1.4 + i) * .03, L = m * (.3 + (i % 2) * .08), x0 = cx + dx * m, y0 = cy - m * .32; local(c, x0, y0, 1, () => { c.rotate(sw); ink(c, [[0, 0], [0, m * .08]], { w: .8, seed: 9511 + i }); const tb = [[-m * .022, m * .08], [m * .022, m * .08], [m * .022, m * .08 + L], [-m * .022, m * .08 + L]]; gouache(c, tb, ['#c9973e', '#a9c0d0', '#c9973e', '#a9c0d0'][i], 1, false); ink(c, tb, { close: true, smooth: false, w: .9, seed: 9515 + i }); }); });
      if (ring) { local(c, cx + m * .2, cy + m * .3, m / 100, () => ICONS.dewdrop(c, 1.6)); c.save(); c.font = '700 ' + Math.round(m * .12) + 'px Gaegu, cursive'; c.fillStyle = '#c9973e'; c.fillText('ting', cx + m * .12, cy - m * .36); c.restore(); } }
    else if (nm === 'teacup') { const cup = [[cx - m * .2, cy], [cx + m * .2, cy], [cx + m * .15, cy + m * .22], [cx - m * .15, cy + m * .22]]; gouache(c, cup, '#fbf3e2', 1, false); wash(c, cup, '#6f8faa', { al: .25, seed: 9520, smooth: false }); ink(c, cup, { close: true, smooth: false, w: 1.4, seed: 9521 }); ink(c, blob(cx + m * .24, cy + m * .08, m * .06, m * .07, 9522, .05, 8).slice(0, 7), { w: 1.3, seed: 9523 }); const sau = blob(cx, cy + m * .24, m * .28, m * .04, 9524, .04, 10); gouache(c, sau, '#fbf3e2'); ink(c, sau, { close: true, w: 1.2, seed: 9525 }); if (o.state !== 'off') { smoke(c, cx - m * .05, cy - m * .02, m * .12, t, 9526); smoke(c, cx + m * .06, cy - m * .02, m * .1, t + 1.3, 9527); } }
    else if (nm === 'umbrella') { const open = o.state !== 'closed', an = Math.PI; ink(c, [[cx, cy - m * .1], [cx, cy + m * .32], [cx - m * .06, cy + m * .36]], { w: 1.8, color: '#6d4c35', seed: 9530 }); if (open) { const can = []; for (let i = 0; i <= 12; i++) { const a2 = an * (1 - i / 12); can.push([cx + Math.cos(a2) * m * .34, cy - m * .08 - Math.sin(a2) * m * .26]); } for (let i = 6; i >= 0; i--) can.push([cx - m * .34 + i * m * .113, cy - m * .08 + (i % 2 ? -m * .03 : 0)]); gouache(c, can, '#e2626b', 1, false); wash(c, can, '#a83a3f', { al: .3, seed: 9531, smooth: false }); ink(c, can, { close: true, smooth: false, w: 1.4, seed: 9532 }); for (let i = 0; i < 10; i++) { const ph = (t * .9 + hash(i, 9533)) % 1, x = w * (.1 + hash(i, 9534) * .8), y = h * ph; if (Math.abs(x - cx) < m * .34 && y > cy - m * .34) continue; c.strokeStyle = '#7fb7d8'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 7); c.stroke(); } } }
    else if (nm === 'scarf') { const K = CR[o.kind] ? o.kind : 'rabbit', s = fitS([K], w, h, .7, .7); critter(c, K, w * .46, h * .9, s, { t, dpr: o.dpr, shadow: false, v: { outfit: 'scarf', oc: '#c96f4f' } }); const A = ANCH[K], [nx, ny] = A.neck, k = s / 100; const bx = w * .46 + (nx + 14) * k, by = h * .9 + ny * k; const fl = Math.sin(t * 9) * 6; const tail = [[bx, by], [bx + 18, by + 4 + fl * .4], [bx + 34, by + fl], [bx + 30, by + 10 + fl], [bx + 14, by + 10], [bx, by + 8]]; gouache(c, tail, '#c96f4f'); ink(c, tail, { close: true, w: 1.1, seed: 9540 }); for (let i = 0; i < 3; i++) pencil(c, [[bx + 40, by - 6 + i * 8], [bx + 60, by - 8 + i * 8 + Math.sin(t * 4 + i) * 3]], { w: 1, color: '#8a7f75', alpha: .6, seed: 9541 + i, passes: 1 }); } } };


/* ---------- shop v2 expansion ---------- */
Object.assign(RARE, { aurora: { fill: '#d3ece2', wash: '#5e9e94', tint: '#e2f2ec' }, ember: { fill: '#ecae80', wash: '#a8452a', tint: '#f4dccb' }, cloud: { fill: '#f6f3fb', wash: '#a9a2c8', tint: '#efedf6' }, starry: { fill: '#3a3f66', wash: '#1b1f3d', tint: '#d9dbea' }, blossom: { fill: '#f7d9df', wash: '#d38a9b', tint: '#f8e6ea' }, mossy: { fill: '#cddca8', wash: '#6f8f4a', tint: '#e6edd4' } });
Object.keys(CR).forEach(k => { COATS[k] = Object.assign(COATS[k] || {}, RARE); });
const styleHouse0 = styleHouse;
styleHouse = function (c, name, x, y, s, t, seed) { if (!['skep', 'teapot', 'igloo'].includes(name)) return styleHouse0(c, name, x, y, s, t, seed); const k = s / 100, win = [];
  local(c, x, y, k, () => {
    if (name === 'skep') { for (let i = 0; i < 6; i++) { const w2 = 44 - i * 5 - (i > 3 ? (i - 3) * 6 : 0), yy = -i * 13; const b = [[-w2, yy], [-w2 + 2, yy - 13], [w2 - 2, yy - 13], [w2, yy]]; gouache(c, b, i % 2 ? '#e2b562' : '#d6a24a', 1, false); wash(c, b, '#8a5a1c', { al: .3, seed: seed + i, smooth: false }); ink(c, b, { close: true, w: 1.3, seed: seed + 10 + i }); for (let j = -2; j <= 2; j++) pencil(c, [[j * w2 * .35, yy - 2], [j * w2 * .35 + 2, yy - 11]], { w: .9, color: '#7a4e1a', alpha: .6, seed: seed + 20 + i * 5 + j, passes: 1 }); }
      const d = [[-9, 0], [-9, -16], [0, -22], [9, -16], [9, 0]]; gouache(c, d, '#5a3a20'); ink(c, d, { w: 1.1, seed: seed + 40 }); win.push([0, -48]); c.fillStyle = '#d2dfe0'; c.beginPath(); c.arc(0, -48, 5, 0, TAU); c.fill(); ink(c, blob(0, -48, 5, 5, seed + 41, .02, 8), { close: true, w: .9, seed: seed + 42 }); }
    else if (name === 'teapot') { const bd = blob(0, -36, 44, 34, seed, .03, 14); gouache(c, bd, '#6f8faa'); wash(c, bd, '#3e5a74', { al: .35, seed: seed + 1 }); ink(c, bd, { close: true, w: 1.6, seed: seed + 2 }); [[-24, -50], [10, -30], [26, -56]].forEach(([dx, dy], i) => gouache(c, blob(dx, dy, 6, 5, seed + 5 + i, .1, 7), '#fbf3e2', .85));
      const sp = [[40, -38], [62, -60], [68, -58], [48, -26]]; gouache(c, sp, '#6f8faa'); ink(c, sp, { close: true, w: 1.4, seed: seed + 3 }); ink(c, blob(-48, -38, 12, 16, seed + 4, .05, 9).slice(2, 8), { w: 1.6, seed: seed + 9 }); const lid = blob(0, -70, 20, 7, seed + 6, .05, 9); gouache(c, lid, '#3e5a74'); ink(c, lid, { close: true, w: 1.2, seed: seed + 7 }); c.fillStyle = '#e8b44e'; c.beginPath(); c.arc(0, -78, 4, 0, TAU); c.fill();
      const d = [[-8, -2], [-8, -18], [0, -24], [8, -18], [8, -2]]; gouache(c, d, '#fbf3e2'); ink(c, d, { w: 1.1, seed: seed + 8 }); win.push([22, -40]); c.fillStyle = '#d2dfe0'; c.fillRect(17, -45, 10, 10); if (t != null) smoke(c, 66, -62, 10, t, seed + 30); }
    else if (name === 'igloo') { const dm = []; for (let i = 0; i <= 18; i++) { const an = Math.PI * (1 - i / 18); dm.push([Math.cos(an) * 46, -Math.sin(an) * 44]); } gouache(c, dm, '#f4f8fb', 1, false); wash(c, dm, '#9fb3c2', { al: .35, seed, smooth: false }); ink(c, dm, { close: true, smooth: false, w: 1.6, seed: seed + 1 });
      for (let r = 1; r < 4; r++) { const yy = -r * 11, hw = Math.sqrt(Math.max(0, 1 - (yy / 44) ** 2)) * 46; pencil(c, [[-hw, yy], [hw, yy]], { w: 1, color: '#7f929d', alpha: .7, seed: seed + 10 + r, passes: 1 }); for (let j = -3; j <= 3; j++) { const xx = j * 13 + (r % 2) * 6; if (Math.abs(xx) < hw - 4) pencil(c, [[xx, yy], [xx, yy + 11]], { w: .9, color: '#7f929d', alpha: .6, seed: seed + 30 + r * 7 + j, passes: 1 }); } }
      const tn = []; for (let i = 0; i <= 10; i++) { const an = Math.PI * (1 - i / 10); tn.push([28 + Math.cos(an) * 18, -Math.sin(an) * 20]); } gouache(c, tn, '#f4f8fb', 1, false); ink(c, tn, { w: 1.4, seed: seed + 50, smooth: false }); const dr = []; for (let i = 0; i <= 8; i++) { const an = Math.PI * (1 - i / 8); dr.push([28 + Math.cos(an) * 9, -Math.sin(an) * 12]); } gouache(c, dr, '#2a2c48', 1, false); win.push([28, -6]); }
  }); return win.map(([wx, wy]) => [x + wx * k, y + wy * k]); };
const mothFn = moth;
function bfly(c, x, y, s, t, seed, cols) { const flap = .5 + .5 * Math.abs(Math.sin(t * 10)); local(c, x, y, s / 100, () => { [-1, 1].forEach(d => { const up = blob(d * 18 * flap, -10, 20 * flap, 16, seed + d, .06, 9, d * .4), lo = blob(d * 12 * flap, 10, 12 * flap, 11, seed + 4 + d, .06, 8, d * .2); [up, lo].forEach((wg, i) => { gouache(c, wg, cols[i]); ink(c, wg, { close: true, w: 1, seed: seed + 8 + i + d }); }); }); const bd = blob(0, 0, 3.5, 13, seed + 12, .05, 8); gouache(c, bd, INK); ink(c, [[-1, -12], [-6, -22]], { w: .8, seed: seed + 13 }); ink(c, [[1, -12], [6, -22]], { w: .8, seed: seed + 14 }); }); }
function ladybird(c, x, y, s, seed) { local(c, x, y, s / 100, () => { const b = blob(0, 0, 22, 18, seed, .04, 10); gouache(c, b, '#d9443a'); ink(c, b, { close: true, w: 1.3, seed: seed + 1 }); ink(c, [[0, -18], [0, 18]], { w: 1.2, seed: seed + 2, p: FLAT }); const hd = blob(0, -20, 10, 7, seed + 3, .05, 8); gouache(c, hd, INK); [[-9, -4], [9, -4], [-7, 8], [8, 9], [0, 2]].forEach(([dx, dy]) => { c.fillStyle = INK; c.beginPath(); c.arc(dx, dy, 3.6, 0, TAU); c.fill(); }); }); }
const buddyFg0 = S.buddy.fg;
S.buddy.fg = function (c, w, h, t, o) { const nm = o.name; if (!['butterfly', 'bee', 'ladybird', 'firefly'].includes(nm)) return buddyFg0.call(this, c, w, h, t, o);
  const K = CR[o.kind] ? o.kind : 'rabbit', s = fitS([K], w * .7, h, .8, .7), x = w * .44, y = h * .86, dir = FLIP(K), A = ANCH[K], k = s / 100; critter(c, K, x, y, s, { t, dpr: o.dpr, dir, shadow: false, v: o.v });
  const hx = x + (A.top[0] + 22) * k * dir, hy = y + A.top[1] * k;
  if (nm === 'butterfly') bfly(c, hx + Math.sin(t * 1.3) * s * .18, hy - s * .14 + Math.cos(t * 1.7) * s * .08, s * .62, t, 9610, ['#f2a35a', '#e86b4a']);
  if (nm === 'bee') { const bx = hx + Math.cos(t * 2.4) * s * .22, by = hy - s * .06 + Math.sin(t * 4.8) * s * .05; local(c, bx - s * .2, by - s * .2, s * .4 / 100, () => ICONS.bee(c, 1.4)); }
  if (nm === 'ladybird') ladybird(c, x + (A.neck[0] + 10) * k * dir, y + A.neck[1] * k - 4, s * .38, 9620);
  if (nm === 'firefly') { const fx = hx + Math.sin(t * .9) * s * .25, fy = hy + Math.cos(t * 1.2) * s * .12, a2 = .6 + .4 * Math.sin(t * 3); glow(c, fx, fy, s * .42, '#ffd66e', .8 * a2, 'source-over'); local(c, fx - s * .15, fy - s * .15, s * .3 / 100, () => ICONS.firefly(c, 1.4)); } };
const reactFg0 = S.react.fg;
S.react.fg = function (c, w, h, t, o) { const nm = o.name, m = Math.min(w, h), cx = w / 2, cy = h / 2; if (!['pinwheel', 'lights', 'vane'].includes(nm)) return reactFg0.call(this, c, w, h, t, o);
  if (nm === 'pinwheel') { ink(c, [[cx, cy], [cx, cy + m * .42]], { w: 2, color: '#6d4c35', seed: 9710, p: FLAT }); const on = (t % 4) < 2.6, an = on ? t * 9 : t * .4; ['#e2626b', '#f2c25a', '#6f8faa', '#8fb768'].forEach((col, i) => { const a1 = an + i * Math.PI / 2, p = [[cx, cy], [cx + Math.cos(a1) * m * .3, cy + Math.sin(a1) * m * .3], [cx + Math.cos(a1 + .9) * m * .16, cy + Math.sin(a1 + .9) * m * .16]]; gouache(c, p, col, 1, false); ink(c, p, { close: true, smooth: false, w: 1, seed: 9711 + i }); }); c.fillStyle = INK; c.beginPath(); c.arc(cx, cy, 3, 0, TAU); c.fill(); if (on) { c.save(); c.font = '700 ' + Math.round(m * .1) + 'px Gaegu, cursive'; c.fillStyle = '#8a5a1c'; c.fillText('voice note', w * .04, h * .14); c.restore(); } }
  if (nm === 'lights') { const P = []; for (let i = 0; i <= 20; i++) { const u = i / 20; P.push([w * .06 + u * w * .88, cy - m * .1 + Math.sin(u * Math.PI) * m * .22]); } ink(c, P, { w: 1, seed: 9720, p: FLAT }); const lit = 2 + Math.floor((t * .5) % 4); for (let i = 0; i < 6; i++) { const u = (i + .5) / 6, x = w * .06 + u * w * .88, y = cy - m * .1 + Math.sin(u * Math.PI) * m * .22 + 6, on = i < lit; if (on) glow(c, x, y + 4, m * .1, '#ffd66e', .7, 'source-over'); const b = blob(x, y + 5, m * .03, m * .045, 9721 + i, .05, 8); gouache(c, b, on ? '#ffe39a' : '#cfc8ba'); ink(c, b, { close: true, w: .8, seed: 9730 + i }); } c.save(); c.font = '700 ' + Math.round(m * .1) + 'px Gaegu, cursive'; c.fillStyle = '#8a5a1c'; c.fillText(lit + ' friends around', w * .2, h * .88); c.restore(); }
  if (nm === 'vane') { ink(c, [[cx, cy - m * .1], [cx, cy + m * .4]], { w: 2, color: '#6d4c35', seed: 9740, p: FLAT }); const an = Math.sin(t * .5) * 1.2; local(c, cx, cy - m * .1, 1, () => { c.rotate(an); const ar = [[-m * .24, -m * .025], [m * .14, -m * .025], [m * .14, -m * .065], [m * .26, 0], [m * .14, m * .065], [m * .14, m * .025], [-m * .24, m * .025]]; gouache(c, ar, '#3a2e26', 1, false); const tail = [[-m * .3, -m * .03], [-m * .38, -m * .12], [-m * .22, -m * .03]]; gouache(c, tail, '#3a2e26', 1, false); }); c.save(); c.font = '700 ' + Math.round(m * .1) + 'px Gaegu, cursive'; c.fillStyle = INK; ['N', 'E', 'S', 'W'].forEach((d, i) => { const a2 = i * Math.PI / 2 - Math.PI / 2; c.fillText(d, cx + Math.cos(a2) * m * .26 - 4, cy + m * .2 + Math.sin(a2) * m * .08); }); c.restore(); critter(c, 'sheep', w * .82, h * .97, m * .28, { t, dpr: o.dpr, dir: -1, shadow: false }); } };


/* ---------- icon v2 ---------- */
function iconArt(g, w, h, t, o, dir, night, L, lp) { const m = Math.min(w, h), on = n => L === 'all' || L === n || (L === 'fg' && ['cottage', 'glow', 'critter'].includes(n)) || (L === 'bg' && ['sky', 'hill'].includes(n));
  const sky = night ? ['#3a2a3c', '#6a4352', '#a0605a'] : ['#e9a88a', '#f2c49a', '#f8e2c0'], hillC = night ? '#3c4a32' : '#7e9f58', K = CR[o.kind] ? o.kind : 'rabbit', season = o.alt ? o.season : '';
  local(g, (w - m) / 2, (h - m) / 2, m / 100, () => {
    if (on('sky')) { const gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, sky[0]); gr.addColorStop(.55, sky[1]); gr.addColorStop(1, sky[2]); g.fillStyle = gr; g.fillRect(0, 0, 100, 100); wash(g, [[-5, -5], [105, -5], [105, 40], [-5, 52]], night ? '#24182a' : '#d98a7a', { al: .35, seed: 9801, smooth: false, gran: .1, edge: .1 });
      if (dir === 'c' || night) { g.fillStyle = '#fff3d6'; [[18, 16, 1.4], [78, 12, 1], [62, 24, .8]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }); }
      if (season === 'summer') sun(g, 80, 20, 9); }
    if (on('hill') && dir !== 'b') { const hp = []; for (let x = -5; x <= 105; x += 5) hp.push([x, (dir === 'c' ? 66 : 80) + Math.sin(x / 18) * 3 - (dir === 'c' ? Math.exp(-((x - 40) ** 2) / 900) * 12 : 0)]); hp.push([105, 105], [-5, 105]); gouache(g, hp, hillC, 1, false); wash(g, hp, night ? '#1f2a1c' : '#4f7a35', { al: .35, seed: 9802, smooth: false }); ink(g, hp.slice(0, -2), { w: 1.4, seed: 9803, smooth: false, p: FLAT, alpha: .7 }); }
    const winA = [33, 52, 34, 30];
    if (dir === 'a') {
      if (on('cottage')) { const wall = [[18, 90], [18, 50], [82, 50], [82, 90]]; gouache(g, wall, night ? '#d9c6a6' : '#f3e6cc', 1, false); wash(g, wall, '#b89a72', { al: .35, seed: 9804, smooth: false }); ink(g, wall, { close: true, smooth: false, w: 1.8, seed: 9805 });
        const roof = [[10, 54], [50, 18], [90, 54]]; gouache(g, roof, season === 'autumn' ? '#b85a30' : '#c96f4f', 1, false); wash(g, roof, '#7a3a24', { al: .4, seed: 9806, smooth: false }); ink(g, roof, { close: true, smooth: false, w: 2, seed: 9807 });
        if (season === 'winter') { const sn = [[16, 52], [50, 22], [84, 52], [80, 48], [50, 28], [20, 48]]; gouache(g, sn, '#ffffff', .96); }
        const fr = [[winA[0] - 2, winA[1] - 2], [winA[0] + winA[2] + 2, winA[1] - 2], [winA[0] + winA[2] + 2, winA[1] + winA[3] + 2], [winA[0] - 2, winA[1] + winA[3] + 2]]; gouache(g, fr, '#6d4c35', 1, false); }
      if (on('glow')) { const gl = g.createRadialGradient(50, 67, 0, 50, 67, 34); gl.addColorStop(0, 'rgba(255,220,130,' + (1 * lp) + ')'); gl.addColorStop(1, 'rgba(255,214,120,0)'); g.fillStyle = gl; g.fillRect(0, 30, 100, 70); g.fillStyle = lp > .02 ? mix('#5a4636', '#ffe08a', lp) : '#5a4636'; g.fillRect(winA[0], winA[1], winA[2], winA[3]); }
      if (on('critter')) { g.save(); g.beginPath(); g.rect(winA[0], winA[1], winA[2], winA[3]); g.clip(); if (!o.own) g.filter = 'brightness(0.18) sepia(.6)'; critter(g, K, 50, 84, fitS([K], 30, 34, 1, 1.15), { t: 0, dpr: o.dpr, dir: FLIP(K), shadow: false, v: o.v }); g.restore(); if (on('cottage')) ink(g, [[winA[0], winA[1]], [winA[0] + winA[2], winA[1]], [winA[0] + winA[2], winA[1] + winA[3]], [winA[0], winA[1] + winA[3]]], { close: true, smooth: false, w: 1.6, seed: 9808, color: '#4a3424' }); }
    } else if (dir === 'b') {
      if (on('critter')) { const A = ANCH[K], s = 100 / Math.max(A.head[2], A.head[3]) * 40; critter(g, K, 50 - A.head[0] * s / 100 * FLIP(K), 60 - A.head[1] * s / 100, s, { t: 0, dpr: o.dpr, dir: FLIP(K), shadow: false, v: o.v }); }
      if (on('glow')) { const gl = g.createRadialGradient(78, 80, 0, 78, 80, 40); gl.addColorStop(0, 'rgba(255,222,130,' + lp + ')'); gl.addColorStop(1, 'rgba(255,214,120,0)'); g.fillStyle = gl; g.fillRect(30, 40, 70, 60); }
      if (on('cottage')) { ink(g, [[78, 62], [78, 70]], { w: 1.2, seed: 9810 }); lantern(g, 78, 84, 15, 0); } }
    else { const hs = [[28, 62, 30, 'c96f4f'], [70, 66, 22, '6f8faa']];
      hs.forEach(([x, y, s, roof], i) => { if (on('cottage')) { const wall = [[x - s * .42, y], [x - s * .42, y - s * .5], [x + s * .42, y - s * .5], [x + s * .42, y]]; gouache(g, wall, night ? '#2a2226' : '#3a2e2a', 1, false); const rf = [[x - s * .55, y - s * .46], [x, y - s * .95], [x + s * .55, y - s * .46]]; gouache(g, rf, night ? '#2a2226' : '#3a2e2a', 1, false); if (season === 'winter') gouache(g, [[x - s * .55, y - s * .46], [x, y - s * .95], [x + s * .55, y - s * .46], [x + s * .4, y - s * .5], [x, y - s * .82], [x - s * .4, y - s * .5]], '#ffffff', .95); }
        if (on('glow')) { const wx = x + s * .1, wy = y - s * .3, ws = s * .2; const gl = g.createRadialGradient(wx, wy, 0, wx, wy, s * .7); gl.addColorStop(0, 'rgba(255,214,120,' + (.9 * lp) + ')'); gl.addColorStop(1, 'rgba(255,214,120,0)'); g.fillStyle = gl; g.fillRect(wx - s, wy - s, s * 2, s * 2); g.fillStyle = mix('#3a2e2a', '#ffd877', lp); g.fillRect(wx - ws / 2, wy - ws / 2, ws, ws); } }); }
    if (season === 'spring' && on('critter')) { g.fillStyle = '#f3b4bf'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(10 + hash(i, 81) * 80, 8 + hash(i, 82) * 40, 2.2, 1.4, hash(i, 83) * 3, 0, TAU); g.fill(); } }
    if (season === 'autumn' && on('critter')) for (let i = 0; i < 7; i++) { const lf = blob(10 + hash(i, 84) * 80, 10 + hash(i, 85) * 60, 3, 1.8, 9850 + i, .1, 7, hash(i, 86) * 3); gouache(g, lf, ['#d9643f', '#e8a23a', '#b85a30'][i % 3]); } }); }
S.icon2 = { anim: true, bg() { return {}; },
  fg(c, w, h, t, o) { const mode = o.state || 'default', L = o.items || 'all', d = o.dpr, pr = o.progress != null ? +o.progress : (o.cast && o.cast.length ? 1 : null), lp = o.progress != null ? clamp(+o.progress, 0, 1) : mode === 'lighting' ? clamp(((t % 2.4) - .3) / .6, 0, 1) : 1;
    const Lc = o.el.layer('ic2'), g = Lc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, Lc.width, Lc.height); g.setTransform(d, 0, 0, d, 0, 0);
    o.own = o.v && (o.v.outfit || o.v.coat); iconArt(g, w, h, t, o, o.name || 'a', mode === 'dark' || mode === 'clear', mode === 'mono' ? 'fg' : L, lp);
    if (mode === 'mono') { const col = o.color || '#3f5a31', m = Math.min(w, h), ox = (w - m) / 2, oy = (h - m) / 2, k = m / 100; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, Lc.width, Lc.height); g.setTransform(d, 0, 0, d, 0, 0); if ((o.name || 'a') === 'a') { g.globalCompositeOperation = 'destination-out'; g.fillRect(ox + 33 * k, oy + 52 * k, 34 * k, 30 * k); g.globalCompositeOperation = 'source-over'; g.save(); g.beginPath(); g.rect(ox + 33 * k, oy + 52 * k, 34 * k, 30 * k); g.clip(); g.filter = 'brightness(0)'; const K = CR[o.kind] ? o.kind : 'rabbit'; critter(g, K, ox + 50 * k, oy + 84 * k, fitS([K], 30 * k, 34 * k, 1, 1.15), { t: 0, dpr: d, dir: FLIP(K), shadow: false }); g.restore(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, Lc.width, Lc.height); } g.globalCompositeOperation = 'source-over'; }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); if (mode === 'tinted') c.filter = 'grayscale(1) contrast(1.15) brightness(1.05)'; if (mode === 'clear') { c.globalAlpha = .62; } c.drawImage(Lc, 0, 0); c.restore();
    if (mode === 'clear') { c.save(); const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.restore(); } } };
S.horizon = { anim: false, bg(c, w, h, o) { paper(c, w, h, o.night ? '#241e26' : '#F5EEE2', 9901); const y = h * .62, pts = []; for (let x = -10; x <= w + 10; x += 8) pts.push([x, y + noise1(x * .01, 9902) * h * .012]); pencil(c, pts, { w: 1.1, color: o.night ? '#8a7f9a' : '#8b7e72', alpha: .55, seed: 9903, passes: 2, smooth: false }); return {}; } };


/* ---------- people, hands, store panorama ---------- */
const SKIN = { a: ['#f3d2b8', '#d39a7c'], b: ['#e3b48e', '#b5795a'], c: ['#b37b56', '#7d5236'], d: ['#7c4f35', '#4e2f1d'] };
function person(c, x, y, s, o = {}) {
  const k = s / 100, sk = SKIN[o.skin] || SKIN.a, top = o.top || '#d6a24a', hair = o.hair || '#4a3324', pants = o.pants || '#5d6f9a', seed = o.seed || 7000, lw = 1.5;
  local(c, x, y, k, () => { if (o.rot) c.rotate(o.rot);
    const legs = blob(0, -9, 31, 10, seed, .05, 12); gouache(c, legs, pants); wash(c, legs, shade(pants, .4), { al: .35, seed: seed + 1 }); ink(c, legs, { close: true, w: lw, seed: seed + 2 });
    [[-25, -4], [25, -4]].forEach(([fx, fy], i) => { const f = blob(fx, fy, 7, 4.5, seed + 3 + i, .08, 8); gouache(c, f, '#6d4c35'); ink(c, f, { close: true, w: lw * .8, seed: seed + 5 + i }); });
    const tor = [[-16, -60], [16, -60], [22, -42], [25, -14], [-25, -14], [-22, -42]];
    gouache(c, tor, top); wash(c, blob(8, -34, 16, 22, seed + 7, .1, 9), shade(top, .35), { al: .4, seed: seed + 8, clip: toPath(tor) });
    for (let i = 0; i < 6; i++) pencil(c, [[-20 + i * 8, -22], [-20 + i * 8, -15]], { w: .9, color: shade(top, .55), alpha: .7, seed: seed + 10 + i, passes: 1 });
    ink(c, tor, { close: true, w: lw, seed: seed + 9 });
    gouache(c, [[-4.5, -64], [4.5, -64], [4.5, -58], [-4.5, -58]], sk[0], 1, false);
    if (o.prop === 'mug') { const m = [[-6.5, -40], [6.5, -40], [5.5, -25], [-5.5, -25]]; gouache(c, m, '#e8b44e', 1, false); ink(c, m, { close: true, smooth: false, w: lw * .8, seed: seed + 20 }); ink(c, [[6.5, -37], [10.5, -34], [6, -29]], { w: lw * .7, seed: seed + 21 }); }
    if (o.prop === 'phone') { gouache(c, [[-6, -47], [6, -47], [6, -27], [-6, -27]], '#2a221d', 1, false); gouache(c, [[-4.6, -45.5], [4.6, -45.5], [4.6, -28.5], [-4.6, -28.5]], '#ffe6a6', 1, false); }
    [-1, 1].forEach((d, i) => { const arm = [[16, -58], [25, -46], [24, -32], [9, -27], [7, -33], [15, -38], [13, -52]].map(p => [p[0] * d, p[1]]); gouache(c, arm, top); ink(c, arm, { close: true, w: lw * .9, seed: seed + 22 + i }); const hd = blob(7 * d, -30, 5, 4.6, seed + 24 + i, .06, 8); gouache(c, hd, sk[0]); ink(c, hd, { close: true, w: lw * .7, seed: seed + 26 + i }); });
    const head = blob(0, -76, 13.5, 14.5, seed + 30, .03, 11); gouache(c, head, sk[0]); wash(c, blob(5, -71, 9, 9, seed + 31, .1, 8), sk[1], { al: .3, seed: seed + 32, clip: toPath(head) }); ink(c, head, { close: true, w: lw, seed: seed + 33 });
    const st = o.style || 'bob'; let hp, sm = true;
    if (st === 'curly') { sm = false; hp = []; for (let i = 0; i <= 22; i++) { const an = Math.PI * (1 + i / 22), r = 17 + (i % 2 ? 2.6 : 0); hp.push([Math.cos(an) * r * 1.05, -77 + Math.sin(an) * r]); } hp.push([14, -73], [7, -82], [-7, -82], [-14, -73]); }
    else if (st === 'bun' || st === 'short') hp = [[-14.5, -73], [-13, -86], [-5, -91.5], [5, -91.5], [13, -86], [14.5, -73], [11, -81], [3, -84], [-6, -83], [-11, -79]];
    else hp = [[-16, -62], [-17.5, -78], [-12, -90], [0, -93], [12, -90], [17.5, -78], [16, -62], [12, -64], [11.5, -78], [4, -83], [-6, -82], [-11.5, -78], [-12, -64]];
    if (st === 'bun') { const b = blob(0, -96, 7, 6, seed + 34, .06, 9); gouache(c, b, hair); ink(c, b, { close: true, w: lw * .9, seed: seed + 35 }); }
    gouache(c, hp, hair, 1, sm); wash(c, hp, shade(hair, .4), { al: .35, seed: seed + 36, smooth: sm }); ink(c, hp, { close: true, w: lw * .95, seed: seed + 37, smooth: sm });
    const es = o.eyes || 'open'; eye(c, -5, -75, 1.9, es, lw, seed + 38); eye(c, 5, -75, 1.9, es, lw, seed + 39);
    blush(c, -8.5, -70.5, 3.2, seed + 40); blush(c, 8.5, -70.5, 3.2, seed + 41); ink(c, [[-3, -68.6], [0, -67], [3, -68.6]], { w: lw * .6, seed: seed + 42, p: FLAT });
  });
}
function hand(c, x, y, s, ang, o = {}) { const k = s / 100, sk = SKIN[o.skin] || SKIN.b, sl = o.sleeve || '#c96f4f', seed = o.seed || 7100;
  local(c, x, y, k, () => { c.rotate(ang);
    const sleeve = [[-8, 72], [31, 68], [38, 160], [-8, 162]]; gouache(c, sleeve, sl, 1, false); wash(c, sleeve, shade(sl, .35), { al: .4, seed, smooth: false });
    for (let i = 0; i < 5; i++) pencil(c, [[-5 + i * 8, 74], [-4 + i * 8, 87]], { w: 1, color: shade(sl, .5), alpha: .7, seed: seed + 10 + i, passes: 1 });
    ink(c, sleeve, { close: true, smooth: false, w: 1.8, seed: seed + 1 });
    const palm = blob(10, 54, 20, 19, seed + 2, .05, 11); gouache(c, palm, sk[0]); wash(c, blob(16, 60, 12, 12, seed + 3, .1, 8), sk[1], { al: .3, seed: seed + 3, clip: toPath(palm) }); ink(c, palm, { close: true, w: 1.5, seed: seed + 4 });
    [[14, 38, 7, 6.5], [22, 43, 7, 6.5], [28, 51, 6.5, 6]].forEach((f, i) => { const b = blob(f[0], f[1], f[2], f[3], seed + 5 + i, .06, 9); gouache(c, b, sk[0]); ink(c, b, { close: true, w: 1.3, seed: seed + 8 + i }); });
    const th = [[-5, 44], [-14, 36], [-19, 41], [-13, 54], [-2, 62]]; gouache(c, th, sk[0]); ink(c, th, { close: true, w: 1.4, seed: seed + 11 });
    const ix = [[-6.5, 42], [-6.5, 7], [-4.5, 1], [0, -1], [4.5, 1], [6.5, 7], [6.5, 42]]; gouache(c, ix, sk[0]); ink(c, ix, { w: 1.5, seed: seed + 12 });
    gouache(c, blob(0, 5, 3.4, 3.2, seed + 13, .05, 8), tint(sk[0], .45)); pencil(c, [[-4, 22], [3, 21]], { w: .9, alpha: .6, seed: seed + 14, passes: 1 });
  }); }
const PANO = { b: { cx: 1.43, cy: .66, w: .56, rot: -7, tap: [152, 694] }, e: { cx: 4.53, cy: .7, w: .54, rot: 6 } };
function phPt(P, lx, ly, FW, H) { const s = P.w * FW / 393, dx = (lx - 196.5) * s, dy = (ly - 426) * s, r = P.rot * Math.PI / 180; return [P.cx * FW + dx * Math.cos(r) - dy * Math.sin(r), P.cy * H + dx * Math.sin(r) + dy * Math.cos(r)]; }
const PA_KINDS = [['owl', .17, .56], ['sheep', .5, .555], ['mole', .83, .565], ['rabbit', .17, .76], ['hedgehog', .5, .755], ['frog', .83, .765]];
const LPOST = [.08, .94, 2.07, 2.92, 3.88, 4.97, 5.95];
function panoOpts(w, h, o) { const idx = o.name != null && o.name !== '' && !isNaN(+o.name) ? +o.name : -1, FW = idx >= 0 ? w : w / 6; return { idx, FW, X0: idx >= 0 ? idx * FW : 0, on: i => idx < 0 || Math.abs(i - idx) <= 1 }; }
function ribbonFill(c, pts, w0, w1, fill, washC, seed) { const s = crPts(pts, false, 3), L = [], R = [];
  for (let i = 0; i < s.length; i++) { const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl, hw = lerp(w0, w1, i / (s.length - 1)) / 2 * (1 + noise1(i * .2, seed) * .1); L.push([s[i][0] + nx * hw, s[i][1] + ny * hw]); R.push([s[i][0] - nx * hw, s[i][1] - ny * hw]); }
  const poly = L.concat(R.slice().reverse()); gouache(c, poly, fill, 1, false); wash(c, poly, washC, { al: .5, seed: seed + 1, smooth: false, off: 2 });
  ink(c, L, { w: 1.2, seed: seed + 2, smooth: false, alpha: .7, p: FLAT }); ink(c, R, { w: 1.2, seed: seed + 3, smooth: false, alpha: .7, p: FLAT });
  for (let i = 3; i < s.length - 3; i += 6) { const p = s[i], q = s[i + 2]; pencil(c, [[p[0] - 4, p[1]], [q[0] + 4, q[1]]], { w: 1, color: '#ffffff', alpha: .8, seed: seed + 10 + i, passes: 1 }); } }
function panoSky(c, x0, x1, H, nt) { const g = c.createLinearGradient(0, 0, 0, H * .64), sk = nt ? ['#3a2e44', '#5a4256', '#7a5660'] : ['#eab9a3', '#f2cdac', '#f8e4c6']; g.addColorStop(0, sk[0]); g.addColorStop(.62, sk[1]); g.addColorStop(1, sk[2]); c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = g; c.fillRect(x0, 0, x1 - x0, H); c.restore(); }
function strings(c, xs, y0, sag, FW, m, seed) { for (let i = 0; i < xs.length - 1; i++) { const a = xs[i], b = xs[i + 1], pts = []; for (let j = 0; j <= 16; j++) { const u = j / 16; pts.push([lerp(a, b, u), y0 + Math.sin(Math.PI * u) * sag]); } ink(c, pts, { w: .9, color: '#4a3424', seed: seed + i, alpha: .75, p: FLAT });
  const n = Math.max(2, Math.round((b - a) / (FW * .12))); for (let j = 1; j < n; j++) { const u = j / n, x = lerp(a, b, u), y = y0 + Math.sin(Math.PI * u) * sag + 4; m.bulbs.push([x, y]); const r = Math.max(2.4, FW * .011); ink(c, [[x, y - r - 3], [x, y - r]], { w: .8, color: '#4a3424', seed: seed + 40 + j, p: FLAT }); const bb = blob(x, y, r, r * 1.15, seed + 60 + i * 9 + j, .06, 8); gouache(c, bb, ['#f3c96a', '#ef9f7a', '#f6e1a0'][j % 3]); ink(c, bb, { close: true, w: .8, seed: seed + 80 + j, alpha: .8 }); } } }
function post(c, x, y0, y1, seed) { const p = [[x - 2.2, y1], [x - 1.8, y0], [x + 1.8, y0 - 1], [x + 2.4, y1]]; gouache(c, p, '#8a6446', 1, false); ink(c, p, { close: true, smooth: false, w: 1.1, seed }); }
function tentNote(c, x, y, w, h, seed) { const f = [[x - w / 2, y + h / 2], [x - w / 2 + 2, y - h / 2], [x + w / 2 - 1, y - h / 2 - 1], [x + w / 2, y + h / 2]]; gouache(c, [[x - w / 2 + 4, y - h / 2 - 5], [x + w / 2 - 2, y - h / 2 - 6], [x + w / 2 - 1, y - h / 2 - 1], [x - w / 2 + 2, y - h / 2]], '#e8dcc4', 1, false); gouache(c, f, '#fffaf0', 1, false); wash(c, f, '#d8c3a2', { al: .25, seed, smooth: false }); ink(c, f, { close: true, smooth: false, w: 1.2, seed: seed + 1 }); const lf = blob(x + w / 2 - 6, y - h / 2 - 2, 5, 2.4, seed + 2, .08, 8, -.5); gouache(c, lf, '#8fb768'); ink(c, lf, { close: true, w: .8, seed: seed + 3 }); }
S.pano = { anim: true,
  bg(c, w, h, o) { const { idx, FW, X0, on } = panoOpts(w, h, o), W6 = FW * 6, H = h, nt = o.night, P = SEASONS[o.season] || SEASONS.summer, X1 = idx >= 0 ? X0 + FW : W6, m = { homes: [], bulbs: [], fire: [3.47 * FW, .845 * H] };
    c.translate(-X0, 0); c.save(); c.translate(X0, 0); paper(c, X1 - X0, H, '#f5eee2', 8001 + Math.max(0, idx)); c.restore(); panoSky(c, X0, X1, H, nt);
    wash(c, [[-10, H * .06], [W6 + 10, H * .02], [W6 + 10, H * .2], [-10, H * .26]], nt ? '#241c2e' : '#e39a86', { al: .2, seed: 8002, smooth: false, off: 10, gran: .08, edge: .08 });
    if (!nt) glow(c, 3.5 * FW, H * .52, FW * 1.3, '#f7c27a', .45, 'source-over');
    const Y1 = hill(c, W6, H, H * .5, H * .025, .006 * 340 / FW, 8003, P.far, { washC: P.farW, alpha: .35 });
    [[1.9, 'fox'], [2.2, 'duck'], [3.22, 'badger'], [3.98, 'otter'], [4.95, 'cat'], [5.62, 'bear']].forEach(([u, k], i) => { if (on(Math.floor(u))) m.homes.push({ hm: house(c, u * FW, Y1(u * FW) + 3, FW * .1, { roof: ROOF[k] || '#c96f4f', seed: 8060 + i, lit: true }), lit: true }); });
    hill(c, W6, H, H * .6, H * .018, .005 * 340 / FW, 8004, P.mid, { washC: P.midW, alpha: .4 });
    if (on(1)) tree(c, 1.93 * FW, H * .71, FW * .6, P, 8005);
    hill(c, W6, H, H * .7, H * .012, .004 * 340 / FW, 8006, P.near, { washC: P.nearW, line: 'ink', alpha: .65 });
    LPOST.forEach((u, i) => { if (on(Math.floor(u))) post(c, u * FW, H * .325, H * .73, 8070 + i); }); strings(c, LPOST.map(u => u * FW), H * .33, H * .045, FW, m, 8080);
    if (on(0)) PA_KINDS.forEach(([k, u, v], i) => m.homes.push({ hm: house(c, u * FW, v * H, (i < 3 ? .23 : .27) * FW, { roof: ROOF[k], seed: 8010 + i, lit: true }), lit: true, smoke: i === 1 || i === 3 }));
    if (on(3) || on(4)) ribbonFill(c, [[3.8, .6], [3.9, .68], [3.98, .77], [4.05, .86], [4.1, .95], [4.14, 1.05]].map(([u, v]) => [u * FW, v * H]), FW * .03, FW * .22, '#bcd6d8', '#5f93a6', 8020);
    pathRibbon(c, [[-.1, .93], [.45, .9], [1.0, .925], [1.6, .9], [2.2, .9], [2.75, .93], [3.2, .935], [3.7, .92], [4.1, .9], [4.6, .91], [5.1, .9], [5.5, .86], [6.1, .87]].map(([u, v]) => [u * FW, v * H]), FW * .16, FW * .16, P, 8021);
    if (on(4)) { const bx = 4.07 * FW, by = .905 * H, bw = FW * .26, top = [], bot = []; for (let j = 0; j <= 10; j++) { const u = j / 10, x = bx - bw / 2 + bw * u, y = by - Math.sin(Math.PI * u) * FW * .04; top.push([x, y - 4]); bot.push([x, y + 6]); }
      gouache(c, top.concat(bot.slice().reverse()), '#c49b6f', 1, false); for (let j = 1; j < 10; j++) pencil(c, [top[j], bot[j]], { w: .8, color: '#6d4c35', alpha: .6, seed: 8030 + j, passes: 1 }); ink(c, top, { w: 1.3, seed: 8041 }); ink(c, bot, { w: 1.3, seed: 8042 });
      const rail = top.map(p => [p[0], p[1] - FW * .045]); ink(c, rail, { w: 1.2, seed: 8043, color: '#5b412e' }); [0, 3, 7, 10].forEach((j, q) => ink(c, [top[j], rail[j]], { w: 1.2, seed: 8044 + q, color: '#5b412e', p: FLAT })); }
    if (on(2)) { const mx = 2.5 * FW, my = .83 * H, ms = .6 * FW; m.mo = house(c, mx, my, ms, { roof: ROOF.mole, seed: 8040 }); const step = blob(mx, my + 5, ms * .32, ms * .045, 8045, .06, 10); gouache(c, step, '#bdb5a8'); wash(c, step, '#7d756b', { al: .35, seed: 8046 }); ink(c, step, { close: true, w: 1.1, seed: 8047 });
      tentNote(c, 2.668 * FW, .842 * H, .2 * FW, .1 * FW, 8048); const pot = [[mx - ms * .4, my], [mx - ms * .38, my - ms * .08], [mx - ms * .3, my - ms * .08], [mx - ms * .28, my]]; gouache(c, pot, '#c9774e', 1, false); ink(c, pot, { close: true, smooth: false, w: 1, seed: 8049 }); [-1, 0, 1].forEach(d => gouache(c, blob(mx - ms * .34 + d * 5, my - ms * .12, 4, 3, 8050 + d, .1, 7), ['#e8b44e', '#f0b3b6', '#fbf3e2'][d + 1])); }
    if (on(3)) { firering(c, m.fire[0], m.fire[1], FW * .09, 8051, true); [[3.03, .72, '0', .09], [3.12, .71, '1', .11], [3.22, .7, '2', .13]].forEach(([u, v, st, sz]) => { const S2 = sz * FW; c.save(); c.translate(u * FW - S2 / 2, v * H - S2 * .8); S.seed.bg(c, S2, S2, { stage: st }); c.restore(); });
      for (let j = 1; j < 14; j++) { const u = j / 14, x = lerp(3.24 * FW, m.fire[0] - FW * .02, u), y = lerp(.64 * H, .78 * H, u) - Math.sin(Math.PI * u) * H * .05; c.fillStyle = 'rgba(176,100,58,.55)'; c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill(); }
      person(c, 3.25 * FW, .875 * H, .27 * FW, { skin: 'a', hair: '#5a3a26', style: 'bob', top: '#d6a24a', pants: '#5d6f9a', prop: 'mug', seed: 7101, rot: .04 });
      person(c, 3.72 * FW, .885 * H, .28 * FW, { skin: 'd', hair: '#1f1814', style: 'curly', top: '#6f9a5a', pants: '#8a6f98', prop: 'mug', seed: 7102, rot: -.05 }); }
    if (on(5)) { m.homes.push({ hm: house(c, 5.88 * FW, .62 * H, .22 * FW, { roof: ROOF.owl, seed: 8052, lit: true }), lit: true });
      const bx = 5.5 * FW, bw = .78 * FW, bt = .47 * H, bb = .77 * H; [-1, 1].forEach((d, i) => post(c, bx + d * bw * .38, bt - 4, .9 * H, 8053 + i));
      const roof = [[bx - bw / 2 - 8, bt + 2], [bx, bt - FW * .07], [bx + bw / 2 + 8, bt + 1]]; gouache(c, roof, '#9b7454', 1, false); wash(c, roof, '#5b412e', { al: .35, seed: 8055, smooth: false }); ink(c, roof, { close: true, smooth: false, w: 1.5, seed: 8056 });
      const bd = [[bx - bw / 2, bt], [bx + bw / 2, bt - 2], [bx + bw / 2 + 2, bb], [bx - bw / 2 - 1, bb + 2]]; gouache(c, bd, '#d9b98c', 1, false); wash(c, bd, '#8a6446', { al: .3, seed: 8057, smooth: false, off: 3 }); for (let j = 1; j < 6; j++) pencil(c, [[bx - bw / 2 + 2, bt + (bb - bt) * j / 6], [bx + bw / 2 - 2, bt + (bb - bt) * j / 6 + 1]], { w: .8, color: '#7a5535', alpha: .35, seed: 8058 + j, passes: 1 }); ink(c, bd, { close: true, smooth: false, w: 1.6, seed: 8065 }); m.board = [bx, bt - FW * .07]; }
    tufts(c, X0, X1, H * .72, H, Math.round((X1 - X0) / 7), 8090, P.shade); flowers(c, X0, X1, H * .74, H, Math.round((X1 - X0) / 40), 8091, P.flower);
    return m; },
  fg(c, w, h, t, o) { const { idx, FW, X0, on } = panoOpts(w, h, o), H = h, m = o.meta, nt = o.night, D = o.dpr; if (!m.homes) return; c.save(); c.translate(-X0, 0);
    if (!nt) [[.55, .42], [2.25, .45], [4.1, .41], [5.45, .43]].forEach(([u, v], i) => { if (on(Math.floor(u))) cloud(c, u * FW + Math.sin(t * .05 + i) * FW * .08, v * H, FW * .24, 8100 + i, D); });
    m.homes.forEach((x, i) => { if (x.smoke) smoke(c, x.hm.chim[0], x.hm.chim[1], FW * .035, t + i, 8110 + i); });
    if (on(0)) PA_KINDS.forEach(([k, u, v], i) => critter(c, k, (u - .03) * FW, v * H + (i < 3 ? .028 : .045) * H, (i < 3 ? .12 : .15) * FW, { t, dpr: D, ph: i * .37, dir: i % 2 ? -1 : 1 }));
    if (on(2)) { const s = .2 * FW, x = 2.356 * FW, y = .865 * H; critter(c, 'mole', x, y, s, { t, sleep: true, dpr: D }); zzz(c, x + s * .25, y - s * .9, s * .3, t); }
    if (on(3)) { critter(c, 'fox', 3.47 * FW, .745 * H, .12 * FW, { t, dpr: D, ph: .1 }); critter(c, 'hedgehog', 3.07 * FW, .905 * H, .15 * FW, { t, dpr: D, ph: .3 }); critter(c, 'rabbit', 3.37 * FW, .94 * H, .12 * FW, { t, dpr: D, ph: .5 }); critter(c, 'sheep', 3.9 * FW, .915 * H, .15 * FW, { t, dpr: D, dir: -1, ph: .7 }); critter(c, 'frog', 3.57 * FW, .96 * H, .11 * FW, { t, dpr: D, dir: -1, ph: .9 }); }
    if (on(5) && m.board) critter(c, 'owl', m.board[0], m.board[1] + 3, .14 * FW, { t, dpr: D, shadow: false, ph: .4 });
    if (nt) { const L = []; m.homes.forEach(x => x.lit && L.push({ x: x.hm.win[0] - X0, y: x.hm.win[1], r: FW * .2, k: .8 })); if (on(3)) L.push({ x: m.fire[0] - X0, y: m.fire[1] - FW * .08, r: FW * 1.05, k: 1 }); m.bulbs.forEach(b => L.push({ x: b[0] - X0, y: b[1], r: FW * .09, k: .55 })); night(o.el, c, w, h, L, .74, '#2a1f33'); }
    m.homes.forEach(x => x.lit && litWindow(c, x.hm)); m.bulbs.forEach((b, i) => glow(c, b[0], b[1], FW * (nt ? .07 : .045), '#ffd27a', (nt ? .55 : .35) + .1 * Math.sin(t * 2 + i), 'screen'));
    if (on(3)) { const [fx, fy] = m.fire, fl = 1 + noise1(t * 5, 3) * .05; glow(c, fx, fy - FW * .05, FW * .5 * fl, '#ffb050', nt ? .55 : .35); flame(c, fx, fy, FW * .13, t, 8120); sparks(c, fx, fy, FW * .12, t, 8121); }
    if (nt) stars(c, X0, H * .02, X0 + w, H * .32, Math.round(w / 12), t, 8130); moon(c, 2.84 * FW, .42 * H, FW * .045);
    fireflies(c, Math.round(w / (nt ? 70 : 150)), X0, H * .55, X0 + w, H * .9, t, 8131);
    c.restore(); } };
S.panofront = { anim: true, bg() { return {}; },
  fg(c, w, h, t, o) { const { FW, X0, on } = panoOpts(w, h, o), H = h, D = o.dpr, B = PANO.b, E = PANO.e, rb = B.rot * Math.PI / 180, re = E.rot * Math.PI / 180; c.save(); c.translate(-X0, 0);
    if (on(1)) { const [hx, hy] = phPt(B, 305, 0, FW, H); critter(c, 'hedgehog', hx, hy, FW * .19, { t, dpr: D, rot: rb, shadow: false, dir: -1, ph: .3 });
      const [tx, ty] = phPt(B, B.tap[0], B.tap[1], FW, H), rp = (t % 4) / 4; if (rp < .35) { c.save(); c.globalAlpha = (1 - rp / .35) * .9; c.strokeStyle = '#ffe39a'; c.lineWidth = 2; c.beginPath(); c.arc(tx, ty, 6 + rp * 120, 0, TAU); c.stroke(); c.restore(); }
      const P0 = [tx, ty - 8], P1 = [2.02 * FW, .3 * H], P2 = [2.55 * FW, .83 * H - .1 * FW], qb = u => [(1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0], (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1]];
      for (let i = 2; i < 30; i++) { const [x, y] = qb(i / 30); c.fillStyle = 'rgba(255,222,130,.8)'; c.beginPath(); c.arc(x, y, Math.max(1.2, FW * .005), 0, TAU); c.fill(); }
      const fu = clamp(rp / .8, 0, 1), e = fu < .5 ? 2 * fu * fu : 1 - Math.pow(-2 * fu + 2, 2) / 2, [fx, fy] = qb(e), fs = FW * .13; if (rp < .82) local(c, fx - fs / 2, fy - fs / 2, fs / 100, () => ICONS.firefly(c, 1.6, INK));
      const pa = .6 + .4 * Math.sin(t * 2.4); glow(c, P2[0], P2[1], FW * .12, '#ffd66e', .65 * pa, 'source-over'); c.fillStyle = '#fff3c0'; c.beginPath(); c.arc(P2[0], P2[1], Math.max(2, FW * .008), 0, TAU); c.fill();
      hand(c, tx, ty, FW * .5, -.5, { skin: 'b', sleeve: '#c96f4f' }); }
    if (on(4)) { const [ax, ay] = phPt(E, 290, 0, FW, H); critter(c, 'frog', ax, ay, FW * .17, { t, dpr: D, rot: re, shadow: false, dir: -1, ph: .6 }); const [bx, by] = phPt(E, 70, 0, FW, H); critter(c, 'mouse', bx, by, FW * .13, { t, dpr: D, rot: re, shadow: false, ph: .9 });
      critter(c, 'sheep', 4.24 * FW, .975 * H, FW * .19, { t, dpr: D, ph: .2 });
      const [wx, wy] = phPt(E, 196, 150, FW, H); for (let i = 0; i < 8; i++) { const ph = (t * .1 + i / 8) % 1, an = -2.9 + i * .62, r = ph * FW * .75, x = wx + Math.cos(an) * r + Math.sin(t + i) * 8, y = wy + Math.sin(an) * r * .8 - ph * FW * .1, al = Math.sin(ph * Math.PI); glow(c, x, y, FW * .04, '#ffd66e', .6 * al); c.fillStyle = 'rgba(255,246,196,' + al + ')'; c.beginPath(); c.arc(x, y, Math.max(1.4, FW * .006), 0, TAU); c.fill(); } }
    c.restore(); } };
S.panowide = { anim: true,
  bg(c, w, h, o) { const nt = o.night, P = SEASONS[o.season] || SEASONS.summer, m = { homes: [], bulbs: [] }; paper(c, w, h, '#f5eee2', 8201); panoSky(c, 0, w, h, nt); if (!nt) glow(c, w * .62, h * .55, h * .9, '#f7c27a', .45, 'source-over');
    const Y1 = hill(c, w, h, h * .55, h * .03, 2 / h, 8202, P.far, { washC: P.farW, alpha: .35 }), R = Object.values(ROOF), n = Math.max(3, Math.round(w / (h * .5)));
    const fgm = o.name === 'fg'; for (let i = 0; i < n; i++) { const u = (i + .5) / n + (hash(i, 8203) - .5) * .4 / n; if (fgm && u < .5) continue; m.homes.push({ hm: house(c, u * w, Y1(u * w) + 3, h * .12, { roof: R[i % R.length], seed: 8210 + i, lit: true }), lit: true }); }
    hill(c, w, h, h * .66, h * .02, 1.6 / h, 8204, P.mid, { washC: P.midW, alpha: .4 }); hill(c, w, h, h * .78, h * .012, 1.2 / h, 8205, P.near, { washC: P.nearW, line: 'ink', alpha: .65 });
    const ps = []; for (let i = 0; i <= Math.ceil(w / (h * .9)); i++) ps.push(i * h * .9 + h * .2); if (!fgm) { ps.forEach((x, i) => post(c, x, h * .3, h * .8, 8220 + i)); strings(c, ps, h * .31, h * .05, h * .9, m, 8230); }
    const pts = []; for (let x = -20; x <= w + 20; x += w / 8) pts.push([x, h * .93 + Math.sin(x / h * 2) * h * .02]); pathRibbon(c, pts, h * .1, h * .1, P, 8240); tufts(c, 0, w, h * .8, h, Math.round(w / 8), 8241, P.shade); return m; },
  fg(c, w, h, t, o) { const m = o.meta, nt = o.night; if (!m.homes) return; if (nt) night(o.el, c, w, h, m.homes.map(x => ({ x: x.hm.win[0], y: x.hm.win[1], r: h * .2, k: .8 })).concat(m.bulbs.map(b => ({ x: b[0], y: b[1], r: h * .08, k: .55 }))), .74, '#2a1f33');
    m.homes.forEach(x => litWindow(c, x.hm)); m.bulbs.forEach((b, i) => glow(c, b[0], b[1], h * .05, '#ffd27a', .4 + .1 * Math.sin(t * 2 + i), 'screen')); if (nt) stars(c, 0, h * .02, w, h * .3, Math.round(w / 14), t, 8250); fireflies(c, Math.round(w / 90), 0, h * .55, w, h * .9, t, 8251); } };
S.lineupfront = { anim: true, bg() { return {}; }, fg(c, w, h, t, o) { S.lineup.fg(c, w, h, t, o); } };
S.sofa = { anim: true,
  bg(c, w, h, o) { const solo = o.name === 'solo', m = { solo };
    paper(c, w, h, '#efe0c8', 8301); wash(c, [[-10, -10], [w + 10, -10], [w + 10, h * .8], [-10, h * .8]], '#d4b48c', { al: .28, seed: 8302, smooth: false, off: 4, gran: .1, edge: 0 });
    for (let i = 0; i < 7; i++) for (let j = 0; j < 9; j++) { const x = (i + .5 + (j % 2) * .5) * w / 7, y = h * .05 + j * h * .085; if (y > h * .78) continue; pencil(c, [[x - 3, y + 3], [x, y - 3], [x + 3, y + 3]], { w: .8, color: '#a88b6a', alpha: .35, seed: 8310 + i * 9 + j, passes: 1 }); }
    const wx = w * .5, wy = h * .42, ww = w * .58, wh = h * .17, wr = [[wx - ww / 2, wy - wh / 2], [wx + ww / 2, wy - wh / 2], [wx + ww / 2, wy + wh / 2], [wx - ww / 2, wy + wh / 2]];
    c.save(); c.clip(toPath(wr, true, false)); const g = c.createLinearGradient(0, wy - wh / 2, 0, wy + wh / 2); g.addColorStop(0, '#3e3048'); g.addColorStop(.65, '#c27a6a'); g.addColorStop(1, '#f0b98e'); c.fillStyle = g; c.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
    hill(c, w, h, wy + wh * .22, wh * .06, .02, 8303, '#5d6f4a', { line: false }); m.hm = house(c, wx + ww * .22, wy + wh * .32, wh * .42, { roof: '#c96f4f', seed: 8304, lit: true }); m.moon = [wx - ww * .28, wy - wh * .2, wh * .1]; c.restore();
    ink(c, wr, { close: true, smooth: false, w: 2, seed: 8305 }); ink(c, [[wx, wy - wh / 2], [wx, wy + wh / 2]], { w: 1.6, seed: 8306 }); ink(c, [[wx - ww / 2, wy], [wx + ww / 2, wy]], { w: 1.4, seed: 8307 });
    [-1, 1].forEach((d, i) => { const ex = wx + d * ww / 2, cu = [[ex - d * 16, wy - wh / 2 - 14], [ex + d * 12, wy - wh / 2 - 14], [ex + d * 18, wy + wh / 2 + 14], [ex - d * 6, wy + wh / 2 + 8]]; gouache(c, cu, '#d9a19a'); wash(c, cu, '#a85f58', { al: .35, seed: 8308 + i }); ink(c, cu, { close: true, w: 1.3, seed: 8312 + i }); });
    const fl = [[-10, h * .8], [w + 10, h * .8], [w + 10, h + 10], [-10, h + 10]]; gouache(c, fl, '#c9a27a', 1, false); wash(c, fl, '#8a6446', { al: .35, seed: 8314, smooth: false }); for (let i = 1; i < 5; i++) pencil(c, [[-10, h * .8 + i * h * .05], [w + 10, h * .8 + i * h * .05 + 2]], { w: .8, alpha: .3, seed: 8315 + i, passes: 1 });
    const rug = blob(w * .5, h * .91, w * .44, h * .045, 8320, .05, 12); gouache(c, rug, '#d4704e'); wash(c, rug, '#9e4630', { al: .3, seed: 8321 }); ink(c, rug, { close: true, w: 1.2, seed: 8322 });
    const lx = w * .07; ink(c, [[lx, h * .8], [lx, h * .5]], { w: 2, seed: 8323 }); const sh = [[lx - w * .065, h * .5], [lx + w * .065, h * .5], [lx + w * .04, h * .43], [lx - w * .04, h * .43]]; gouache(c, sh, '#f3d27a', 1, false); ink(c, sh, { close: true, smooth: false, w: 1.5, seed: 8324 }); m.lamp = [lx, h * .47];
    const sc = '#7e9f6a', sw = shade(sc, .35), top = h * .55, seat = h * .7, bot = h * .8, L = w * .16, R = w * .9;
    const back = [[L + 6, seat], [L, top + 14], [L + 14, top], [R - 14, top], [R, top + 14], [R - 6, seat]]; gouache(c, back, sc); wash(c, back, sw, { al: .35, seed: 8325 }); ink(c, back, { close: true, w: 1.8, seed: 8326 });
    const cush = [[L + 4, seat - 8], [R - 4, seat - 8], [R - 2, bot - 14], [L + 2, bot - 14]]; gouache(c, cush, tint(sc, .1)); ink(c, cush, { close: true, w: 1.5, seed: 8327 }); const base = [[L, bot - 16], [R, bot - 16], [R, bot], [L, bot]]; gouache(c, base, sw, 1, false); ink(c, base, { close: true, smooth: false, w: 1.5, seed: 8328 });
    [-1, 1].forEach((d, i) => { const ax = d < 0 ? L : R, arm = [[ax - d * 14, bot], [ax + d * 6, bot], [ax + d * 10, seat - h * .05], [ax - d * 2, seat - h * .075], [ax - d * 20, seat - h * .06], [ax - d * 22, bot]]; gouache(c, arm, sc); wash(c, arm, sw, { al: .3, seed: 8330 + i }); ink(c, arm, { close: true, w: 1.6, seed: 8332 + i }); });
    m.armL = [L - 4, seat - h * .07]; m.k = w * .33 / 100; m.seat = seat;
    if (solo) person(c, w * .44, seat + 6, w * .36, { skin: 'b', hair: '#3a2a20', style: 'bun', top: '#c96f4f', pants: '#5d6f9a', prop: 'mug', seed: 7201, eyes: 'blink' });
    else { person(c, w * .42, seat + 6, w * .33, { skin: 'c', hair: '#1f1814', style: 'curly', top: '#e8b44e', pants: '#6f8faa', prop: 'phone', seed: 7202, rot: .1 }); person(c, w * .65, seat + 6, w * .33, { skin: 'a', hair: '#8a5a32', style: 'bob', top: '#8a6f98', pants: '#5d6f9a', prop: 'mug', seed: 7203, rot: -.13 }); }
    return m; },
  fg(c, w, h, t, o) { const m = o.meta, D = o.dpr; if (!m.lamp) return; glow(c, m.lamp[0], m.lamp[1], w * .32, '#ffd27a', .35, 'source-over'); litWindow(c, m.hm); moon(c, m.moon[0], m.moon[1], m.moon[2]);
    critter(c, 'rabbit', m.armL[0], m.armL[1], w * .13, { t, dpr: D, shadow: false, ph: .2, sleep: m.solo });
    if (m.solo) { const x = w * .74, y = m.seat - 2, s = w * .2; critter(c, 'owl', x, y, s, { t, sleep: true, dpr: D, shadow: false }); zzz(c, x + s * .25, y - s * .9, s * .3, t); }
    else { critter(c, 'hedgehog', w * .83, m.seat - 2, w * .17, { t, dpr: D, shadow: false, dir: -1, ph: .5 }); const k = m.k, x = w * .42 + Math.sin(.1) * 37 * k, y = m.seat + 6 - Math.cos(.1) * 37 * k; glow(c, x, y, w * .12, '#ffe6a6', .55, 'screen'); } } };
S.apart = { anim: true,
  bg(c, w, h, o) { paper(c, w, h, '#f5eee2', 8401); const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#3a2e48'); g.addColorStop(.36, '#55405a'); g.addColorStop(.64, '#eab49a'); g.addColorStop(1, '#f6dcbc'); c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = g; c.fillRect(0, h * .28, w, h * .6); c.restore();
    const fd = c.createLinearGradient(0, h * .28, 0, h * .44); fd.addColorStop(0, 'rgba(245,238,226,1)'); fd.addColorStop(1, 'rgba(245,238,226,0)'); c.fillStyle = fd; c.fillRect(0, h * .28, w, h * .16);
    const lake = blob(w * .5, h * .78, w * .24, h * .05, 8402, .05, 12); gouache(c, lake, '#a9c7cf'); wash(c, lake, '#5f93a6', { al: .5, seed: 8403 }); ink(c, lake, { close: true, w: 1.2, seed: 8404 });
    const hl = [[-10, h + 10], [-10, h * .64], [w * .2, h * .6], [w * .42, h * .68], [w * .46, h + 10]], hr = [[w * .54, h + 10], [w * .58, h * .7], [w * .8, h * .62], [w + 10, h * .66], [w + 10, h + 10]];
    gouache(c, hl, '#55684a', 1); wash(c, hl, '#2f3d28', { al: .4, seed: 8405 }); ink(c, hl.slice(1, 4), { w: 1.4, seed: 8406 }); gouache(c, hr, '#9cbd74', 1); wash(c, hr, '#5d8a3c', { al: .35, seed: 8407 }); ink(c, hr.slice(1, 4), { w: 1.4, seed: 8408 });
    const L = house(c, w * .22, h * .74, w * .32, { roof: ROOF.owl, seed: 8410, lit: true }), R = house(c, w * .8, h * .75, w * .32, { roof: ROOF.rabbit, seed: 8411 });
    tufts(c, 0, w, h * .72, h, 40, 8412, '#4c6e33'); return { L, R }; },
  fg(c, w, h, t, o) { const m = o.meta, D = o.dpr; if (!m.L) return; stars(c, 0, h * .4, w * .42, h * .6, 18, t, 8420); moon(c, w * .12, h * .47, w * .035); sun(c, w * .88, h * .5, w * .05); litWindow(c, m.L);
    critter(c, 'owl', w * .12, h * .82, w * .15, { t, dpr: D, ph: .2 }); critter(c, 'rabbit', w * .9, h * .83, w * .15, { t, dpr: D, dir: -1, ph: .6 });
    const P0 = m.L.win, P2 = [m.R.door[0] + w * .03, m.R.door[1]], P1 = [w * .5, h * .4], qb = u => [(1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0], (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1]];
    for (let i = 1; i < 26; i++) { const [x, y] = qb(i / 26); c.fillStyle = 'rgba(255,222,130,.8)'; c.beginPath(); c.arc(x, y, 1.4, 0, TAU); c.fill(); }
    const u = (t % 5) / 5, [fx, fy] = qb(u), fs = w * .12; local(c, fx - fs / 2, fy - fs / 2, fs / 100, () => ICONS.firefly(c, 1.6, INK)); glow(c, P2[0], P2[1], w * .08, '#ffd66e', .5 + .2 * Math.sin(t * 2.4), 'source-over'); } };

/* ---------- element + ticker ---------- */
let motion = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const live = new Set(), t0 = performance.now();
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { e.target.visible = e.isIntersecting; if (e.isIntersecting) e.target.dirty = true; }), { rootMargin: '200px' }) : null;
const ro = new ResizeObserver(es => es.forEach(e => { e.target.dirty = true; }));
class KfArt extends HTMLElement {
  static get observedAttributes() { return ['scene', 'season', 'kind', 'stage', 'lit', 'night', 'name', 'color', 'state', 'firefly', 'rain', 'alt', 'fruit', 'progress', 'coat', 'mark', 'outfit', 'ocolor', 'cast', 'pose', 'caption', 'items', 'still', 'fog', 'reveal', 'lang']; }
  connectedCallback() {
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none'; this.appendChild(this.cv); this.ctx = this.cv.getContext('2d'); this.layers = {}; }
    if (getComputedStyle(this).display === 'inline') this.style.display = 'block';
    this.visible = !io; this.dirty = true; live.add(this); ro.observe(this); io && io.observe(this); kick();
  }
  disconnectedCallback() { live.delete(this); ro.unobserve(this); io && io.unobserve(this); }
  attributeChangedCallback() { this.bgc = null; this.dirty = true; kick(); }
  layer(n) { let L = this.layers[n]; if (!L || L.width !== this.cv.width || L.height !== this.cv.height) { L = this.layers[n] = document.createElement('canvas'); L.width = this.cv.width; L.height = this.cv.height; } return L; }
  opts() { const a = n => this.getAttribute(n), b = n => { const v = a(n); return v != null && v !== 'false' && v !== ''; };
    return { lang: a('lang'), season: SEASONS[a('season')] ? a('season') : 'spring', kind: a('kind'), stage: a('stage'), lit: (a('lit') || 'rabbit,hedgehog,frog,sheep').split(','), night: b('night'), name: a('name'), color: a('color'), state: a('state'), firefly: b('firefly'), rain: b('rain'), alt: b('alt'), fruit: a('fruit'), progress: a('progress'), pose: a('pose'), cap: a('caption'), items: a('items'), v: { coat: a('coat'), mark: a('mark'), outfit: a('outfit'), oc: a('ocolor') }, cast: (a('cast') || '').split(',').filter(Boolean).map(s => { const [kind, coat, mark, outfit, oc, z] = s.split('/'); return { kind, coat, mark, outfit, oc, sleep: z === 'z' }; }) }; }
  get anim() { if (this.hasAttribute('still')) return false; const sc = S[this.getAttribute('scene')]; return !!(sc && sc.anim) || this.hasAttribute('reveal') || this.hasAttribute('fog'); }
  draw(t) {
    const w = this.clientWidth, h = this.clientHeight; if (!w || !h) return; const sc = S[this.getAttribute('scene')]; if (!sc) return;
    const d = this.dpr = (+this.getAttribute('dpr') || 2), W = Math.round(w * d), H = Math.round(h * d);
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.bgc = null; }
    const o = this.opts(); o.el = this; o.dpr = d;
    if (!this.bgc) { const b = this.bgc = document.createElement('canvas'); b.width = W; b.height = H; const g = b.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); U = 1; try { this.meta = (sc.bg && sc.bg(g, w, h, o)) || {}; } catch (e) { console.error('kf-art bg', this.getAttribute('scene'), e); this.meta = {}; } }
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, W, H); c.drawImage(this.bgc, 0, 0);
    c.setTransform(d, 0, 0, d, 0, 0); o.meta = this.meta; U = 1;
    if (sc.fg) { try { sc.fg(c, w, h, t, o); } catch (e) { console.error('kf-art fg', this.getAttribute('scene'), e); } }
    const still = this.hasAttribute('still') || !motion;
    if (this.hasAttribute('fog')) mist(c, w, h, still ? 4 : t);
    if (this.hasAttribute('reveal')) { const rp = this.getAttribute('reveal'); revealMask(c, w, h, still ? 1 : (rp && !isNaN(+rp) ? +rp : clamp(((t % 7) - .3) / 4.2, 0, 1)), d); }
    this.dirty = false;
  }
}
let last = 0, raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < 1000 / 12 - 2) return; last = now; const t = (now - t0) / 1000;
  let bgs = 0; for (const el of live) { if (!el.visible) continue; const nb = !el.bgc; if (nb && bgs >= 5) continue; if (nb || el.dirty || (motion && el.anim)) { el.draw(motion && !el.hasAttribute('still') ? t : 1.2); if (nb && el.bgc) bgs++; } }
}
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
customElements.define('kf-art', KfArt);
if (document.fonts) Promise.all([document.fonts.load('700 20px Gaegu'), document.fonts.ready]).then(() => { live.forEach(el => { el.bgc = null; el.dirty = true; }); }).catch(() => {});
window.KF = { setMotion(m) { motion = !!m; live.forEach(el => el.dirty = true); }, CR, NAMES };
})();
