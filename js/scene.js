/* Hero "scene": a procedurally generated satellite view of an embayed coast with an
   estuary mouth and sandbars — the kind of landscape this research is about.
   It is rendered at a coarse pixel size (think 30 m Landsat pixels), acquired
   top-to-bottom like a pushbroom sensor, then the shoreline is "extracted" as a vector.
   Switching the band combination re-colours the scene (and the whole site). */
(function () {
  "use strict";

  const canvas = document.getElementById("scene");
  if (!canvas) return;
  const hero = canvas.parentElement;
  const ctx = canvas.getContext("2d", { alpha: false });
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- deterministic value noise ---------- */
  function hash(x, y) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1013904223;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  }
  function fbm(x, y, oct) {
    let v = 0, amp = 0.5, f = 1, sum = 0;
    for (let i = 0; i < (oct || 4); i++) { v += amp * noise(x * f, y * f); sum += amp; amp *= 0.5; f *= 2.1; }
    return v / sum; // 0..1
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  function lerpRGB(c1, c2, t) { return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)]; }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  /* ---------- palettes per band combination ---------- */
  const PAL = {
    rgb: {  // true colour
      deep: "#0E3A4E", shallow: "#2F7E8B", turbid: "#6F8F72", foam: "#F1EEE4",
      sand: "#E4D4A3", low: "#A3AC6C", veg: "#2E5E40", vegDark: "#1B3E2B", laterite: "#8B4A33", line: "#FFB84D"
    },
    nir: {  // false colour composite, NIR–R–G: vegetation red, water black, bare soil pale
      deep: "#05070C", shallow: "#0E1A26", turbid: "#2B3D4C", foam: "#E9F2F1",
      sand: "#DCE6E3", low: "#E58671", veg: "#C62E26", vegDark: "#7A1A15", laterite: "#9FAAB1", line: "#8DF0FF"
    },
    ndwi: { // water index: water bright, land suppressed
      deep: "#63C4EE", shallow: "#3C9BCB", turbid: "#2E7FAD", foam: "#EAF7FD",
      sand: "#3E4B50", low: "#2E3A38", veg: "#1A2420", vegDark: "#121A17", laterite: "#2A3335", line: "#FFD166"
    }
  };

  /* ---------- terrain model ---------- */
  let W = 320, H = 180;
  let field = null;      // Float32Array of elevation (+ land / − water)
  let chan = null;       // channel mask 0..1 (estuary)
  let shoreline = null;  // [x,y,...] boundary pixels, sorted top to bottom

  function coastX(v) {
    // headlands (west-pointing) and bays alternate down the coast; sea is to the west (left)
    return 0.50 + 0.085 * Math.sin(v * Math.PI * 2 * 1.7 + 0.9) + 0.06 * (fbm(0.37, v * 2.6, 3) - 0.5);
  }

  function buildField() {
    field = new Float32Array(W * H);
    chan = new Float32Array(W * H);
    const aspect = W / H;
    for (let y = 0; y < H; y++) {
      const v = y / H;
      const cx = coastX(v);
      for (let x = 0; x < W; x++) {
        const u = x / W;
        let e = (u - cx) * 2.4 + 0.32 * (fbm(u * 3.2 * aspect, v * 3.2, 4) - 0.5);

        // estuary: a channel entering the sea inside a bay, meandering inland, funnel-shaped at the mouth
        const mouthV = 0.40;                                      // keeps the mouth clear of the headline
        const vc = mouthV + 0.06 * Math.sin((u - cx) * 8 + 0.4) * clamp((u - cx + 0.1) / 0.25, 0, 1);
        const dv = Math.abs(v - vc) * (1 / aspect);               // widths expressed as fractions of width
        const inland = clamp((u - cx + 0.06) / 0.6, 0, 1);        // 0 at the mouth, 1 far inland
        const halfW = 0.009 + 0.05 * Math.pow(1 - inland, 1.6);   // wide at the mouth, narrowing inland
        const c = clamp(1 - dv / halfW, 0, 1);
        const cs = smooth(c);
        let channel = cs * clamp((u - cx + 0.2) / 0.12, 0, 1);  // only cut where there is land to cut
        // a thinner tributary joining from the south-east
        const vb = mouthV + 0.07 + 0.26 * clamp((u - cx - 0.16) / 0.35, 0, 1);
        const db = Math.abs(v - vb) * (1 / aspect);
        const branch = smooth(clamp(1 - db / 0.008, 0, 1)) * clamp((u - cx - 0.14) / 0.08, 0, 1);
        channel = Math.max(channel, branch * 0.85);
        if (channel > 0) e -= channel * (0.9 + 0.2 * fbm(u * 9, v * 9, 2));

        // sandbars at the estuary mouth: patches of positive elevation inside the channel
        const mouthMask = cs * clamp(1 - Math.abs(u - cx - 0.02) / 0.08, 0, 1);
        if (mouthMask > 0) {
          const n = fbm(u * 18 * aspect + 7.3, v * 18 + 2.1, 3);
          e += mouthMask * Math.max(0, n - 0.55) * 2.4;
        }
        field[y * W + x] = e;
        chan[y * W + x] = channel;
      }
    }
    // shoreline: land pixels with water to the west/north/south/east
    const pts = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (field[i] >= 0 && (field[i - 1] < 0 || field[i + 1] < 0 || field[i - W] < 0 || field[i + W] < 0)) pts.push(x, y);
      }
    }
    shoreline = pts;
  }

  /* ---------- colouring ---------- */
  function render(band) {
    const p = PAL[band] || PAL.rgb;
    const C = {}; for (const k in p) C[k] = hex(p[k]);
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const aspect = W / H;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, e = field[i], u = x / W, v = y / H;
        const tex = fbm(u * 28 * aspect + 3.1, v * 28 + 5.7, 2) - 0.5; // fine texture
        let col;
        if (e < 0) {
          const depth = clamp(-e / 0.5, 0, 1);
          col = lerpRGB(C.shallow, C.deep, smooth(depth));
          // sediment plume: turbid water in and just outside the channel
          const turb = clamp(chan[i] * 1.2 + Math.max(0, 0.12 + e) * 0.6 * chan[i], 0, 1);
          col = lerpRGB(col, C.turbid, turb * 0.85);
          // surf line: thin bright band at the very edge
          if (e > -0.035 && fbm(u * 60 * aspect, v * 60, 2) > 0.42) col = lerpRGB(col, C.foam, 0.55);
          col = col.map((c) => c + tex * 10);
        } else if (e < 0.05) {
          col = lerpRGB(C.sand, C.low, clamp((e - 0.03) / 0.02, 0, 1) * 0.3);
          col = col.map((c) => c + tex * 14);
        } else if (e < 0.14) {
          col = lerpRGB(C.low, C.veg, clamp((e - 0.05) / 0.09, 0, 1));
          col = col.map((c) => c + tex * 18);
        } else {
          const shade = clamp((e - 0.14) / 0.8, 0, 1);
          col = lerpRGB(C.veg, C.vegDark, shade * 0.9 + 0.2 * tex);
          // laterite patches (bare red soil) on the plateau
          const lat = fbm(u * 5 * aspect + 11, v * 5 + 3, 3);
          if (lat > 0.65) col = lerpRGB(col, C.laterite, clamp((lat - 0.65) / 0.1, 0, 1) * 0.7);
          col = col.map((c) => c + tex * 22);
        }
        const o = i * 4;
        d[o] = clamp(col[0], 0, 255); d[o + 1] = clamp(col[1], 0, 255); d[o + 2] = clamp(col[2], 0, 255); d[o + 3] = 255;
      }
    }
    return { img, line: p.line };
  }

  /* ---------- drawing + the single acquisition animation ---------- */
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  let raf = 0, currentBand = "rgb", lineColor = "#FFB84D";

  function drawShoreline(ctx2, upto) {
    ctx2.fillStyle = lineColor;
    const n = upto === undefined ? shoreline.length : Math.min(shoreline.length, upto);
    for (let k = 0; k < n; k += 2) ctx2.fillRect(shoreline[k], shoreline[k + 1], 1, 1);
  }

  const BAND_LABEL = { rgb: "3-2-1 true colour", nir: "4-3-2 false colour (near-infrared)", ndwi: "NDWI water index" };

  function paint(band, animate) {
    cancelAnimationFrame(raf);
    currentBand = band;
    document.querySelectorAll("[data-band-label]").forEach((el) => { el.textContent = BAND_LABEL[band] || BAND_LABEL.rgb; });
    const { img, line } = render(band);
    lineColor = line;
    off.width = W; off.height = H;
    octx.putImageData(img, 0, 0);

    if (!animate || reduce) {
      ctx.drawImage(off, 0, 0);
      drawShoreline(ctx);
      return;
    }
    const sweepMs = animate === "fast" ? 650 : 1900, traceMs = animate === "fast" ? 500 : 1300;
    const t0 = performance.now();
    ctx.fillStyle = "#07151D"; ctx.fillRect(0, 0, W, H);
    function frame(now) {
      const t = now - t0;
      if (t < sweepMs) {
        const rows = Math.floor(smooth(clamp(t / sweepMs, 0, 1)) * H);
        ctx.drawImage(off, 0, 0, W, Math.max(1, rows), 0, 0, W, Math.max(1, rows));
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(0, rows, W, 1);
        ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, rows + 1, W, 1);
        raf = requestAnimationFrame(frame);
      } else if (t < sweepMs + traceMs) {
        ctx.drawImage(off, 0, 0);
        const frac = smooth(clamp((t - sweepMs) / traceMs, 0, 1));
        drawShoreline(ctx, Math.floor(frac * shoreline.length / 2) * 2);
        raf = requestAnimationFrame(frame);
      } else {
        ctx.drawImage(off, 0, 0);
        drawShoreline(ctx);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function size() {
    const r = hero.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    W = 320;
    H = clamp(Math.round(320 * h / w), 120, 480);
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    buildField();
  }

  size();
  paint(document.documentElement.dataset.band || "rgb", true);

  document.addEventListener("bandchange", (e) => {
    if (e.detail.band !== currentBand) paint(e.detail.band, "fast");
  });

  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const prevH = H; size();
      if (H !== prevH) paint(currentBand, false); else paint(currentBand, false);
    }, 150);
  });

  // scene strip: rendered date
  const d = document.querySelector("[data-render-date]");
  if (d) d.textContent = new Date().toISOString().slice(0, 10);
})();
