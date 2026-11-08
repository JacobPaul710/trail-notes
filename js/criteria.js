"use strict";
// The trail criteria (draft from the Google Keep notes; Jacob will finalize), and the
// engine that reads what was said and picks answers. Browser (window.TN.criteria) and Node.
(function (root) {
  // Each option lists phrases that mean it. Phrases are matched as whole words, lower case.
  // In the order the summary reads (and the checklist shows). Jacob's lists, Nov 7.
  //   multi    more than one can be picked
  //   slider   a number on a sliding scale (the grade)
  //   field    a typed name that goes with the answer (road it starts from, path it connects to)
  // Where it starts is no longer a question: the road name is typed and paved/unpaved is a tap (see the card).
  const PAVED_SAYS = ["starts from pavement", "starts off pavement", "from the pavement", "off the pavement", "off pavement", "from pavement", "paved road", "from the highway", "off the highway", "from a highway", "off a highway"];
  const UNPAVED_SAYS = ["unpaved", "from a dirt road", "off a dirt road", "from a gravel road", "off a gravel road", "from forest road", "off forest road", "from a forest road", "off a forest road"];
  /** "...starts off the pavement..." -> "Paved"; "unpaved" -> "Unpaved"; otherwise "" (you tap it). */
  function pavedFromSpeech(text) {
    const t = String(text || "").toLowerCase();
    if (UNPAVED_SAYS.some((x) => t.includes(x))) return "Unpaved";
    if (PAVED_SAYS.some((x) => t.includes(x))) return "Paved";
    return "";
  }

  const CRITERIA = [
    {
      id: "heads", label: "Direction", question: "Which way does it head?",
      options: ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"].map((d) => ({
        value: d[0].toUpperCase() + d.slice(1),
        says: [`heads ${d}`, `head ${d}`, `headed ${d}`, `travels ${d}`, `goes ${d}`, `going ${d}`, `runs ${d}`, `running ${d}`, `${d}bound`, `${d}-bound`, `forks ${d}`, `fork ${d}`, `spurs ${d}`, `spur ${d}`, `branches ${d}`, `branch ${d}`, `heading ${d}`, `trends ${d}`, `tends ${d}`, `${d} from`, `${d} fork`, `${d} spur`, `${d} direction`, `direction is ${d}`, `direction of travel is ${d}`],
      })),
    },
    {
      id: "forest", label: "Forest", question: "What's the forest like?",
      options: [
        { value: "Green", says: ["green forest", "healthy forest", "lush", "all green"] },
        { value: "Fire-scarred", says: ["fire scarred", "fire-scarred", "fire scar", "burn scar", "burnt", "burned", "burn area"] },
        { value: "Mosaic", says: ["mosaic", "mixed forest", "patchy", "patches of burn", "part burned", "partly burned"] },
      ],
    },
    {
      id: "surface", label: "Surface", question: "What's the surface? (more than one is fine)", multi: true,
      options: [
        { value: "Gravel", says: ["gravel"] },
        { value: "Dirt", says: ["dirt"] },
        { value: "Paved", says: ["paved surface", "asphalt", "pavement the whole way", "paved the whole way", "it's paved", "its paved"] },
        { value: "Grass", says: ["grass", "grassy"] },
        { value: "Mud", says: ["mud surface", "muddy", "mostly mud"] },
        { value: "Rock", says: ["rock surface", "rocky", "mostly rock", "rock road"] },
        { value: "Sand", says: ["sand surface", "sandy", "mostly sand"] },
        { value: "Slick-rock", says: ["slick rock", "slickrock", "slick-rock"] },
      ],
    },
    {
      id: "width", label: "Width", question: "Single track or double track?",
      options: [
        { value: "Single track", says: ["single track", "single-track", "one lane", "single lane"] },
        { value: "Double track", says: ["double track", "double-track", "two lane", "two track"] },
      ],
    },
    {
      id: "crosses", label: "Landscape", question: "What landscape does it cross?", multi: true,
      options: [
        { value: "Hillsides", says: ["hillside", "hillsides", "side hill", "sidehill"] },
        { value: "Ridges", says: ["ridge", "ridges", "ridgeline", "ridgelines", "ridge line"] },
        { value: "Canyons", says: ["canyon", "canyons"] },
        { value: "Gulches", says: ["gulch", "gulches", "ravine", "drainage", "drainages"] },
        { value: "Creeks", says: ["creek", "creeks", "stream", "streams"] },
      ],
    },
    {
      id: "grade", label: "Grade", question: "What's the grade? Slide to set it.", slider: { min: 5, max: 40, unit: "%" },
      options: [],
    },
    {
      id: "elevation", label: "Elevation change", question: "Does it gain elevation, lose it, or stay mostly flat? (pick both if it does both)", multi: true,
      options: [
        { value: "Gains elevation", says: ["gains elevation", "climbs", "climb", "climbing", "uphill", "ascends", "gains"] },
        { value: "Loses elevation", says: ["loses elevation", "descends", "descend", "descending", "downhill", "drops down", "loses"] },
        { value: "Mostly flat", says: ["mostly flat", "flat", "level grade", "no elevation change"] },
      ],
    },
    {
      id: "type", label: "Trail type", question: "What kind of trail is it?",
      options: [
        { value: "Out-and-back", says: ["out and back", "out-and-back", "dead end", "dead ends", "turn around and come back"] },
        { value: "Point-to-point", says: ["point to point", "point-to-point", "points to point", "point of point", "points of point", "point of points", "points of points", "point to points", "points to points", "point a point", "point 2 point", "point two point", "p2p", "goes through to"] },
        { value: "Loop", says: ["loop", "loops back", "comes back around"] },
      ],
    },
    {
      id: "brush", label: "Brush rub", question: "How much brush rub or foliage contact?",
      options: [
        { value: "None", says: ["no brush", "no brush rub", "no rub", "no foliage", "no foliage contact", "no pinstriping"] },
        { value: "Slight", says: ["slight brush", "slight rub", "light brush", "a little brush", "minimal brush", "slight foliage"] },
        { value: "Moderate", says: ["moderate brush", "moderate rub", "some brush", "moderate foliage"] },
        { value: "Heavy", says: ["heavy brush", "heavy rub", "lots of brush", "a lot of brush", "tight brush", "heavy foliage"] },
      ],
    },
    {
      id: "obstacles", label: "Obstacles", question: "Any obstacles?", multi: true,
      options: [
        { value: "No significant obstacles", says: ["no significant obstacles", "no obstacles", "no real obstacles"] },
        { value: "Ruts", says: ["ruts", "rutted", "rutty", "deep ruts"] },
        { value: "Whoops", says: ["whoops", "whoop", "whoop-dee-doos", "whoop de doos"] },
        { value: "Overgrown vegetation", says: ["overgrown vegetation", "overgrown", "overgrowth on the trail"] },
        { value: "Off-camber", says: ["off camber", "off-camber", "offcamber"] },
        { value: "Shelf road", says: ["shelf road", "shelf"] },
        { value: "Low overhead clearance", says: ["low overhead clearance", "low clearance", "low branches", "overhead clearance"] },
        { value: "Sand", says: ["sand", "sandy section", "deep sand"] },
        { value: "Mud hole", says: ["mud hole", "mud holes", "mudhole", "mud pit"] },
        { value: "Rock obstacle", says: ["rock obstacle", "rock obstacles", "big rock", "big rocks", "boulder"] },
        { value: "Ledge", says: ["ledge", "ledges", "rock ledge", "step up", "step down"] },
        { value: "Rock garden", says: ["rock garden", "rock gardens"] },
        { value: "Narrow trail", says: ["narrow trail", "narrow", "tight trail"] },
        { value: "Switchbacks", says: ["switchbacks", "switchback", "switch backs"] },
        { value: "Water crossing", says: ["water crossing", "water crossings", "creek crossing", "stream crossing", "crosses a creek", "crosses the creek"] },
        { value: "Silt bed", says: ["silt bed", "silt beds", "silt"] },
        { value: "Tight trees", says: ["tight trees", "tight squeeze between trees", "trees are tight"] },
        { value: "Wash", says: ["wash", "washes", "dry wash", "washout", "washed out"] },
        { value: "Log crossing", says: ["log crossing", "log across", "logs across", "down tree", "downed tree", "fallen tree", "down trees", "tree to drive over", "tree to go over", "tree to cross", "tree to climb over", "tree across", "tree over the trail", "tree over the road", "tree in the road", "tree in the trail", "tree on the road", "tree on the trail", "log to drive over", "log", "logs", "fallen logs"] },
      ],
    },
    {
      id: "level", label: "Difficulty level", question: "What level is it (1 to 10)?",
      options: [
        { value: "Level 1", says: ["level one", "level 1", "difficulty one", "difficulty 1", "difficulty is one", "difficulty is 1", "difficulty is a one", "difficulty is a 1", "difficulty of one", "difficulty of 1", "difficulty level one", "difficulty level 1", "difficulty level is one", "difficulty level is 1", "difficulty level is a one", "difficulty level is a 1", "difficulty level of one", "difficulty level of 1", "level is one", "level is 1", "level is a one", "level is a 1", "level of one", "level of 1", "rated one", "rated 1", "its a level one", "its a level 1", "difficulty rating is one", "difficulty rating is 1", "difficulty rating one", "difficulty rating 1"] },
        { value: "Level 2", says: ["level two", "level 2", "difficulty two", "difficulty 2", "difficulty is two", "difficulty is 2", "difficulty is a two", "difficulty is a 2", "difficulty of two", "difficulty of 2", "difficulty level two", "difficulty level 2", "difficulty level is two", "difficulty level is 2", "difficulty level is a two", "difficulty level is a 2", "difficulty level of two", "difficulty level of 2", "level is two", "level is 2", "level is a two", "level is a 2", "level of two", "level of 2", "rated two", "rated 2", "its a level two", "its a level 2", "difficulty rating is two", "difficulty rating is 2", "difficulty rating two", "difficulty rating 2"] },
        { value: "Level 3", says: ["level three", "level 3", "difficulty three", "difficulty 3", "difficulty is three", "difficulty is 3", "difficulty is a three", "difficulty is a 3", "difficulty of three", "difficulty of 3", "difficulty level three", "difficulty level 3", "difficulty level is three", "difficulty level is 3", "difficulty level is a three", "difficulty level is a 3", "difficulty level of three", "difficulty level of 3", "level is three", "level is 3", "level is a three", "level is a 3", "level of three", "level of 3", "rated three", "rated 3", "its a level three", "its a level 3", "difficulty rating is three", "difficulty rating is 3", "difficulty rating three", "difficulty rating 3"] },
        { value: "Level 4", says: ["level four", "level 4", "difficulty four", "difficulty 4", "difficulty is four", "difficulty is 4", "difficulty is a four", "difficulty is a 4", "difficulty of four", "difficulty of 4", "difficulty level four", "difficulty level 4", "difficulty level is four", "difficulty level is 4", "difficulty level is a four", "difficulty level is a 4", "difficulty level of four", "difficulty level of 4", "level is four", "level is 4", "level is a four", "level is a 4", "level of four", "level of 4", "rated four", "rated 4", "its a level four", "its a level 4", "difficulty rating is four", "difficulty rating is 4", "difficulty rating four", "difficulty rating 4"] },
        { value: "Level 5", says: ["level five", "level 5", "difficulty five", "difficulty 5", "difficulty is five", "difficulty is 5", "difficulty is a five", "difficulty is a 5", "difficulty of five", "difficulty of 5", "difficulty level five", "difficulty level 5", "difficulty level is five", "difficulty level is 5", "difficulty level is a five", "difficulty level is a 5", "difficulty level of five", "difficulty level of 5", "level is five", "level is 5", "level is a five", "level is a 5", "level of five", "level of 5", "rated five", "rated 5", "its a level five", "its a level 5", "difficulty rating is five", "difficulty rating is 5", "difficulty rating five", "difficulty rating 5"] },
        { value: "Level 6", says: ["level six", "level 6", "difficulty six", "difficulty 6", "difficulty is six", "difficulty is 6", "difficulty is a six", "difficulty is a 6", "difficulty of six", "difficulty of 6", "difficulty level six", "difficulty level 6", "difficulty level is six", "difficulty level is 6", "difficulty level is a six", "difficulty level is a 6", "difficulty level of six", "difficulty level of 6", "level is six", "level is 6", "level is a six", "level is a 6", "level of six", "level of 6", "rated six", "rated 6", "its a level six", "its a level 6", "difficulty rating is six", "difficulty rating is 6", "difficulty rating six", "difficulty rating 6"] },
        { value: "Level 7", says: ["level seven", "level 7", "difficulty seven", "difficulty 7", "difficulty is seven", "difficulty is 7", "difficulty is a seven", "difficulty is a 7", "difficulty of seven", "difficulty of 7", "difficulty level seven", "difficulty level 7", "difficulty level is seven", "difficulty level is 7", "difficulty level is a seven", "difficulty level is a 7", "difficulty level of seven", "difficulty level of 7", "level is seven", "level is 7", "level is a seven", "level is a 7", "level of seven", "level of 7", "rated seven", "rated 7", "its a level seven", "its a level 7", "difficulty rating is seven", "difficulty rating is 7", "difficulty rating seven", "difficulty rating 7"] },
        { value: "Level 8", says: ["level eight", "level 8", "difficulty eight", "difficulty 8", "difficulty is eight", "difficulty is 8", "difficulty is a eight", "difficulty is a 8", "difficulty of eight", "difficulty of 8", "difficulty level eight", "difficulty level 8", "difficulty level is eight", "difficulty level is 8", "difficulty level is a eight", "difficulty level is a 8", "difficulty level of eight", "difficulty level of 8", "level is eight", "level is 8", "level is a eight", "level is a 8", "level of eight", "level of 8", "rated eight", "rated 8", "its a level eight", "its a level 8", "difficulty rating is eight", "difficulty rating is 8", "difficulty rating eight", "difficulty rating 8"] },
        { value: "Level 9", says: ["level nine", "level 9", "difficulty nine", "difficulty 9", "difficulty is nine", "difficulty is 9", "difficulty is a nine", "difficulty is a 9", "difficulty of nine", "difficulty of 9", "difficulty level nine", "difficulty level 9", "difficulty level is nine", "difficulty level is 9", "difficulty level is a nine", "difficulty level is a 9", "difficulty level of nine", "difficulty level of 9", "level is nine", "level is 9", "level is a nine", "level is a 9", "level of nine", "level of 9", "rated nine", "rated 9", "its a level nine", "its a level 9", "difficulty rating is nine", "difficulty rating is 9", "difficulty rating nine", "difficulty rating 9"] },
        { value: "Level 10", says: ["level ten", "level 10", "difficulty ten", "difficulty 10", "difficulty is ten", "difficulty is 10", "difficulty is a ten", "difficulty is a 10", "difficulty of ten", "difficulty of 10", "difficulty level ten", "difficulty level 10", "difficulty level is ten", "difficulty level is 10", "difficulty level is a ten", "difficulty level is a 10", "difficulty level of ten", "difficulty level of 10", "level is ten", "level is 10", "level is a ten", "level is a 10", "level of ten", "level of 10", "rated ten", "rated 10", "its a level ten", "its a level 10", "difficulty rating is ten", "difficulty rating is 10", "difficulty rating ten", "difficulty rating 10"] }
      ],
    },
    {
      id: "ends", label: "How it ends", question: "How does the trail end? (more than one is fine)", multi: true,
      field: { key: "endsAt", label: "Name of the path it connects to", placeholder: "e.g. Ellis Peak Road", when: "Connects to another path" },
      options: [
        { value: "Connects to another path", says: ["connects to", "connects with", "meets another road", "joins another road", "tees into", "junctions with", "junction with", "meets up with", "connecting to", "connecting with", "connecting up", "connect to", "connected to", "connects up with", "ends at another trail", "ends at another road", "ends at another path", "ends on another", "ends at a road", "ends at a trail", "ends at a junction"] },
        { value: "Turnaround", says: ["turnaround", "turn around spot", "turn-around"] },
        { value: "Downed tree", says: ["ends at a downed tree", "ends at a down tree", "ends at a fallen tree", "blocked by a tree", "tree blocks", "stopped by a downed tree"] },
        { value: "Overgrowth", says: ["ends in overgrowth", "too overgrown", "grown over", "overgrowth stops"] },
        { value: "Dispersed campsite", says: ["dispersed campsite", "dispersed site", "dispersed camp", "disperse site", "disperse campsite"] },
        { value: "Gate or property", says: ["gate", "private property", "property line", "no trespassing"] },
        { value: "Campground", says: ["ends at a campground", "ends at the campground"] },
        { value: "End of official development", says: ["end of official development", "official development", "development ends", "development stops", "development halted", "end of the official trail", "end of official trail"] },
      ],
    },
  ];

  // lower case, apostrophes dropped, punctuation to spaces (a "." stays only inside a number like 7.5)
  const norm = (s) =>
    " " +
    String(s || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/(?<=[a-z])-(?=[a-z])/g, " ")   // "points-of-point" reads like "points of point"
      .replace(/[^a-z0-9%.\- ]+/g, " ")
      .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
      .replace(/\s+/g, " ")
      .trim() +
    " ";

  const WORD_NUMBERS = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, "twenty five": 25, thirty: 30, three: 3, four: 4, two: 2, one: 1 };

  /** Grade percents mentioned: "10% grade", "8 to 10 percent", "ten percent grade" -> the highest one. */
  function findGrade(text) {
    let t = norm(text);
    for (const [w, n] of Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length)) {
      t = t.replace(new RegExp(` ${w}(?= )`, "g"), ` ${n}`);
    }
    const nums = [];
    const re = /(\d{1,2})(?:\s*(?:to|-|or)\s*(\d{1,2}))?\s*(?:%|percent|per cent)/g;
    let m;
    while ((m = re.exec(t))) {
      nums.push(+m[1]);
      if (m[2]) nums.push(+m[2]);
    }
    if (/less than 5 ?(%|percent)|under 5 ?(%|percent)|5 ?(%|percent) or less/.test(t)) return { value: "Under 5%", heard: Math.min(...(nums.length ? nums : [5])) };
    if (!nums.length) return null;
    const top = Math.max(...nums);
    const value = top < 5 ? "Under 5%" : top < 10 ? "5–10%" : top < 15 ? "10–15%" : "15%+";
    return { value, heard: top };
  }

  /**
   * Read what was said and pick answers.
   * Returns { [criterionId]: { status: "answered" | "unclear", value, values?, heard } }.
   *   answered  exactly one option (or, for multi, a clear set) was mentioned
   *   unclear   it came up, but two options conflict: the light goes yellow
   * Criteria that never came up are left out (their light stays grey).
   */
  function pickAnswers(text) {
    const t = norm(text);
    const out = {};
    for (const c of CRITERIA) {
      if (c.id === "grade") {
        const g = findGrade(text);
        if (g) {
          const n = Math.max(5, Math.min(40, g.heard));
          out.grade = { status: "answered", value: `${n}%`, number: n, heard: `${g.heard}%` };
        }
        continue;
      }
      const hits = [];
      for (const o of c.options) {
        const found = o.says.find((p) => t.includes(norm(p))); // whole words: both sides padded with spaces
        if (found) hits.push({ value: o.value, heard: found });
      }
      if (!hits.length) {
        // "it does have brush rub": it came up, but no level was said -> yellow, pick Slight/Moderate/Heavy
        if (c.id === "brush" && /\b(brush|foliage|pinstripe|pinstriping|pin striping)\b/.test(t)) {
          out.brush = { status: "unclear", value: "", heard: "brush rub", options: ["Slight", "Moderate", "Heavy"] };
        }
        continue;
      }
      // "no brush rub" also contains "brush rub"-style words for other options: prefer the longest phrase.
      if (c.multi) {
        const values = hits.map((h) => h.value).filter((v) => !((v === "None" || v === "No significant obstacles" || v === "Mostly flat") && hits.length > 1));
        out[c.id] = { status: "answered", value: values.join(", "), values, heard: hits.map((h) => h.heard).join(", ") };
      } else if (hits.length === 1) {
        out[c.id] = { status: "answered", value: hits[0].value, heard: hits[0].heard };
      } else {
        hits.sort((a, b) => b.heard.length - a.heard.length);
        const longest = hits[0];
        const coveredByLongest = hits.slice(1).every((h) => longest.heard.includes(h.heard));
        out[c.id] = coveredByLongest
          ? { status: "answered", value: longest.value, heard: longest.heard }
          : { status: "unclear", value: "", heard: hits.map((h) => h.heard).join(" / "), options: hits.map((h) => h.value) };
      }
    }
    return out;
  }

  const api = { CRITERIA, pickAnswers, findGrade, pavedFromSpeech };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.TN = root.TN || {}).criteria = api;
})(typeof self !== "undefined" ? self : this);
