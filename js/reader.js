/* Aqua Crystal — on-device strip reader.
   Loads a photo onto a canvas, lets the user align 7 pad markers + a white-balance
   marker, samples average pad colors, white-balances them, and matches each pad
   against the reference chart (CIE Lab nearest + interpolation). No network needed. */
window.AC = window.AC || {};

AC.reader = (function () {
  const MAXDIM = 1600;
  let stage, canvas, ctx;          // visible canvas inside positioned stage
  let img = null, natW = 0, natH = 0;
  let padCount = 7;                // set from the configured strip type
  // normalized coords (0..1) — endpoints of the pad line + white reference
  let m = { p1: { x: 0.5, y: 0.12 }, p7: { x: 0.5, y: 0.82 }, wb: { x: 0.22, y: 0.5 } };
  let handles = {};                // marker DOM elements
  let padDots = [];

  function init(stageEl, canvasEl) {
    stage = stageEl; canvas = canvasEl;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }

  function hasImage() { return !!img; }

  function setPadCount(n) {
    padCount = Math.max(2, n | 0);
    if (img) buildMarkers();
  }

  function reset() {
    img = null; natW = natH = 0;
    if (ctx && canvas.width) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.height = 0;
    stage.querySelectorAll(".marker").forEach(e => e.remove());
    padDots = []; handles = {};
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAXDIM / Math.max(im.width, im.height));
        natW = Math.round(im.width * scale);
        natH = Math.round(im.height * scale);
        canvas.width = natW; canvas.height = natH;
        ctx.drawImage(im, 0, 0, natW, natH);
        img = im;
        buildMarkers();
        resolve();
      };
      im.onerror = reject;
      im.src = url;
    });
  }

  /* ---------- markers ---------- */

  function pct(v) { return (v * 100).toFixed(2) + "%"; }

  function makeHandle(cls, title) {
    const el = document.createElement("div");
    el.className = "marker " + cls;
    el.title = title;
    stage.appendChild(el);
    return el;
  }

  function buildMarkers() {
    stage.querySelectorAll(".marker").forEach(e => e.remove());
    padDots = [];
    handles.p1 = makeHandle("handle", "Drag onto the CENTER of the FIRST pad (top)");
    handles.p7 = makeHandle("handle", "Drag onto the CENTER of the LAST pad (bottom)");
    handles.wb = makeHandle("wb", "Drag onto a WHITE part of the strip");
    handles.p1.textContent = "1";
    handles.p7.textContent = String(padCount);
    handles.wb.textContent = "W";
    for (let i = 1; i <= padCount - 2; i++) padDots.push(makeHandle("dot", "pad " + (i + 1)));
    for (const key of ["p1", "p7", "wb"]) enableDrag(handles[key], key);
    layout();
  }

  function layout() {
    if (!handles.p1) return;
    handles.p1.style.left = pct(m.p1.x); handles.p1.style.top = pct(m.p1.y);
    handles.p7.style.left = pct(m.p7.x); handles.p7.style.top = pct(m.p7.y);
    handles.wb.style.left = pct(m.wb.x); handles.wb.style.top = pct(m.wb.y);
    for (let i = 0; i < padDots.length; i++) {
      const t = (i + 1) / (padCount - 1);
      padDots[i].style.left = pct(m.p1.x + (m.p7.x - m.p1.x) * t);
      padDots[i].style.top = pct(m.p1.y + (m.p7.y - m.p1.y) * t);
    }
  }

  function enableDrag(el, key) {
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      const move = (e) => {
        const r = stage.getBoundingClientRect();
        m[key].x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        m[key].y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        layout();
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
  }

  /* ---------- sampling ---------- */

  function samplePoint(c, cx, xNorm, yNorm, radiusFrac) {
    const w = c.width, h = c.height;
    const r = Math.max(3, Math.round(Math.min(w, h) * radiusFrac));
    const x0 = Math.max(0, Math.round(xNorm * w) - r);
    const y0 = Math.max(0, Math.round(yNorm * h) - r);
    const size = Math.min(2 * r, w - x0, h - y0);
    const data = cx.getImageData(x0, y0, size, size).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; }
    return n ? [R / n, G / n, B / n] : [0, 0, 0];
  }

  function currentPadPoints() {
    const pts = [];
    for (let i = 0; i < padCount; i++) {
      const t = i / (padCount - 1);
      pts.push({ x: m.p1.x + (m.p7.x - m.p1.x) * t, y: m.p1.y + (m.p7.y - m.p1.y) * t });
    }
    return pts;
  }

  /* white balance: scale channels so the white sample becomes neutral */
  function whiteBalance(rgb, wb) {
    const mean = (wb[0] + wb[1] + wb[2]) / 3;
    return rgb.map((c, i) => {
      const gain = Math.min(2, Math.max(0.5, mean / Math.max(1, wb[i])));
      return Math.min(255, Math.max(0, c * gain));
    });
  }

  /* ---------- color math ---------- */

  function hex2rgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgb2lab(rgb) {
    let [r, g, b] = rgb.map(v => {
      v /= 255;
      return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
    });
    let X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let Y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
    let Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function dE(a, b) {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }

  /* match one sampled color against a pad scale → interpolated value + confidence */
  function matchScale(rgb, scale) {
    const lab = rgb2lab(rgb);
    const ds = scale.map(s => dE(lab, rgb2lab(hex2rgb(s.hex))));
    let bi = 0;
    ds.forEach((d, i) => { if (d < ds[bi]) bi = i; });
    // interpolate toward the nearer adjacent scale entry
    let v = scale[bi].v;
    const neighbors = [bi - 1, bi + 1].filter(i => i >= 0 && i < scale.length);
    if (neighbors.length) {
      let ni = neighbors[0];
      if (neighbors.length === 2 && ds[neighbors[1]] < ds[neighbors[0]]) ni = neighbors[1];
      const total = ds[bi] + ds[ni];
      if (total > 0) {
        const w = ds[bi] / total; // 0 = exactly on best, 0.5 = midway
        v = scale[bi].v + (scale[ni].v - scale[bi].v) * Math.min(0.5, w);
      }
    }
    return { value: v, dist: ds[bi] };
  }

  /* analyze the aligned strip against the chart → { padId: {value, dist, rgb} }
     padIds = pad ids in top-to-bottom strip order (defaults to all chart pads) */
  function analyze(chart, padIds) {
    if (!img) throw new Error("no image");
    const wbRgb = samplePoint(canvas, ctx, m.wb.x, m.wb.y, 0.012);
    const pts = currentPadPoints();
    const out = {};
    const pads = (padIds || chart.pads.map(p => p.id))
      .map(id => chart.pads.find(p => p.id === id)).filter(Boolean);
    pads.forEach((pad, i) => {
      const raw = samplePoint(canvas, ctx, pts[i].x, pts[i].y, 0.012);
      const rgb = whiteBalance(raw, wbRgb);
      const res = matchScale(rgb, pad.scale);
      const dec = pad.dec;
      out[pad.id] = {
        value: Number(res.value.toFixed(dec)),
        dist: Math.round(res.dist),
        rgb: rgb.map(Math.round)
      };
    });
    return out;
  }

  function getJpegBase64(maxDim) {
    const scale = Math.min(1, (maxDim || 900) / Math.max(natW, natH));
    const c = document.createElement("canvas");
    c.width = Math.round(natW * scale); c.height = Math.round(natH * scale);
    c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  }

  return { init, loadFile, hasImage, setPadCount, reset, analyze, getJpegBase64, samplePoint, rgb2lab, hex2rgb };
})();
