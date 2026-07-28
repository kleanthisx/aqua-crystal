/* Aqua Crystal — default data: strip reference chart, targets, products.
   All colors are approximations of a generic 7-in-1 strip bottle chart.
   Use Pool ▸ Calibrate to sample the real colors from a photo of YOUR bottle. */
window.AC = window.AC || {};

AC.DEFAULTS = {
  settings: {
    units: "metric",            // "metric" | "imperial"
    stripType: "7",             // key into AC.STRIP_TYPES
    sanitizer: "chlorine",      // "chlorine" | "bromine"
    chlorineProduct: "liquid",  // liquid | dichlor | trichlor | calhypo
    chlorineStrength: 12,       // % available chlorine for liquid
    acidProduct: "dryacid",     // dryacid | muriatic
    aiKey: "",
    aiModel: "gemini-2.5-flash"
  },
  profile: {
    volumeM3: 50,          // pool volume, stored in m3 always
    pumpFlowM3h: 10,       // pump throughput m3/h
    filterType: "sand",    // sand | cartridge | de
    lastClean: "",         // ISO date of last backwash / cartridge clean
    cleanIntervalDays: 28
  },
  targets: {
    fc:  { min: 1,   max: 3,   ideal: 2   },
    br:  { min: 3,   max: 5,   ideal: 4   },
    ph:  { min: 7.2, max: 7.6, ideal: 7.4 },
    ta:  { min: 80,  max: 120, ideal: 100 },
    cya: { min: 30,  max: 50,  ideal: 40  },
    th:  { min: 200, max: 400, ideal: 300 },
    ccMax: 0.5
  },
  inventory: [],
  log: [],
  chart: {
    pads: [
      { id: "th",  label: "Total Hardness",  unit: "ppm", dec: 0,
        scale: [ { v: 0,   hex: "#b9d6e8" }, { v: 25,  hex: "#aec3de" }, { v: 50,  hex: "#a3aed3" },
                 { v: 120, hex: "#9a93c4" }, { v: 250, hex: "#8b74ad" }, { v: 425, hex: "#7a5896" } ] },
      { id: "tc",  label: "Total Chlorine",  unit: "ppm", dec: 1,
        scale: [ { v: 0, hex: "#f6f2e0" }, { v: 0.5, hex: "#eedde4" }, { v: 1, hex: "#e5c3d6" },
                 { v: 3, hex: "#cf8fba" }, { v: 5,   hex: "#b7639b" }, { v: 10, hex: "#93437a" } ] },
      { id: "fc",  label: "Free Chlorine",   unit: "ppm", dec: 1,
        scale: [ { v: 0, hex: "#f6f2e0" }, { v: 0.5, hex: "#efdbe2" }, { v: 1, hex: "#e4b8cf" },
                 { v: 3, hex: "#cd85b2" }, { v: 5,   hex: "#b25a90" }, { v: 10, hex: "#8e3c6f" } ] },
      { id: "br",  label: "Bromine",         unit: "ppm", dec: 1,
        scale: [ { v: 0, hex: "#f6f2e0" }, { v: 1, hex: "#eed9e0" }, { v: 2,  hex: "#e0b1c8" },
                 { v: 6, hex: "#c67ba6" }, { v: 10, hex: "#aa5486" }, { v: 20, hex: "#873968" } ] },
      { id: "ph",  label: "pH",              unit: "",    dec: 1,
        scale: [ { v: 6.2, hex: "#f2b23f" }, { v: 6.8, hex: "#ef9a3c" }, { v: 7.2, hex: "#e9813a" },
                 { v: 7.8, hex: "#dc603b" }, { v: 8.4, hex: "#c34745" } ] },
      { id: "ta",  label: "Total Alkalinity", unit: "ppm", dec: 0,
        scale: [ { v: 0,   hex: "#f4e37c" }, { v: 40,  hex: "#cfdb7a" }, { v: 80,  hex: "#a9cd7c" },
                 { v: 120, hex: "#8dbf7f" }, { v: 180, hex: "#57a483" }, { v: 240, hex: "#3d8a85" } ] },
      { id: "cya", label: "Cyanuric Acid",   unit: "ppm", dec: 0,
        scale: [ { v: 0,   hex: "#f0a63e" }, { v: 30,  hex: "#e3924a" }, { v: 50,  hex: "#d47f55" },
                 { v: 100, hex: "#c9705e" }, { v: 150, hex: "#a85a71" }, { v: 300, hex: "#7c4a7f" } ] }
    ]
  }
};

/* Chemical products the dosing engine knows how to compute. */
AC.PRODUCTS = {
  liquid:   { name: "Liquid chlorine (sodium hypochlorite)", form: "ml" },
  dichlor:  { name: "Dichlor granules (56%)",                form: "g", factor: 0.56 },
  trichlor: { name: "Trichlor (90%)",                        form: "g", factor: 0.90 },
  calhypo:  { name: "Cal-hypo granules (65%)",               form: "g", factor: 0.65 },
  sodaash:  { name: "Soda ash / pH+ (sodium carbonate)",     form: "g" },
  dryacid:  { name: "Dry acid / pH− (sodium bisulfate)",     form: "g" },
  muriatic: { name: "Muriatic acid (~32% HCl)",              form: "ml" },
  bicarb:   { name: "Baking soda / Alkalinity+ (sodium bicarbonate)", form: "g" },
  stabilizer: { name: "Stabilizer / CYA (cyanuric acid)",    form: "g" },
  calchlor: { name: "Calcium chloride flakes (~77%)",        form: "g" },
  bromtabs: { name: "Bromine tablets",                       form: "tabs" },
  clarifier: { name: "Clarifier",                            form: "ml" },
  algaecide: { name: "Algaecide",                            form: "ml" }
};

AC.STATE_OPTIONS = ["clear", "slightly cloudy", "cloudy", "milky", "green tint", "green / algae",
                    "chlorine smell / stinging eyes", "sludge / mold", "debris", "other"];

/* Strip formats — pad ids in top-to-bottom order on the strip. */
AC.STRIP_TYPES = {
  "7": { label: "7-in-1 (Hardness, TC, FC, Br, pH, TA, CYA)", pads: ["th", "tc", "fc", "br", "ph", "ta", "cya"] },
  "4": { label: "4-in-1 (FC, pH, TA, CYA)",                   pads: ["fc", "ph", "ta", "cya"] },
  "3": { label: "3-in-1 (FC, pH, TA)",                        pads: ["fc", "ph", "ta"] }
};

/* Event kinds for the diary (things that happen between strip readings). */
AC.EVENT_KINDS = {
  dose:      "Chemical added",
  backwash:  "Backwash / filter clean",
  filter:    "Filter cartridge / media switched",
  water:     "Refill / heavy rain (dilution)",
  freshfill: "Fresh fill (new water)",
  cover:     "Cover on / off",
  note:      "Note"
};

/* Side effects per gram of product per m3 → ppm added (drives CYA / hardness bookkeeping).
   tabs are assumed 200 g trichlor pucks / 20 g bromine tabs when logged as "tabs". */
AC.SIDE_EFFECTS = {
  trichlor:   { cya: 0.55 },
  dichlor:    { cya: 0.51 },
  stabilizer: { cya: 1.0 },
  calhypo:    { th: 0.46 },
  calchlor:   { th: 0.66 }
};
AC.TAB_GRAMS = { trichlor: 200, bromtabs: 20 };
