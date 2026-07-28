/* Aqua Crystal — persistent state in localStorage. */
window.AC = window.AC || {};

AC.store = (function () {
  const KEY = "aquacrystal.v1";

  function deepMerge(base, over) {
    if (Array.isArray(base) || Array.isArray(over) || typeof base !== "object" || base === null) {
      return over === undefined ? base : over;
    }
    const out = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(over || {})])) {
      out[k] = deepMerge(base[k], over ? over[k] : undefined);
    }
    return out;
  }

  let state;

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    state = deepMerge(JSON.parse(JSON.stringify(AC.DEFAULTS)), saved || {});
    // arrays come whole from saved copy (deepMerge treats arrays atomically)
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      console.error("save failed", e);
      alert("Couldn't save — device storage for this app is full. " +
            "Export a CSV/backup, then delete old entries or their pool photos.");
    }
  }

  function exportJson() { return JSON.stringify(state, null, 2); }

  function importJson(text) {
    const obj = JSON.parse(text); // throws if invalid
    state = deepMerge(JSON.parse(JSON.stringify(AC.DEFAULTS)), obj);
    save();
    return state;
  }

  function resetChart() {
    state.chart = JSON.parse(JSON.stringify(AC.DEFAULTS.chart));
    save();
  }

  return {
    load, save, exportJson, importJson, resetChart,
    get: () => state
  };
})();
