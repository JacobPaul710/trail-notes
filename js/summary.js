"use strict";
// The trail summary, built from the card's answers. Draft template from Jacob (Nov 7);
// he'll refine it. Missing pieces come back as gaps, so you can see what to add.
// Browser (window.TN.summary) and Node.
(function (root) {
  const val = (card, id) => {
    const a = card.answers && card.answers[id];
    return a && a.status === "answered" ? a.value : "";
  };
  const vals = (card, id) => {
    const a = card.answers && card.answers[id];
    if (!a || a.status !== "answered") return [];
    return a.values || String(a.value).split(/,\s*/).filter(Boolean);
  };
  const listJoin = (xs) => (xs.length <= 1 ? xs.join("") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);
  const lower = (s) => String(s).toLowerCase();

  // "forks / spurs / travels", from where it starts
  const VERB = { Paved: "spurs", Unpaved: "forks", "From a fork": "forks", "From pavement": "spurs", "From a highway": "spurs" };
  // Name ends in a letter (96N98A) -> a spur. Otherwise a steady pick from a few verbs, so summaries don't all read alike.
  const LEAVES = ["forks", "travels", "runs", "branches off", "wanders"];
  function leaveVerb(card) {
    const name = String(card.name || "").trim();
    if (/\d[A-Za-z]$/.test(name)) return "spurs";
    let h = 0;
    for (const ch of name + String(card.number || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return LEAVES[h % LEAVES.length];
  }
  const ENVIRONMENT = { Green: "a green forest", "Fire-scarred": "a fire-scarred forest", Mosaic: "a mosaic of green and fire-scarred forest",
    Diverse: "a diverse forest", "Burn scar": "a burn scar", Regrowth: "an area of regrowth" };
  const SURFACE = { Dirt: "dirt", Grass: "grass", Gravel: "gravel", Mud: "mud", Paved: "paved", Rock: "rock", Rocky: "rocky", Sand: "sand", "Slick-rock": "slick-rock", Mixed: "mixed-surface" };
  const WIDTH = { "Single track": "single track trail", "Double track": "double track trail", "Shelf road": "shelf road" };
  const ENDING = {
    Overgrowth: "where overgrowth blocks the way",
    "Downed tree": "at a downed tree",
    "End of official development": "where official development halted",
    "Dispersed campsite": "at a dispersed campsite",
    Turnaround: "at a turnaround",
    "Gate or property": "at a gate",
    Campground: "at a campground",
    "Connects to another road": "where it meets another road",
  };
  const OBSTACLE = {
    Sand: "sand", "Mud hole": "a mud hole", Ruts: "ruts", "Rock obstacle": "a rock obstacle", Ledge: "a ledge",
    "Rock garden": "a rock garden", "Off-camber": "off-camber sections", "Shelf road": "a shelf road", "Narrow trail": "a narrow trail",
    "Low overhead clearance": "low overhead clearance", Switchbacks: "switchbacks", "Water crossing": "a water crossing", Whoops: "whoops",
    "Silt bed": "a silt bed", "Overgrown vegetation": "overgrown vegetation", "Tight trees": "tight trees", Wash: "a wash",
    "Log crossing": "a log crossing",
    // from earlier versions
    "Down trees": "downed trees", Rocks: "rocks", "Creek crossing": "a creek crossing",
  };
  const NO_OBSTACLES = ["None", "No significant obstacles"];

  // POIs: where they go in the summary, and what to call one with no name in its note
  const POI_ACCESS = { "Hiking trail": "a hiking trail", "Developed campground": "a developed campground", Campground: "a developed campground",
    Campsite: "a campsite", "Parking/staging area": "a parking and staging area", "Restroom/pit toilet": "a restroom", "Water source": "a water source" };
  const POI_CROSS = { "Creek crossing": "a creek", "Water crossing": "a creek" };
  const POI_PASS = { "Lake or river": "a lake or river", Viewpoint: "a viewpoint", "Lookout tower": "a lookout tower", "Historic landmark": "a historic landmark",
    Waterfall: "a waterfall", "Swimming hole": "a swimming hole", "Hot spring": "a hot spring" };
  /** A POI's name for a sentence: its note when that's a short name, else the generic phrase. */
  function poiName(p, generic) {
    const n = String(p.note || "").trim().replace(/[.]+$/, "");
    if (!n || n.length > 40) return generic;
    if (p.type === "Hiking trail" && !/trail/i.test(n)) return `${n} hiking trail`;
    if ((p.type === "Developed campground" || p.type === "Campground") && !/campground/i.test(n)) return `${n} developed campground`;
    return n;
  }
  const uniq = (xs) => [...new Set(xs)];
  const RATING = { "Level 1": "This trail is a level 1 rating and is suitable for all vehicles." };
  const ELEVATION = { "Gains elevation": "gains elevation", "Loses elevation": "loses elevation", "Mostly flat": "stays mostly flat" };

  /**
   * Returns paragraphs, each a list of pieces: { text } or { gap: "what's missing" }.
   * card: { name, answers, startFrom, pois: [{ type, note }] }
   */
  function build(card) {
    const paras = [];
    const P = () => { const p = []; paras.push(p); return p; };
    const t = (p, text) => p.push({ text });
    const g = (p, gap) => p.push({ gap });

    // 1. Name, how it leaves (paved road: spurs, unpaved: forks), direction, where from, environment
    let p = P();
    const heads = val(card, "heads"), forest = val(card, "forest");
    t(p, `${card.name || "This trail"} ${leaveVerb(card)} `);
    heads ? t(p, lower(heads)) : g(p, "direction");
    t(p, " from ");
    card.startFrom ? t(p, card.startFrom) : g(p, "road or trail it starts from");
    t(p, " through ");
    // the area description (set once for the whole area, or this trail's own): "through the flourishing forest"
    const area = String(card.areaText || "").trim().replace(/^(the|a|an)\s+/i, "").replace(/[.\s]+$/, "");
    area ? t(p, `the ${area}`) : g(p, "area description");
    t(p, ". ");
    t(p, "The forest is ");
    forest ? t(p, lower(forest)) : g(p, "forest type");
    t(p, ". ");

    // 2. Surface (two or more: "mixed gravel/dirt"), width, landscape it crosses
    const surfaces = vals(card, "surface"), width = val(card, "width"), crosses = vals(card, "crosses");
    t(p, "It runs as a ");
    if (!surfaces.length) g(p, "surface");
    else if (surfaces.length === 1) t(p, SURFACE[surfaces[0]] || lower(surfaces[0]));
    else t(p, `mixed ${surfaces.map((x) => lower(x)).join("/")}`);
    t(p, " ");
    width ? t(p, WIDTH[width] || lower(width)) : g(p, "width");
    if (crosses.length) t(p, ` and crosses ${listJoin(crosses.map(lower))}`);
    t(p, ". ");

    // elevation change and grade: "It both gains and loses elevation at a 12% grade variation."
    const elev = vals(card, "elevation");
    const grade = card.answers && card.answers.grade;
    t(p, "It ");
    if (!elev.length) g(p, "elevation change");
    else if (elev.includes("Gains elevation") && elev.includes("Loses elevation")) t(p, "both gains and loses elevation");
    else t(p, ELEVATION[elev[0]] || lower(elev[0]));
    t(p, " at a ");
    if (grade && grade.status === "answered") t(p, grade.number ? `${grade.number}%` : /^\d+%$/.test(grade.heard || "") ? grade.heard : grade.value);
    else g(p, "grade");
    t(p, " grade variation.");

    // 3. Type of trail, how it ends, what it gives access to
    p = P();
    const type = val(card, "type"), ends = vals(card, "ends");
    // how it ends, as pieces: "at its junction with Ellis Peak Road and at a downed tree"
    const endPieces = (into) => {
      ends.forEach((e, i) => {
        if (i) t(into, i === ends.length - 1 ? " and " : ", ");
        if (e === "Connects to another path") {
          t(into, "at its junction with ");
          card.endsAt ? t(into, card.endsAt) : g(into, "path it connects to");
        } else t(into, ENDING[e] || `at ${lower(e)}`);
      });
    };
    if (type === "Point-to-point") {
      t(p, "As a point-to-point trail, it provides access to alternative routes along its path.");
      if (ends.length) { t(p, " It ends "); endPieces(p); t(p, "."); }
    } else if (type === "Out-and-back") {
      t(p, "As an out-and-back trail, it ends ");
      ends.length ? endPieces(p) : g(p, "how it ends");
      t(p, " and provides a turn-around location.");
    } else if (type === "Loop") t(p, "As a loop trail, it returns to where it began.");
    else g(p, "trail type");
    const pois = card.pois || [];
    const crossPois = uniq(pois.filter((x) => POI_CROSS[x.type]).map((x) => poiName(x, POI_CROSS[x.type])));
    const passes = uniq(pois.filter((x) => POI_PASS[x.type]).map((x) => poiName(x, POI_PASS[x.type])));
    if (crossPois.length || passes.length) {
      const bits = [];
      if (crossPois.length) bits.push(`crosses ${listJoin(crossPois)}`);
      if (passes.length) bits.push(`passes ${listJoin(passes)}`);
      t(p, ` Along the way it ${bits.join(" and ")}.`);
    }
    const access = uniq(pois.filter((x) => POI_ACCESS[x.type]).map((x) => poiName(x, POI_ACCESS[x.type])));
    if (access.length) t(p, ` This trail provides access to ${listJoin(access)}.`);
    if (pois.some((x) => x.type === "Road closure barrier")) t(p, " Boulders or logs across the road mark a closure.");

    // 4. Foliage, obstacles, rating
    p = P();
    const brush = val(card, "brush");
    if (brush === "None") t(p, "This trail has no foliage contact. ");
    else if (brush) t(p, `This trail has ${lower(brush)} foliage contact. `);
    else { g(p, "foliage contact"); t(p, " "); }
    // Level 1: the set sentence. Level 2 and 3: the obstacles earn the rating ("Ruts and whoops earn this trail a level 2 rating.").
    const obstacles = vals(card, "obstacles").filter((o) => !NO_OBSTACLES.includes(o)).map((o) => OBSTACLE[o] || lower(o));
    const level = val(card, "level");
    if (!level) {
      if (obstacles.length) t(p, `Obstacles include ${listJoin(obstacles)}. `);
      g(p, "rating");
    } else if (RATING[level]) {
      if (obstacles.length) t(p, `Obstacles include ${listJoin(obstacles)}. `);
      t(p, RATING[level]);
    } else if (obstacles.length) {
      const list = listJoin(obstacles);
      const one = obstacles.length === 1 && (/^an? /.test(obstacles[0]) || !/s$/.test(obstacles[0]));   // "a creek crossing earns", "ruts earn"
      t(p, `${list[0].toUpperCase()}${list.slice(1)} ${one ? "earns" : "earn"} this trail a ${lower(level)} rating.`);
    } else {
      g(p, "obstacles");
      t(p, ` earn this trail a ${lower(level)} rating.`);
    }
    return paras;
  }

  const toText = (paras) => paras.map((p) => p.map((x) => (x.text != null ? x.text : `[${x.gap}]`)).join("").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n");
  const gaps = (paras) => paras.flat().filter((x) => x.gap).map((x) => x.gap);

  /** "forks north from forest road 14N08 through ..." -> "Forest Road 14N08" (a guess you can edit). */
  function startFromSpeech(text) {
    const m = String(text || "").match(/\b(?:forks|spurs|travels|heads|starts|goes|runs|branches|leaves)\b[^.]{0,30}?\bfrom\s+(?:the\s+)?(.{3,40}?)(?=\s+(?:through|and|at|it|then|with|heading|going)\b|[.,;!?]|$)/i);
    if (!m) return "";
    const s = m[1].trim();
    if (/^(pavement|highway|a fork|fork|here|there|the pavement)$/i.test(s)) return "";
    return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+[a-z]\d+)\b/gi, (x) => x.toUpperCase());
  }

  /** "...connects to ellis peak road." -> "Ellis Peak Road" (a guess you can edit). */
  function endsAtSpeech(text) {
    const m = String(text || "").match(/\b(?:connects (?:to|with)|tees into|junctions with|meets up with)\s+(?:the\s+)?(.{3,40}?)(?=\s+(?:and|where|it|then)\b|[.,;!?]|$)/i);
    if (!m) return "";
    const n = m[1].trim();
    if (!/\b(road|rd|trail|route|highway|hwy|path|way|fs|\d)/i.test(n)) return "";
    return n.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+[a-z]\d+)\b/gi, (x) => x.toUpperCase());
  }

  const api = { build, toText, gaps, startFromSpeech, endsAtSpeech };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.TN = root.TN || {}).summary = api;
})(typeof self !== "undefined" ? self : this);
