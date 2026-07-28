/* Aqua Crystal — dosing engine.
   All internal math is metric: pool volume m3, doses in grams / milliliters.
   1 ppm of a substance = 1 g of that substance per m3 of water.
   Doses are approximations for typical outdoor pools — always add in steps,
   with the pump running, and retest before adding more. */
window.AC = window.AC || {};

AC.dosing = (function () {

  /* ---- unit helpers ---- */
  const M3_TO_GAL = 264.172;

  function fmtQty(qty, form, units) {
    // qty is g or ml (or tabs)
    if (form === "tabs") return Math.ceil(qty) + " tab(s)";
    if (units === "imperial") {
      const oz = qty / 28.35; // weight oz ~ fl oz close enough for guidance
      if (form === "ml") return (qty / 29.574).toFixed(1) + " fl oz";
      return oz >= 16 ? (oz / 16).toFixed(2) + " lb" : oz.toFixed(1) + " oz";
    }
    if (qty >= 1000) return (qty / 1000).toFixed(2) + (form === "ml" ? " L" : " kg");
    return Math.round(qty) + (form === "ml" ? " ml" : " g");
  }

  function fmtVol(m3, units) {
    return units === "imperial"
      ? Math.round(m3 * M3_TO_GAL).toLocaleString() + " gal"
      : m3.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " m³";
  }

  /* ---- product dose computations (returns qty in g or ml) ---- */

  function chlorineDose(ppm, V, settings) {
    const p = settings.chlorineProduct;
    const gramsClNeeded = ppm * V; // grams of available chlorine
    if (p === "liquid") {
      const s = Math.max(1, Number(settings.chlorineStrength) || 12);
      return { product: "liquid", qty: gramsClNeeded * 100 / s, form: "ml",
               name: `${s}% liquid chlorine` };
    }
    const f = AC.PRODUCTS[p].factor || 0.6;
    return { product: p, qty: gramsClNeeded / f, form: "g", name: AC.PRODUCTS[p].name };
  }

  function acidDose(dPh, V, settings) {
    // per 0.1 pH decrease: ~6 g/m3 dry acid or ~6.5 ml/m3 muriatic (TA-dependent, approximate)
    const steps = dPh / 0.1;
    if (settings.acidProduct === "muriatic") {
      return { product: "muriatic", qty: 6.5 * V * steps, form: "ml", name: AC.PRODUCTS.muriatic.name };
    }
    return { product: "dryacid", qty: 6 * V * steps, form: "g", name: AC.PRODUCTS.dryacid.name };
  }

  const sodaAshDose  = (dPh, V) => ({ product: "sodaash", qty: 10 * V * (dPh / 0.1), form: "g", name: AC.PRODUCTS.sodaash.name });
  const bicarbDose   = (dTa, V) => ({ product: "bicarb",  qty: 1.7 * V * dTa,        form: "g", name: AC.PRODUCTS.bicarb.name });
  const cyaDose      = (dCya, V) => ({ product: "stabilizer", qty: 1.0 * V * dCya,   form: "g", name: AC.PRODUCTS.stabilizer.name });
  const calciumDose  = (dTh, V) => ({ product: "calchlor", qty: 1.5 * V * dTh,       form: "g", name: AC.PRODUCTS.calchlor.name });

  /* ---- inventory check ---- */

  function toBase(amount, unit) {
    // base units: g for weights, ml for liquids, tabs as-is
    switch (unit) {
      case "kg": return { qty: amount * 1000, form: "g" };
      case "g":  return { qty: amount, form: "g" };
      case "L":  return { qty: amount * 1000, form: "ml" };
      case "ml": return { qty: amount, form: "ml" };
      case "lb": return { qty: amount * 453.6, form: "g" };
      case "oz": return { qty: amount * 28.35, form: "g" };
      case "tabs": return { qty: amount, form: "tabs" };
      default: return { qty: amount, form: "g" };
    }
  }

  function invStatus(dose, inventory, units) {
    const item = (inventory || []).find(i => i.product === dose.product);
    if (!item) return { ok: false, text: "⚠ not in your chemicals list" };
    const have = toBase(Number(item.amount) || 0, item.unit);
    if (have.qty >= dose.qty) {
      return { ok: true, text: `you have ${fmtQty(have.qty, dose.form, units)} ✓` };
    }
    return { ok: false, text: `⚠ only ${fmtQty(have.qty, dose.form, units)} on hand — not enough` };
  }

  /* ---- main advisor ----
     readings: {th,tc,fc,br,ph,ta,cya} numbers or null
     meta: { cya: {estimated:true, ageDays:n|null}, th: {...} } — values inferred, not measured
     returns array of { text, done:false } ordered by priority */
  function advise(readings, profile, settings, targets, inventory, meta) {
    meta = meta || {};
    const V = Math.max(0.5, Number(profile.volumeM3) || 1);
    const u = settings.units;
    const out = [];
    const add = (text) => out.push({ text, done: false });
    const has = (k) => readings[k] !== null && readings[k] !== undefined && !isNaN(readings[k]);
    const est = (k) => meta[k] && meta[k].estimated ? " (≈ estimated, not measured)" : "";

    add(`Pool volume ${fmtVol(V, u)} — all doses below are scaled to it. ` +
        `Add chemicals with the pump running; never mix products together.`);

    /* 1 — sanitizer */
    if (settings.sanitizer === "bromine" && has("br")) {
      const br = readings.br, t = targets.br;
      if (br < t.min) {
        add(`Bromine LOW at ${br} ppm (target ${t.min}–${t.max}). Top up the brominator / floater ` +
            `with tablets and increase its dial; recheck in 12–24 h.`);
      } else if (br > t.max) {
        add(`Bromine HIGH at ${br} ppm (target ${t.min}–${t.max}). Close the brominator dial and ` +
            `let it drift down. Avoid swimming above 10 ppm.`);
      } else add(`Bromine OK at ${br} ppm.`);
    } else if (has("fc")) {
      const fc = readings.fc, t = targets.fc;
      if (fc < t.min) {
        const d = chlorineDose(t.ideal - fc, V, settings);
        const inv = invStatus(d, inventory, u);
        add(`Free chlorine LOW at ${fc} ppm (target ${t.min}–${t.max}). ` +
            `Add ${fmtQty(d.qty, d.form, u)} of ${d.name} — ${inv.text}. ` +
            `Best in the evening. Retest in 4–6 h.` +
            (d.product === "dichlor" ? " Note: dichlor also raises CYA (~0.9 ppm per 1 ppm FC)." : "") +
            (d.product === "calhypo" ? " Note: cal-hypo also raises calcium hardness." : ""));
      } else if (fc > t.max) {
        add(`Free chlorine HIGH at ${fc} ppm (target ${t.min}–${t.max}). Stop dosing; sunlight will ` +
            `burn it off in a day or two. Don't swim above 5 ppm.`);
      } else add(`Free chlorine OK at ${fc} ppm.`);
    }

    /* combined chlorine → shock */
    if (has("fc") && has("tc") && settings.sanitizer === "chlorine") {
      const cc = Math.max(0, Number((readings.tc - readings.fc).toFixed(1)));
      if (cc >= targets.ccMax) {
        const d = chlorineDose(cc * 10, V, settings);
        const inv = invStatus(d, inventory, u);
        add(`Combined chlorine is ${cc} ppm (chloramines — the "chlorine smell"). Shock the pool: ` +
            `add ~${fmtQty(d.qty, d.form, u)} of ${d.name} after sunset (breakpoint ≈ 10× CC) — ${inv.text}. ` +
            `Run the pump overnight and don't swim until FC drops back below ${targets.fc.max} ppm.`);
      }
    }

    /* 2 — pH */
    if (has("ph")) {
      const ph = readings.ph, t = targets.ph;
      if (ph > t.max) {
        const d = acidDose(ph - t.ideal, V, settings);
        const inv = invStatus(d, inventory, u);
        add(`pH HIGH at ${ph} (target ${t.min}–${t.max}). Add ${fmtQty(d.qty, d.form, u)} of ${d.name} ` +
            `— ${inv.text}. Pre-dilute in a bucket of pool water, pour around the deep end. ` +
            `Retest after 4 h. High pH makes chlorine much less effective.`);
      } else if (ph < t.min) {
        const d = sodaAshDose(t.ideal - ph, V);
        const inv = invStatus(d, inventory, u);
        add(`pH LOW at ${ph} (target ${t.min}–${t.max}). Add ${fmtQty(d.qty, d.form, u)} of ${d.name} ` +
            `— ${inv.text}. Dissolve in a bucket first. Retest after 4 h. ` +
            `Low pH is corrosive to metal parts and irritates eyes.`);
      } else add(`pH OK at ${ph}.`);
    }

    /* 3 — total alkalinity */
    if (has("ta")) {
      const ta = readings.ta, t = targets.ta;
      if (ta < t.min) {
        const d = bicarbDose(t.ideal - ta, V);
        const inv = invStatus(d, inventory, u);
        add(`Alkalinity LOW at ${ta} ppm (target ${t.min}–${t.max}). Add ${fmtQty(d.qty, d.form, u)} ` +
            `of ${d.name} — ${inv.text}. Spread over the surface in 2 doses a few hours apart. ` +
            `Low TA makes pH swing wildly — fix TA before chasing pH.`);
      } else if (ta > t.max + 40) {
        add(`Alkalinity HIGH at ${ta} ppm (target ${t.min}–${t.max}). Lower it gradually: dose acid to ` +
            `pH 7.0–7.2, then aerate (fountain / jets up) to bring pH back up without raising TA. ` +
            `Repeat over several days.`);
      } else if (ta > t.max) {
        add(`Alkalinity slightly high at ${ta} ppm — acceptable, no action needed yet.`);
      } else add(`Alkalinity OK at ${ta} ppm.`);
    }

    /* 4 — CYA */
    if (has("cya") && settings.sanitizer === "chlorine") {
      const cya = readings.cya, t = targets.cya;
      if (cya < t.min) {
        const d = cyaDose(t.ideal - cya, V);
        const inv = invStatus(d, inventory, u);
        add(`Stabilizer (CYA) LOW at ${cya} ppm${est("cya")} (target ${t.min}–${t.max}) — chlorine burns off fast in the ` +
            `sun. Add ${fmtQty(d.qty, d.form, u)} of ${d.name} — ${inv.text}. Dissolve slowly (sock in ` +
            `skimmer basket); takes up to a week to register on tests.`);
      } else if (cya > 100) {
        add(`Stabilizer (CYA) VERY HIGH at ${cya} ppm${est("cya")} — chlorine is being locked up. The only practical fix ` +
            `is a partial drain & refill (~${Math.round((1 - t.ideal / cya) * 100)}% of the water).`);
      } else if (cya > t.max) {
        add(`Stabilizer (CYA) high at ${cya} ppm${est("cya")}. Stop using stabilized chlorine (dichlor/trichlor) — ` +
            `switch to liquid chlorine or cal-hypo. Dilution via backwash/rain will bring it down slowly.`);
      } else add(`Stabilizer (CYA) OK at ${cya} ppm${est("cya")}.`);
    }

    /* 5 — hardness */
    if (has("th")) {
      const th = readings.th, t = targets.th;
      if (th < t.min) {
        const d = calciumDose(t.ideal - th, V);
        const inv = invStatus(d, inventory, u);
        add(`Calcium hardness LOW at ${th} ppm${est("th")} (target ${t.min}–${t.max}). Soft water attacks grout and ` +
            `metal. Add ${fmtQty(d.qty, d.form, u)} of ${d.name} — ${inv.text}. Pre-dissolve, add slowly ` +
            `(it heats the water).` +
            (est("th") ? " Since this is an estimate, confirm with a real hardness test before dosing." : ""));
      } else if (th > 500) {
        add(`Calcium hardness HIGH at ${th} ppm${est("th")} — scaling risk. Keep pH at the low end (7.2) and consider ` +
            `partial refill with softer water.`);
      } else add(`Calcium hardness OK at ${th} ppm${est("th")}.`);
    }

    /* 6 — staleness of estimates */
    const staleNames = { cya: "Stabilizer (CYA)", th: "Calcium hardness" };
    const stale = [];
    for (const k of ["cya", "th"]) {
      if (meta[k] && meta[k].estimated) {
        if (meta[k].ageDays == null) stale.push(`${staleNames[k]} has never been measured — its value is ` +
          `bookkept from your dose history`);
        else if (meta[k].ageDays > 42) stale.push(`${staleNames[k]} was last measured ${meta[k].ageDays} days ago`);
      }
    }
    if (stale.length) {
      add(`📏 ${stale.join("; ")}. Anchor the estimate: run one 7-in-1 strip or a pool-store water test.`);
    }
    if (readings.tc == null && settings.sanitizer === "chlorine" && has("fc")) {
      add(`ℹ Your strip has no Total Chlorine pad, so combined chlorine (the shock trigger) can't be measured. ` +
          `If the water smells of chlorine or stings eyes, log that state — it's the tell-tale for shocking.`);
    }

    return out;
  }

  /* extra advice from water state + filter reminder */
  function stateAdvice(stateStr, profile, settings, inventory) {
    const out = [];
    const s = (stateStr || "").toLowerCase();
    const V = Math.max(0.5, Number(profile.volumeM3) || 1);
    if (s.includes("smell") || s.includes("sting")) {
      const d = chlorineDose(5, V, settings);
      const inv = invStatus(d, inventory || [], settings.units);
      out.push({ text: `Chlorine smell / stinging eyes = chloramines (combined chlorine), even without a TC pad ` +
                       `to prove it. Shock: add ~${fmtQty(d.qty, d.form, settings.units)} of ${d.name} after ` +
                       `sunset (${inv.text}), pump running overnight. Smell should be gone by morning.`, done: false });
    }
    if (s.includes("sludge") || s.includes("mold")) {
      out.push({ text: `Sludge / mold: physically remove what you can (net, brush, vacuum to waste if possible), ` +
                       `then shock hard and keep FC high until the water holds chlorine overnight. Swap or ` +
                       `thoroughly clean the filter afterwards — it is now a contamination reservoir that will ` +
                       `re-seed the pool. Log the filter change as an event.`, done: false });
    }
    if (s.includes("cloud") || s.includes("milky")) {
      out.push({ text: "Water is cloudy: run the pump 24 h, check filter pressure, backwash/clean the filter " +
                       "if pressure is up ~0.3+ bar over clean baseline, and make sure FC is in range. " +
                       "A clarifier dose can help the filter catch fine particles.", done: false });
    }
    if (s.includes("green") || s.includes("algae")) {
      out.push({ text: "Green water = algae. Brush walls & floor, then shock heavily (see chlorine advice), " +
                       "run the pump continuously, backwash daily, and retest FC every morning until the water " +
                       "holds chlorine overnight. Algaecide is a supplement, not a substitute for shock.", done: false });
    }
    const days = filterDueDays(profile);
    if (days !== null && days <= 0) {
      const what = profile.filterType === "cartridge" ? "cartridge clean" : "backwash + rinse";
      out.push({ text: `Filter maintenance due (${what}) — last done ${profile.lastClean || "never"}. ` +
                       `See the Guide tab for steps.`, done: false });
    }
    return out;
  }

  /* days until next filter clean; negative = overdue; null = unknown */
  function filterDueDays(profile) {
    if (!profile.lastClean) return null;
    const last = new Date(profile.lastClean);
    if (isNaN(last)) return null;
    const due = new Date(last.getTime() + (Number(profile.cleanIntervalDays) || 28) * 86400000);
    return Math.ceil((due - new Date()) / 86400000);
  }

  function turnoverInfo(profile, units) {
    const V = Number(profile.volumeM3) || 0, F = Number(profile.pumpFlowM3h) || 0;
    if (!V || !F) return "";
    const hours = V / F;
    return `One full turnover takes ${hours.toFixed(1)} h at ${F} m³/h. ` +
           `Aim for 1–2 turnovers/day: run the pump ~${Math.ceil(hours)}–${Math.ceil(hours * 2)} h/day ` +
           `(more in high season / after shocking).`;
  }

  return { advise, stateAdvice, filterDueDays, turnoverInfo, fmtQty, fmtVol };
})();
