/* Aqua Crystal — UI wiring. */
(function () {
  const $ = (id) => document.getElementById(id);
  const S = AC.store.load();
  const save = AC.store.save;
  S.log.sort((a, b) => b.date.localeCompare(a.date));  // restored/imported data may be unsorted

  /* ================= units ================= */
  const M3_GAL = 264.172;
  const isImp = () => S.settings.units === "imperial";
  const volOut = (m3) => isImp() ? +(m3 * M3_GAL).toFixed(0) : +m3.toFixed(1);
  const volIn  = (v)  => isImp() ? v / M3_GAL : v;
  const tmpOut = (c)  => c == null ? "" : (isImp() ? +(c * 9 / 5 + 32).toFixed(1) : c);
  const tmpIn  = (v)  => isImp() ? (v - 32) * 5 / 9 : v;

  function unitLabels() {
    document.querySelectorAll(".volUnit").forEach(e => e.textContent = isImp() ? "gal" : "m³");
    document.querySelectorAll(".flowUnit").forEach(e => e.textContent = isImp() ? "gal/h" : "m³/h");
    document.querySelectorAll(".lenUnit").forEach(e => e.textContent = isImp() ? "ft" : "m");
    document.querySelectorAll(".tempUnit").forEach(e => e.textContent = isImp() ? "°F" : "°C");
  }

  /* ================= strip type ================= */
  function stripType() { return AC.STRIP_TYPES[S.settings.stripType] || AC.STRIP_TYPES["7"]; }
  function activePads() {
    return stripType().pads.map(id => S.chart.pads.find(p => p.id === id)).filter(Boolean);
  }

  /* ================= tabs ================= */
  document.querySelectorAll("#tabbar button").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  function showTab(name) {
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));
    document.querySelectorAll("#tabbar button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    if (name === "dose") renderDose();
    if (name === "log") renderLog();
    if (name === "trends") renderTrends();
  }

  /* ================= trends =================
     Small multiples: one compact time-series per metric (their scales differ wildly,
     so a shared-axis multi-series chart would be unreadable). Single series per chart,
     target band shaded, estimated values hollow, dose events marked on the baseline. */
  const TREND_ORDER = ["fc", "ph", "ta", "cya", "th", "tc", "br"];

  function renderTrends() {
    const box = $("trendList");
    box.innerHTML = "";
    const readings = S.log.filter(e => e.kind !== "event")
      .slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!readings.length) {
      box.innerHTML = `<p class="hint">No readings yet — charts appear once you save strip readings.</p>`;
      return;
    }
    const doses = S.log.filter(e => e.kind === "event" && e.ev && e.ev.type === "dose");
    const t0 = new Date(readings[0].date).getTime();
    const t1 = new Date(readings[readings.length - 1].date).getTime();
    const span = Math.max(t1 - t0, 36e5);
    const W = 600, H = 150, X0 = 44, X1 = 588, Y0 = 12, Y1 = 112;
    const xOf = (t) => X0 + (t - t0) / span * (X1 - X0);
    const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

    const series = TREND_ORDER
      .map(id => ({ pad: S.chart.pads.find(p => p.id === id), id }))
      .filter(s => s.pad)
      .map(s => ({ ...s, pts: readings.filter(r => r.readings[s.id] != null).map(r => ({
        t: new Date(r.date).getTime(), v: r.readings[s.id], est: !!(r.est && r.est[s.id]),
        state: r.state || ""
      })) }))
      .filter(s => s.pts.length);
    // water temperature as a bonus series when logged
    const tPts = readings.filter(r => r.tempC != null)
      .map(r => ({ t: new Date(r.date).getTime(), v: r.tempC, est: false, state: r.state || "" }));
    if (tPts.length) series.push({ id: "temp", pad: { label: "Water temp", unit: "°C", dec: 1 }, pts: tPts });

    for (const s of series) {
      const tgt = S.targets[s.id];
      const vals = s.pts.map(p => p.v);
      let lo = Math.min(...vals, tgt ? tgt.min : Infinity);
      let hi = Math.max(...vals, tgt ? tgt.max : -Infinity);
      if (hi === lo) { hi += 1; lo -= 1; }
      const padY = (hi - lo) * 0.12;
      lo -= padY; hi += padY;
      const yOf = (v) => Y1 - (v - lo) / (hi - lo) * (Y1 - Y0);
      const fv = (v) => v.toFixed(s.pad.dec);

      let g = "";
      // recessive grid: 3 lines
      for (let i = 1; i <= 3; i++) {
        const y = Y0 + (Y1 - Y0) * i / 4;
        g += `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="var(--line)" stroke-width="0.6"/>`;
      }
      // target band
      if (tgt) {
        const yTop = yOf(Math.min(tgt.max, hi)), yBot = yOf(Math.max(tgt.min, lo));
        g += `<rect x="${X0}" y="${yTop}" width="${X1 - X0}" height="${Math.max(0, yBot - yTop)}"
                fill="var(--good)" opacity="0.10"/>`;
        g += `<text x="${X0 + 5}" y="${Math.min(yTop + 11, Y1 - 3)}" font-size="9"
                opacity="0.75">target ${tgt.min}–${tgt.max}</text>`;
      }
      // dose markers on baseline
      for (const d of doses) {
        const dt = new Date(d.date).getTime();
        if (dt < t0 - 864e5 || dt > t1 + 864e5) continue;
        const x = Math.max(X0, Math.min(X1, xOf(dt)));
        g += `<path d="M${x - 4},${Y1 + 10} L${x + 4},${Y1 + 10} L${x},${Y1 + 3} Z"
                fill="var(--warn)" opacity="0.8" data-tip="${esc(fmtD(dt) + " — " + (d.text || "dose"))}"
                pointer-events="all"/>`;
      }
      // line
      if (s.pts.length > 1) {
        const dPath = s.pts.map((p, i) => (i ? "L" : "M") + xOf(p.t).toFixed(1) + "," + yOf(p.v).toFixed(1)).join(" ");
        g += `<path d="${dPath}" fill="none" stroke="var(--accent)" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      // points + invisible hit targets
      for (const p of s.pts) {
        const x = xOf(p.t).toFixed(1), y = yOf(p.v).toFixed(1);
        g += p.est
          ? `<circle cx="${x}" cy="${y}" r="4" fill="var(--card)" stroke="var(--accent)"
               stroke-width="2" stroke-dasharray="2 2"/>`
          : `<circle cx="${x}" cy="${y}" r="4" fill="var(--accent)"/>`;
        g += `<circle cx="${x}" cy="${y}" r="13" fill="transparent" pointer-events="all"
                data-tip="${esc(fmtD(p.t) + " — " + s.pad.label + ": " + (p.est ? "≈" : "") + fv(p.v) +
                (s.pad.unit ? " " + s.pad.unit : "") + (p.est ? " (estimated)" : "") +
                (p.state ? " · " + p.state : ""))}"/>`;
      }
      // last value direct label
      const last = s.pts[s.pts.length - 1];
      const lx = Math.min(xOf(last.t) + 7, X1 - 20);
      g += `<text x="${lx}" y="${yOf(last.v) - 7}" font-size="10"
              fill="var(--text)">${(last.est ? "≈" : "") + fv(last.v)}</text>`;
      // axes labels: y min/max + x first/last date
      g += `<text x="${X0 - 4}" y="${Y0 + 4}" text-anchor="end">${fv(hi)}</text>`;
      g += `<text x="${X0 - 4}" y="${Y1 + 3}" text-anchor="end">${fv(lo)}</text>`;
      g += `<text x="${X0}" y="${H - 4}">${fmtD(t0)}</text>`;
      g += `<text x="${X1}" y="${H - 4}" text-anchor="end">${fmtD(t1)}</text>`;

      const cls = s.id !== "temp" ? classify(s.id, last.v) : "";
      const card = document.createElement("div");
      card.className = "card trend-card";
      card.innerHTML =
        `<div class="trend-head"><span class="tname">${s.pad.label}${s.pad.unit ? " (" + s.pad.unit + ")" : ""}</span>
           <b class="${cls}">${(last.est ? "≈" : "") + fv(last.v)}${s.pad.unit ? " " + s.pad.unit : ""}</b></div>
         <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${s.pad.label} over time">${g}</svg>`;
      box.appendChild(card);
    }

    // shared tooltip (hover + tap)
    let tip = document.querySelector(".trend-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "trend-tip";
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    const show = (e) => {
      const el = e.target.closest("[data-tip]");
      if (!el) { tip.hidden = true; return; }
      tip.textContent = el.getAttribute("data-tip");
      tip.hidden = false;
      const px = Math.min(e.clientX + 12, window.innerWidth - 290);
      tip.style.left = px + "px";
      tip.style.top = (e.clientY + 14) + "px";
    };
    box.onpointermove = show;
    box.onpointerdown = show;
    box.onpointerleave = () => { tip.hidden = true; };
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  /* ================= banner ================= */
  function banner() {
    const days = AC.dosing.filterDueDays(S.profile);
    const b = $("banner");
    if (days === null) { b.textContent = ""; return; }
    if (days <= 0) {
      b.textContent = `⚠ Filter maintenance overdue by ${-days} day(s) — ` +
        (S.profile.filterType === "cartridge" ? "clean the cartridge." : "backwash the sand filter.") +
        " Steps in the Guide tab.";
    } else if (days <= 2) {
      b.textContent = `⏳ Filter maintenance due in ${days} day(s).`;
    } else b.textContent = "";
  }

  /* ================= estimates (CYA / hardness bookkeeping) =================
     Walks the log chronologically up to a date: real measurements anchor the value,
     dose events add side effects (trichlor/dichlor/stabilizer → CYA; cal-hypo/CaCl2 → TH),
     dilution events scale it down, fresh fill resets CYA to 0. */
  function evGrams(ev) {
    const a = Number(ev.amount) || 0;
    switch (ev.unit) {
      case "kg": return a * 1000;
      case "lb": return a * 453.6;
      case "oz": return a * 28.35;
      case "L":  return a * 1000;   // treat liquids ~1 g/ml
      case "ml": return a;
      case "tabs": return a * (AC.TAB_GRAMS[ev.product] || 0);
      default: return a;            // g
    }
  }

  function computeEstimates(uptoIso) {
    const V = Math.max(0.5, Number(S.profile.volumeM3) || 1);
    const est = {
      cya: { value: null, anchorDate: null, hasAnchor: false, baseZero: true },
      th:  { value: null, anchorDate: null, hasAnchor: false, baseZero: false }
    };
    const chron = [...S.log].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of chron) {
      if (uptoIso && e.date > uptoIso) break;
      if (e.kind === "event") {
        const ev = e.ev || {};
        if (ev.type === "freshfill") {
          est.cya = { value: 0, anchorDate: e.date, hasAnchor: true, baseZero: true };
          est.th  = { value: null, anchorDate: null, hasAnchor: false, baseZero: false };
        } else if (ev.type === "water" && Number(ev.pct) > 0) {
          const f = 1 - Math.min(100, Number(ev.pct)) / 100;
          if (est.cya.value != null) est.cya.value *= f;
          if (est.th.value != null) est.th.value *= f;
        } else if (ev.type === "dose" && AC.SIDE_EFFECTS[ev.product]) {
          const fx = AC.SIDE_EFFECTS[ev.product];
          const ppm = (k) => evGrams(ev) / V * fx[k];
          if (fx.cya) est.cya.value = (est.cya.value == null ? 0 : est.cya.value) + ppm("cya");
          if (fx.th && (est.th.value != null || est.th.baseZero)) est.th.value += ppm("th");
        }
      } else {
        const flags = e.est || {};
        if (e.readings.cya != null && !flags.cya) {
          est.cya = { value: e.readings.cya, anchorDate: e.date, hasAnchor: true, baseZero: true };
        }
        if (e.readings.th != null && !flags.th) {
          est.th = { value: e.readings.th, anchorDate: e.date, hasAnchor: true, baseZero: false };
        }
      }
    }
    return est;
  }

  function metaFromEntry(entry) {
    const flags = entry.est || {};
    const keys = Object.keys(flags).filter(k => flags[k]);
    if (!keys.length) return {};
    const es = computeEstimates(entry.date);
    const meta = {};
    for (const k of keys) {
      meta[k] = {
        estimated: true,
        ageDays: es[k] && es[k].hasAnchor && es[k].anchorDate
          ? Math.max(0, Math.floor((new Date(entry.date) - new Date(es[k].anchorDate)) / 86400000))
          : null
      };
    }
    return meta;
  }

  function adviceFor(entry) {
    return [
      ...AC.dosing.advise(entry.readings, S.profile, S.settings, S.targets, S.inventory, metaFromEntry(entry)),
      ...AC.dosing.stateAdvice(entry.state, S.profile, S.settings, S.inventory)
    ];
  }

  /* ================= strip reader ================= */
  AC.reader.init($("readerStage"), $("readerCanvas"));
  AC.reader.setPadCount(activePads().length);

  /* strip-type selects (Read page + Settings) stay in sync */
  function fillStripSelects() {
    $("stripTypeRead").innerHTML = Object.entries(AC.STRIP_TYPES)
      .map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
    $("stripTypeRead").value = S.settings.stripType;
  }
  function applyStripType(v) {
    S.settings.stripType = v;
    save();
    $("stripTypeRead").value = v;
    if ($("stripTypeSel").options.length) $("stripTypeSel").value = v;
    AC.reader.setPadCount(activePads().length);
    $("readingsForm").hidden = true;   // pad set changed — analyze / re-enter values
    if (AC.reader.hasImage()) {
      $("readMsg").textContent = "Strip type changed — markers updated. Realign and tap Analyze again.";
    }
  }
  $("stripTypeRead").addEventListener("change", () => applyStripType($("stripTypeRead").value));

  /* optional pool photo attached to the entry (downscaled to keep storage small) */
  let poolPhoto = null;
  function clearPoolPhoto() {
    poolPhoto = null;
    $("poolPhotoPreview").hidden = true;
    $("btnPoolPhotoRemove").hidden = true;
  }
  $("poolPhotoInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 640 / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      poolPhoto = c.toDataURL("image/jpeg", 0.7);
      $("poolPhotoPreview").src = poolPhoto;
      $("poolPhotoPreview").hidden = false;
      $("btnPoolPhotoRemove").hidden = false;
    };
    im.onerror = () => { URL.revokeObjectURL(url); };
    im.src = url;
    e.target.value = "";
  });
  $("btnPoolPhotoRemove").addEventListener("click", clearPoolPhoto);

  /* full reset of the Read page */
  function resetReadPage() {
    AC.reader.reset();
    $("readerWrap").hidden = true;
    $("readingsForm").hidden = true;
    $("aiResult").innerHTML = "";
    $("readMsg").textContent = "";
    clearPoolPhoto();
  }
  $("btnCancelEntry").addEventListener("click", resetReadPage);

  $("photoInput").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      AC.reader.setPadCount(activePads().length);
      await AC.reader.loadFile(f);
      $("readerWrap").hidden = false;
      $("readingsForm").hidden = true;
      $("readMsg").textContent = "Align the markers, then tap Analyze.";
    } catch (err) {
      $("readMsg").textContent = "Could not load that image.";
    }
    e.target.value = "";
  });

  $("btnManualEntry").addEventListener("click", () => {
    $("readerWrap").hidden = true;
    openReadingsForm({});
  });

  $("btnAnalyze").addEventListener("click", () => {
    try {
      const res = AC.reader.analyze(S.chart, stripType().pads);
      openReadingsForm(res);
      $("readMsg").textContent = "Check the values (tap any field to correct), then Save.";
    } catch (err) {
      $("readMsg").textContent = "Analyze failed — load a photo first.";
    }
  });

  function padStep(pad) { return pad.dec >= 1 ? 0.1 : 1; }

  function localDatetimeValue(d) {
    const x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 16);
  }

  function openReadingsForm(results) {
    const wrap = $("readingInputs");
    wrap.innerHTML = "";
    for (const pad of activePads()) {
      const row = document.createElement("label");
      row.className = "reading-row";
      const r = results[pad.id];
      const conf = r ? (r.dist <= 18 ? `<span class="conf ok">match ok</span>`
                                     : `<span class="conf iffy">uncertain — verify</span>`) : "";
      row.innerHTML =
        `${pad.label}${pad.unit ? " (" + pad.unit + ")" : ""} ${conf}
         <input type="number" step="${padStep(pad)}" inputmode="decimal" id="rd-${pad.id}"
                value="${r ? r.value : ""}">` +
        (r ? `<span class="swatch" style="background:rgb(${r.rgb.join(",")})"></span>` : "");
      wrap.appendChild(row);
    }
    renderEstBox();
    const sel = $("stateSelect");
    sel.innerHTML = AC.STATE_OPTIONS.map(s => `<option>${s}</option>`).join("");
    $("tempInput").value = "";
    $("notesInput").value = "";
    $("entryDate").value = localDatetimeValue(new Date());
    $("aiResult").innerHTML = "";
    clearPoolPhoto();
    $("readingsForm").hidden = false;
    $("readingsForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderEstBox() {
    const box = $("estBox");
    const ids = activePads().map(p => p.id);
    const missing = ["tc", "cya", "th"].filter(k => !ids.includes(k));
    if (!missing.length) { box.innerHTML = ""; return; }
    const es = computeEstimates(null);
    const lines = [];
    if (missing.includes("cya")) {
      lines.push(es.cya.value != null
        ? `Stabilizer (CYA) ≈ <b>${Math.round(es.cya.value)} ppm</b> — estimated from your dose history` +
          (es.cya.hasAnchor ? ` (anchored ${new Date(es.cya.anchorDate).toLocaleDateString()})` : " (never measured)")
        : `Stabilizer (CYA): unknown — log a "fresh fill" or doses to build an estimate.`);
    }
    if (missing.includes("th")) {
      lines.push(es.th.value != null
        ? `Calcium hardness ≈ <b>${Math.round(es.th.value)} ppm</b> — carried from the last measurement` +
          (es.th.hasAnchor ? ` (${new Date(es.th.anchorDate).toLocaleDateString()})` : "")
        : `Calcium hardness: unknown — one pool-store test or 7-in-1 strip will anchor it.`);
    }
    if (missing.includes("tc")) {
      lines.push(`No Total Chlorine pad → combined chlorine can't be computed. If the water smells of ` +
                 `chlorine or stings eyes, pick that as the water state — it triggers shock advice.`);
    }
    box.innerHTML = `<b>Not on your ${activePads().length}-pad strip</b> (estimates will be saved, ` +
                    `marked ≈):<br>` + lines.join("<br>");
  }

  function collectReadings() {
    const out = { th: null, tc: null, fc: null, br: null, ph: null, ta: null, cya: null };
    for (const pad of activePads()) {
      const v = parseFloat($("rd-" + pad.id).value);
      out[pad.id] = isNaN(v) ? null : v;
    }
    return out;
  }

  /* ================= save entry ================= */
  $("btnSaveEntry").addEventListener("click", () => {
    const readings = collectReadings();
    if (Object.values(readings).every(v => v === null)) {
      $("readMsg").textContent = "Enter at least one reading first.";
      return;
    }
    const dv = $("entryDate").value;
    const date = dv ? new Date(dv).toISOString() : new Date().toISOString();
    const t = parseFloat($("tempInput").value);
    const entry = {
      id: "e" + Date.now(),
      kind: "reading",
      date,
      tempC: isNaN(t) ? null : +tmpIn(t).toFixed(1),
      state: $("stateSelect").value,
      notes: $("notesInput").value.trim(),
      photo: poolPhoto,
      readings,
      est: {}
    };
    // fill gaps from bookkeeping, clearly flagged
    const es = computeEstimates(date);
    if (readings.cya == null && es.cya.value != null) {
      entry.readings.cya = Math.round(es.cya.value);
      entry.est.cya = true;
    }
    if (readings.th == null && es.th.value != null) {
      entry.readings.th = Math.round(es.th.value);
      entry.est.th = true;
    }
    entry.advice = adviceFor(entry);
    S.log.push(entry);
    S.log.sort((a, b) => b.date.localeCompare(a.date));
    save();
    resetReadPage();
    showTab("log");
  });

  /* ================= AI double-check ================= */
  $("btnAiCheck").addEventListener("click", async () => {
    const key = S.settings.aiKey;
    const box = $("aiResult");
    if (!key) { box.innerHTML = "No API key set — add one under Pool ▸ AI double-check."; return; }
    if (!AC.reader.hasImage()) { box.innerHTML = "AI check needs a strip photo (manual entries can't be checked)."; return; }
    if (!navigator.onLine) { box.innerHTML = "You're offline — AI check needs internet."; return; }
    box.innerHTML = "Asking AI… ⏳";
    const pads = activePads();
    try {
      const chartTxt = pads.map(p =>
        `${p.label} (${p.id}): scale values ${p.scale.map(s => s.v).join(", ")} ${p.unit}`).join("\n");
      const prompt =
        `This photo shows a ${pads.length}-pad pool test strip. ` +
        "Estimate the reading of each pad using this reference scale (pads listed top-to-bottom):\n" + chartTxt +
        "\nReply with ONLY strict JSON, no prose: {" +
        pads.map(p => `"${p.id}":number|null`).join(",") + "}";
      const body = {
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: AC.reader.getJpegBase64(900) } }
        ]}]
      };
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
                  encodeURIComponent(S.settings.aiModel || "gemini-2.5-flash") +
                  ":generateContent?key=" + encodeURIComponent(key);
      const resp = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error("API " + resp.status);
      const data = await resp.json();
      const txt = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
      const jm = txt.match(/\{[\s\S]*\}/);
      if (!jm) throw new Error("no JSON in reply");
      const ai = JSON.parse(jm[0]);
      let rows = "", anyDiff = false;
      for (const pad of pads) {
        const local = $("rd-" + pad.id).value;
        const a = ai[pad.id];
        const diff = local !== "" && a != null && Math.abs(parseFloat(local) - a) > padStep(pad) * 2;
        if (diff) anyDiff = true;
        rows += `<tr><td>${pad.label}</td><td>${local || "—"}</td>` +
                `<td class="${diff ? "diff" : ""}">${a == null ? "—" : a}</td></tr>`;
      }
      box.innerHTML =
        `<b>AI vs offline reading</b>
         <table><tr><th>Pad</th><th>Offline</th><th>AI</th></tr>${rows}</table>
         <p class="hint">${anyDiff ? "Values differ — trust your eyes against the bottle chart." :
                                     "Good agreement ✓"}</p>
         <button class="btn" id="btnUseAi">Use AI values</button>`;
      $("btnUseAi").addEventListener("click", () => {
        for (const pad of pads) {
          if (ai[pad.id] != null) $("rd-" + pad.id).value = ai[pad.id];
        }
        box.innerHTML += "<p>AI values applied.</p>";
      });
    } catch (err) {
      box.innerHTML = "AI check failed: " + err.message +
        ". Check the API key / model under Pool ▸ AI, and your connection.";
    }
  });

  /* ================= events ================= */
  function fillEventSelectors() {
    $("evKind").innerHTML = Object.entries(AC.EVENT_KINDS)
      .map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    $("evProduct").innerHTML = Object.entries(AC.PRODUCTS)
      .map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("") +
      `<option value="other">Other</option>`;
  }

  function evFieldVis() {
    const k = $("evKind").value;
    document.querySelectorAll(".ev-dose").forEach(e => e.style.display = k === "dose" ? "" : "none");
    document.querySelectorAll(".ev-water").forEach(e => e.style.display = k === "water" ? "" : "none");
  }
  $("evKind").addEventListener("change", evFieldVis);

  $("btnAddEvent").addEventListener("click", () => {
    $("eventCard").hidden = false;
    $("evDate").value = new Date().toISOString().slice(0, 10);
    $("evAmount").value = ""; $("evPct").value = ""; $("evNote").value = "";
    evFieldVis();
    $("eventCard").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("btnEvCancel").addEventListener("click", () => { $("eventCard").hidden = true; });

  function eventText(ev) {
    const pn = (p) => p === "other" ? "chemical" : (AC.PRODUCTS[p] ? AC.PRODUCTS[p].name : p);
    switch (ev.type) {
      case "dose": return `Added ${ev.amount} ${ev.unit} ${pn(ev.product)}` + (ev.note ? ` — ${ev.note}` : "");
      case "backwash": return "Backwash / filter clean" + (ev.note ? ` — ${ev.note}` : "");
      case "filter": return "Filter cartridge/media switched" + (ev.note ? ` — ${ev.note}` : "");
      case "water": return `~${ev.pct}% water replaced (refill/rain)` + (ev.note ? ` — ${ev.note}` : "");
      case "freshfill": return "Fresh water fill — CYA estimate reset to 0" + (ev.note ? ` — ${ev.note}` : "");
      case "cover": return "Cover " + (ev.note || "on/off");
      default: return ev.note || "note";
    }
  }

  $("btnEvSave").addEventListener("click", () => {
    const kind = $("evKind").value;
    const ev = { type: kind, note: $("evNote").value.trim() };
    if (kind === "dose") {
      ev.product = $("evProduct").value;
      ev.amount = parseFloat($("evAmount").value);
      ev.unit = $("evUnit").value;
      if (isNaN(ev.amount) || ev.amount <= 0) { alert("Enter the amount added."); return; }
    }
    if (kind === "water") {
      ev.pct = parseFloat($("evPct").value);
      if (isNaN(ev.pct) || ev.pct <= 0) { alert("Enter roughly what % of the water was replaced."); return; }
    }
    const dstr = $("evDate").value || new Date().toISOString().slice(0, 10);
    const entry = {
      id: "v" + Date.now(),
      kind: "event",
      date: new Date(dstr + "T12:00:00").toISOString(),
      ev
    };
    entry.text = eventText(ev);
    S.log.push(entry);
    S.log.sort((a, b) => b.date.localeCompare(a.date));
    if ((kind === "backwash" || kind === "filter") &&
        (!S.profile.lastClean || dstr > S.profile.lastClean)) {
      S.profile.lastClean = dstr;
    }
    save();
    $("eventCard").hidden = true;
    renderLog(); poolDerived();
  });

  /* ================= log ================= */
  function classify(padId, v) {
    const t = S.targets[padId];
    if (!t || v == null) return "";
    if (v < t.min) return "lo";
    if (v > t.max) return "hi";
    return "ok";
  }

  function renderLog() {
    const list = $("logList");
    if (!S.log.length) {
      list.innerHTML = `<p class="hint">No entries yet — read a strip, enter values manually, or log an
        event (chemicals added, filter work, fresh fill…).</p>`;
      return;
    }
    list.innerHTML = "";
    for (const e of S.log) {
      const d = new Date(e.date);
      if (e.kind === "event") {
        const card = document.createElement("div");
        card.className = "card evt";
        card.innerHTML =
          `<span class="when">${d.toLocaleDateString()}</span>
           <span style="flex:1">🧾 ${e.text || eventText(e.ev || {})}</span>
           <button data-del="${e.id}" title="delete">🗑</button>`;
        list.appendChild(card);
        continue;
      }
      const card = document.createElement("div");
      card.className = "card entry";
      const cells = S.chart.pads
        .filter(p => e.readings[p.id] != null)
        .map(p => {
          const em = e.est && e.est[p.id];
          return `<div class="r ${classify(p.id, e.readings[p.id])}" ` +
                 `${em ? 'title="estimated from dose history, not measured"' : ""}>${p.label}` +
                 `<b>${em ? '<span class="estmark">≈</span>' : ""}${e.readings[p.id]}` +
                 `${p.unit ? " " + p.unit : ""}</b></div>`;
        }).join("");
      const adv = (e.advice || []).map((a, i) =>
        `<li class="${a.done ? "done" : ""}"><input type="checkbox" data-e="${e.id}" data-i="${i}" ` +
        `${a.done ? "checked" : ""}><span>${a.text}</span></li>`).join("");
      card.innerHTML =
        `<div class="when">${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
         <div class="meta">${e.tempC != null ? tmpOut(e.tempC) + (isImp() ? " °F" : " °C") + " · " : ""}` +
        `${e.state || ""}${e.notes ? " · " + e.notes : ""}</div>
         ${e.photo ? `<img class="pool-photo" src="${e.photo}" alt="pool photo" title="tap to enlarge">` : ""}
         <div class="rgrid">${cells}</div>
         <ul class="advice">${adv}</ul>
         <div class="tools"><button data-del="${e.id}">🗑 delete</button></div>`;
      list.appendChild(card);
    }
    list.querySelectorAll(".pool-photo").forEach(im =>
      im.addEventListener("click", () => im.classList.toggle("expanded")));
    list.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        const e = S.log.find(x => x.id === cb.dataset.e);
        if (e) { e.advice[cb.dataset.i].done = cb.checked; save(); renderLog(); }
      });
    });
    list.querySelectorAll("button[data-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!confirm("Delete this entry?")) return;
        S.log = S.log.filter(x => x.id !== btn.dataset.del);
        save(); renderLog();
      });
    });
  }

  /* ================= CSV ================= */
  const CSV_COLS = ["kind", "date", "temp_c", "state", "th", "tc", "fc", "br", "ph", "ta", "cya",
                    "estimated", "notes", "detail", "advice"];
  const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;

  $("btnExportCsv").addEventListener("click", () => {
    const lines = [CSV_COLS.join(",")];
    for (const e of S.log) {
      if (e.kind === "event") {
        lines.push(["event", e.date, "", "", "", "", "", "", "", "", "", "", "",
                    e.text || eventText(e.ev || {}), ""].map(q).join(","));
      } else {
        lines.push([
          "reading", e.date, e.tempC, e.state, e.readings.th, e.readings.tc, e.readings.fc,
          e.readings.br, e.readings.ph, e.readings.ta, e.readings.cya,
          Object.keys(e.est || {}).filter(k => e.est[k]).join(" "), e.notes, "",
          (e.advice || []).map(a => (a.done ? "[done] " : "") + a.text).join(" | ")
        ].map(q).join(","));
      }
    }
    download("aqua-crystal-log.csv", lines.join("\r\n"), "text/csv");
  });

  $("csvFile").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const rows = parseCsv(fr.result.toString());
        const hdr = rows.shift().map(h => h.trim().toLowerCase());
        const ix = Object.fromEntries(CSV_COLS.map(c => [c, hdr.indexOf(c)]));
        let added = 0;
        for (const r of rows) {
          const cell = (c) => ix[c] >= 0 ? r[ix[c]] : "";
          if (!r.length || !cell("date")) continue;
          const kind = ix.kind >= 0 ? (cell("kind") || "reading") : "reading";
          if (kind === "event") {
            S.log.push({
              id: "iv" + Date.now() + "_" + added, kind: "event",
              date: new Date(cell("date")).toISOString(),
              ev: { type: "note", note: cell("detail") }, text: cell("detail")
            });
          } else {
            const num = (c) => { const v = parseFloat(cell(c)); return isNaN(v) ? null : v; };
            const est = {};
            (cell("estimated") || "").split(/\s+/).filter(Boolean).forEach(k => est[k] = true);
            S.log.push({
              id: "i" + Date.now() + "_" + added, kind: "reading",
              date: new Date(cell("date")).toISOString(),
              tempC: num("temp_c"), state: cell("state") || "", notes: cell("notes") || "", est,
              readings: { th: num("th"), tc: num("tc"), fc: num("fc"), br: num("br"),
                          ph: num("ph"), ta: num("ta"), cya: num("cya") },
              advice: (cell("advice") || "").split(" | ").filter(Boolean)
                .map(t => ({ text: t.replace(/^\[done\] /, ""), done: t.startsWith("[done] ") }))
            });
          }
          added++;
        }
        S.log.sort((a, b) => b.date.localeCompare(a.date));
        save(); renderLog();
        alert(`Imported ${added} entries.`);
      } catch (e) { alert("Import failed: " + e.message); }
    };
    fr.readAsText(f);
    ev.target.value = "";
  });

  function parseCsv(text) {
    const rows = [[]]; let cur = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { rows[rows.length - 1].push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (cur !== "" || rows[rows.length - 1].length) { rows[rows.length - 1].push(cur); cur = ""; }
        if (c === "\n") rows.push([]);
      } else cur += c;
    }
    if (cur !== "" || rows[rows.length - 1].length) rows[rows.length - 1].push(cur);
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
  }

  function download(name, content, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ================= dose panel ================= */
  function renderDose() {
    const box = $("doseSummary");
    const e = S.log.find(x => x.kind !== "event");
    if (!e) {
      box.innerHTML = `<p class="hint">No readings yet. Read a strip first — advice appears here,
        recalculated live against your current pool size, products and chemicals at hand.</p>`;
    } else {
      const advice = adviceFor(e);
      box.innerHTML =
        `<p class="hint">Based on the latest reading (${new Date(e.date).toLocaleString()}) and your
          current settings/inventory:</p>
         <ul class="advice">${advice.map(a => `<li><span>•</span><span>${a.text}</span></li>`).join("")}</ul>`;
    }
    renderInventory();
  }

  function renderInventory() {
    const list = $("invList");
    if (!S.inventory.length) {
      list.innerHTML = `<p class="hint">Nothing listed yet. Add what you actually have on the shelf —
        advice will tell you whether it's enough.</p>`;
    } else {
      list.innerHTML = "";
      S.inventory.forEach((it, i) => {
        const div = document.createElement("div");
        div.className = "inv-item";
        div.innerHTML = `<span>${it.name}</span><span>${it.amount} ${it.unit}
          <button data-i="${i}" title="remove">✕</button></span>`;
        list.appendChild(div);
      });
      list.querySelectorAll("button[data-i]").forEach(b =>
        b.addEventListener("click", () => { S.inventory.splice(+b.dataset.i, 1); save(); renderDose(); }));
    }
  }

  function fillInvSelect() {
    const sel = $("invChem");
    sel.innerHTML = Object.entries(AC.PRODUCTS)
      .map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("") +
      `<option value="custom">Custom…</option>`;
  }

  $("btnInvAdd").addEventListener("click", () => {
    const prod = $("invChem").value;
    const amount = parseFloat($("invAmount").value);
    if (isNaN(amount) || amount <= 0) { alert("Enter an amount."); return; }
    const name = prod === "custom"
      ? ($("invName").value.trim() || "Custom chemical")
      : AC.PRODUCTS[prod].name;
    S.inventory.push({ product: prod === "custom" ? "custom:" + name : prod,
                       name, amount, unit: $("invUnit").value });
    $("invAmount").value = ""; $("invName").value = "";
    save(); renderDose();
  });

  /* ================= pool panel ================= */
  function renderPool() {
    unitLabels();
    $("volInput").value = volOut(S.profile.volumeM3);
    $("flowInput").value = volOut(S.profile.pumpFlowM3h);
    $("filterType").value = S.profile.filterType;
    $("cleanInterval").value = S.profile.cleanIntervalDays;
    $("lastClean").value = S.profile.lastClean || "";
    $("unitsSel").value = S.settings.units;
    $("sanitizerSel").value = S.settings.sanitizer;
    $("stripTypeSel").innerHTML = Object.entries(AC.STRIP_TYPES)
      .map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
    $("stripTypeSel").value = S.settings.stripType;
    $("chlorProduct").value = S.settings.chlorineProduct;
    $("chlorStrength").value = S.settings.chlorineStrength;
    $("acidProduct").value = S.settings.acidProduct;
    $("aiKey").value = S.settings.aiKey;
    $("aiModel").value = S.settings.aiModel;
    renderTargets();
    renderChartEditor();
    poolDerived();
  }

  function poolDerived() {
    const t = AC.dosing.turnoverInfo(S.profile, S.settings.units);
    $("turnoverOut").textContent = t;
    $("guideTurnover").textContent = t;
    const days = AC.dosing.filterDueDays(S.profile);
    $("nextCleanOut").textContent =
      days === null ? "Set the last clean date to get reminders."
      : days <= 0 ? `Overdue by ${-days} day(s)!`
      : `Next filter maintenance in ${days} day(s).`;
    $("lastClean").value = S.profile.lastClean || "";
    banner();
  }

  $("volInput").addEventListener("change", () => {
    const v = parseFloat($("volInput").value);
    if (!isNaN(v)) { S.profile.volumeM3 = +volIn(v).toFixed(2); save(); poolDerived(); }
  });
  $("flowInput").addEventListener("change", () => {
    const v = parseFloat($("flowInput").value);
    if (!isNaN(v)) { S.profile.pumpFlowM3h = +volIn(v).toFixed(2); save(); poolDerived(); }
  });
  $("filterType").addEventListener("change", () => { S.profile.filterType = $("filterType").value; save(); poolDerived(); });
  $("cleanInterval").addEventListener("change", () => {
    S.profile.cleanIntervalDays = parseInt($("cleanInterval").value) || 28; save(); poolDerived();
  });
  $("lastClean").addEventListener("change", () => { S.profile.lastClean = $("lastClean").value; save(); poolDerived(); });

  $("btnCalcVol").addEventListener("click", () => {
    const n = (id) => parseFloat($(id).value) || 0;
    let L = n("dimL"), W = n("dimW"), d1 = n("dimD1"), d2 = n("dimD2");
    const depth = d2 > 0 ? (d1 + d2) / 2 : d1;
    let cube; // in entered length units
    const shape = $("dimShape").value;
    if (shape === "round") cube = Math.PI * (L / 2) ** 2 * depth;
    else if (shape === "oval") cube = Math.PI * (L / 2) * (W / 2) * depth;
    else cube = L * W * depth;
    const m3 = isImp() ? cube * 0.0283168 : cube;
    if (!m3) { $("calcVolOut").textContent = "Fill in the dimensions."; return; }
    S.profile.volumeM3 = +m3.toFixed(1);
    save();
    $("volInput").value = volOut(S.profile.volumeM3);
    $("calcVolOut").textContent = `≈ ${AC.dosing.fmtVol(S.profile.volumeM3, S.settings.units)} — saved.`;
    poolDerived();
  });

  $("unitsSel").addEventListener("change", () => { S.settings.units = $("unitsSel").value; save(); renderPool(); });
  $("sanitizerSel").addEventListener("change", () => { S.settings.sanitizer = $("sanitizerSel").value; save(); });
  $("stripTypeSel").addEventListener("change", () => applyStripType($("stripTypeSel").value));
  $("chlorProduct").addEventListener("change", () => { S.settings.chlorineProduct = $("chlorProduct").value; save(); });
  $("chlorStrength").addEventListener("change", () => {
    S.settings.chlorineStrength = parseFloat($("chlorStrength").value) || 12; save();
  });
  $("acidProduct").addEventListener("change", () => { S.settings.acidProduct = $("acidProduct").value; save(); });
  $("aiKey").addEventListener("change", () => { S.settings.aiKey = $("aiKey").value.trim(); save(); });
  $("aiModel").addEventListener("change", () => { S.settings.aiModel = $("aiModel").value.trim(); save(); });

  /* ---- targets ---- */
  function renderTargets() {
    const grid = $("targetsGrid");
    grid.innerHTML = "";
    for (const [k, label] of [["fc", "Free chlorine (ppm)"], ["br", "Bromine (ppm)"], ["ph", "pH"],
                              ["ta", "Alkalinity (ppm)"], ["cya", "CYA (ppm)"], ["th", "Hardness (ppm)"]]) {
      const t = S.targets[k];
      const lab = document.createElement("label");
      lab.innerHTML = `${label} min–max
        <span class="row gap" style="margin:0">
          <input type="number" step="0.1" id="tg-${k}-min" value="${t.min}" style="flex:1">
          <input type="number" step="0.1" id="tg-${k}-max" value="${t.max}" style="flex:1">
        </span>`;
      grid.appendChild(lab);
    }
    for (const k of ["fc", "br", "ph", "ta", "cya", "th"]) {
      for (const mm of ["min", "max"]) {
        $(`tg-${k}-${mm}`).addEventListener("change", (e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) {
            S.targets[k][mm] = v;
            S.targets[k].ideal = +((S.targets[k].min + S.targets[k].max) / 2).toFixed(2);
            save();
          }
        });
      }
    }
  }

  /* ---- chart editor + calibration ---- */
  function renderChartEditor() {
    const box = $("chartEditor");
    box.innerHTML = "";
    for (const pad of S.chart.pads) {
      const blk = document.createElement("div");
      blk.className = "pad-block";
      blk.innerHTML = `<div class="padname">${pad.label}</div>
        <div class="swatch-row">` +
        pad.scale.map((s, i) =>
          `<span class="swatch-cell"><input type="color" value="${s.hex}"
             data-pad="${pad.id}" data-i="${i}"><span>${s.v}</span></span>`).join("") +
        `</div>`;
      box.appendChild(blk);
    }
    box.querySelectorAll("input[type=color]").forEach(inp => {
      inp.addEventListener("change", () => {
        const pad = S.chart.pads.find(p => p.id === inp.dataset.pad);
        pad.scale[+inp.dataset.i].hex = inp.value;
        save();
      });
    });
  }

  $("btnChartReset").addEventListener("click", () => {
    if (!confirm("Reset the reference chart colors to defaults?")) return;
    AC.store.resetChart();
    Object.assign(S.chart, AC.store.get().chart);
    renderChartEditor();
  });

  /* calibration: tap each swatch of the photographed bottle chart in sequence.
     Only pads on the configured strip type are queued. */
  let calib = null;
  const calibCtx = () => $("calibCanvas").getContext("2d", { willReadFrequently: true });

  $("calibInput").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const c = $("calibCanvas");
      const scale = Math.min(1, 1600 / Math.max(im.width, im.height));
      c.width = Math.round(im.width * scale);
      c.height = Math.round(im.height * scale);
      calibCtx().drawImage(im, 0, 0, c.width, c.height);
      calib = { queue: [], idx: 0 };
      for (const pad of activePads()) {
        pad.scale.forEach((s, i) => calib.queue.push({ pad, i, v: s.v }));
      }
      $("calibWrap").hidden = false;
      calibPrompt();
    };
    im.src = url;
    ev.target.value = "";
  });

  function calibPrompt() {
    const q = calib.queue[calib.idx];
    $("calibPrompt").textContent = q
      ? `Tap the swatch: ${q.pad.label} = ${q.v} (${calib.idx + 1}/${calib.queue.length})`
      : "";
  }

  $("calibStage").addEventListener("click", (e) => {
    if (!calib || !calib.queue[calib.idx]) return;
    const r = $("calibStage").getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const c = $("calibCanvas");
    const rgb = AC.reader.samplePoint(c, calibCtx(), x, y, 0.008).map(Math.round);
    const hex = "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
    const q = calib.queue[calib.idx];
    q.pad.scale[q.i].hex = hex;
    calib.idx++;
    if (calib.idx >= calib.queue.length) {
      save(); renderChartEditor();
      $("calibWrap").hidden = true;
      calib = null;
      alert("Calibration complete — chart colors updated.");
    } else calibPrompt();
  });

  $("btnCalibCancel").addEventListener("click", () => {
    $("calibWrap").hidden = true;
    calib = null;
    save(); renderChartEditor();
  });

  /* ---- backup / restore ---- */
  $("btnBackup").addEventListener("click", () =>
    download("aqua-crystal-backup.json", AC.store.exportJson(), "application/json"));

  $("backupFile").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        if (!confirm("Restoring replaces ALL current data. Continue?")) return;
        AC.store.importJson(fr.result.toString());
        location.reload();
      } catch (e) { alert("Restore failed: " + e.message); }
    };
    fr.readAsText(f);
    ev.target.value = "";
  });

  /* ================= boot ================= */
  fillInvSelect();
  fillEventSelectors();
  fillStripSelects();
  renderPool();
  renderLog();
  banner();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
