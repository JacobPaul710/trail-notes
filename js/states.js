"use strict";
// States: the "CA - Tahoe" area naming, state names, outlines, and the most-recent-first order. Works in the browser (window.TN.states) and in Node (tests).
(function (root) {
  const NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };
  // Outlines drawn on a 24 x 24 box. States without one yet show their code in a badge.
  const OUTLINES = {"WA": "M2.00 7.85L4.13 8.64L6.17 8.82L7.04 8.82L7.07 9.84L6.56 10.97L6.17 11.72L6.56 12.73L7.84 12.28L7.97 10.78L8.48 9.28L7.71 7.40L6.99 5.52L21.69 5.52L21.69 15.21L22.00 16.79L16.72 16.79L16.03 17.05L15.14 17.09L13.60 17.84L11.30 18.22L9.12 17.92L7.97 18.48L7.04 18.11L6.43 16.42L5.53 16.23L4.00 15.85L3.69 14.91L3.61 13.41L3.49 12.47L2.97 10.59L2.08 8.71Z", "OR": "M3.40 4.49L3.52 4.49L5.02 4.84L5.90 5.02L6.49 6.61L7.39 6.96L8.52 6.43L10.64 6.72L12.89 6.36L14.38 5.65L15.26 5.62L15.93 5.37L21.08 5.37L22.00 6.96L21.38 8.91L20.38 11.03L20.80 13.15L20.80 19.51L2.90 19.51L2.00 16.54L3.02 13.86L3.20 11.38L3.52 8.20L3.52 5.37Z", "CA": "M3.52 2.00L10.70 2.00L10.70 8.34L19.86 16.78L19.96 17.21L20.71 18.26L20.17 18.68L19.74 20.16L20.08 21.01L19.71 21.60L15.62 22.00L15.39 21.32L15.31 20.80L14.29 19.74L13.60 19.53L13.18 18.81L12.07 18.58L10.87 18.05L9.85 17.95L9.60 17.73L9.60 16.47L8.49 15.41L7.46 14.04L7.46 13.40L7.29 12.67L6.61 12.14L6.44 10.87L5.67 10.45L4.39 8.55L4.22 6.86L3.29 5.27L3.71 4.11L3.71 2.63Z"};

  /** "CA - Tahoe" -> { code: "CA", short: "Tahoe" }. A name with no state -> { code: "", short: name }. */
  function parseArea(name) {
    const m = String(name || "").trim().match(/^([A-Za-z]{2})\s*[-\u2013\u2014]\s*(.+)$/);
    if (m && NAMES[m[1].toUpperCase()]) return { code: m[1].toUpperCase(), short: m[2].trim() };
    return { code: "", short: String(name || "").trim() };
  }

  /** Areas most recently worked in first (never worked: by when they were added). */
  function byRecent(areas) {
    const t = (a) => a.worked || a.at || 0;
    return [...areas].sort((x, y) => t(y) - t(x));
  }

  /** [{ code, name, areas }]: one group per state, the state worked in most recently first, "Other" (no state) last. */
  function group(areas) {
    const groups = new Map();
    for (const a of byRecent(areas)) {
      const code = parseArea(a.name).code;
      if (!groups.has(code)) groups.set(code, { code, name: code ? NAMES[code] : "Other", areas: [] });
      groups.get(code).areas.push(a);
    }
    const all = [...groups.values()];
    return [...all.filter((g) => g.code), ...all.filter((g) => !g.code)];
  }

  const api = { NAMES, OUTLINES, parseArea, byRecent, group };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.TN = root.TN || {}).states = api;
})(typeof window !== "undefined" ? window : globalThis);
