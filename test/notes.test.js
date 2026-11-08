"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pickAnswers, findGrade, CRITERIA } = require("../js/criteria");
const P = require("../js/parse");
const { parseTrailList, normalizeDate } = P;

// ---------- reading a pasted list ----------

test("rows pasted from Google Sheets (tabs) become numbered trails in order", () => {
  const r = parseTrailList("#\tTrail Name\tDate\n11\tBarker Pass\t10/8/2026\n12\tRubicon\t10/8/2026\n13\tBlackwood Canyon\t\n");
  assert.deepEqual(r.trails, [
    { number: 11, name: "Barker Pass", date: "10-08-26" },
    { number: 12, name: "Rubicon", date: "10-08-26" },
    { number: 13, name: "Blackwood Canyon", date: "" },
  ]);
  assert.deepEqual(r.skipped, ["#\tTrail Name\tDate"]);
});

test("typed lines work too, with or without dates", () => {
  const r = parseTrailList("12 Rubicon 10/8/2026\n#13 - Blackwood Canyon\n14. Mud Lake, Oct 9, 2026\n9N10\nnot a trail");
  assert.deepEqual(r.trails, [
    { number: 12, name: "Rubicon", date: "10-08-26" },
    { number: 13, name: "Blackwood Canyon", date: "" },
    { number: 14, name: "Mud Lake", date: "10-09-26" },
  ]);
  assert.deepEqual(r.skipped, ["9N10", "not a trail"]);
});

test("duplicate numbers are reported, first one kept", () => {
  const r = parseTrailList("1 A\n1 B\n2 C");
  assert.deepEqual(r.trails.map((t) => t.name), ["A", "C"]);
  assert.deepEqual(r.duplicates, [1]);
});

test("normalizeDate handles the usual formats", () => {
  assert.equal(normalizeDate("10/8/2026"), "10-08-26");
  assert.equal(normalizeDate("2026-10-08"), "10-08-26");
  assert.equal(normalizeDate("10-08-26"), "10-08-26");
  assert.equal(normalizeDate("Sept 9 2026"), "09-09-26");
  assert.equal(normalizeDate("13/40/2026"), "");
  assert.equal(normalizeDate("Rubicon"), "");
});

// ---------- picking answers from what was said ----------

test("a real Google Keep note (9N11) lights up the right criteria", () => {
  const said = "This trail starts from pavement. It's a single track, gravel base and dirt but mostly gravel points to point. it follows drainage the entire time. trail ended early so I don't think it's long enough but we're gonna submit it because we mapped it anyway it ends with a disperse site and it's the only way to get to the next trail so maybe it'll count. It's a level one with 5% or less grade variation.";
  const a = pickAnswers(said);
  assert.equal(require("../js/criteria").pavedFromSpeech(said), "Paved");
  assert.equal(a.width.value, "Single track");
  assert.equal(a.type.value, "Point-to-point");
  assert.equal(a.level.value, "Level 1");
  assert.equal(a.grade.number, 5);
  assert.deepEqual(a.surface.values, ["Gravel", "Dirt"]); // two surfaces = mixed
});

test("another real note (10N98)", () => {
  const said = "Simple track out and back dirt goes through a Apache burnt forest some tree survived to send an elevation at about 5% grade pretty consistent road becomes a shelf road with minimal exposure trail transitions from Burt Forest back into Green Forest be quiet will the grade is 10 to 12% variation";
  const a = pickAnswers(said);
  assert.equal(a.type.value, "Out-and-back");
  assert.equal(a.surface.value, "Dirt");
  assert.equal(a.exposure, undefined); // exposure was removed
  assert.equal(a.grade.number, 12); // highest grade mentioned
  assert.equal(a.forest.status, "unclear"); // burnt and green both mentioned
});

test("criteria that never come up stay out (grey light)", () => {
  const a = pickAnswers("it's a loop");
  assert.deepEqual(Object.keys(a), ["type"]);
  assert.deepEqual(pickAnswers(""), {});
});

test("the longest phrase wins: 'no brush rub' is None, not a conflict", () => {
  assert.equal(pickAnswers("there is no brush rub at all").brush.value, "None");
  assert.equal(pickAnswers("heavy brush rub").brush.value, "Heavy");
});

test("obstacles can be several at once", () => {
  const a = pickAnswers("there's a down tree and then a creek crossing");
  assert.deepEqual(a.obstacles.values, ["Water crossing", "Log crossing"]);
});

test("grades in words or numbers", () => {
  assert.equal(findGrade("about ten percent grade").value, "10–15%");
  assert.equal(findGrade("8 to 10% grade").value, "10–15%");
  assert.equal(findGrade("15 to 20% grade climb").value, "15%+");
  assert.equal(findGrade("a 7 percent grade").value, "5–10%");
  assert.equal(findGrade("no grade info"), null);
});

test("every criterion has a label, a question and options", () => {
  assert.equal(CRITERIA.length, 12);
  for (const c of CRITERIA) {
    assert.ok(c.id && c.label && c.question && (c.slider || c.options.length >= 2), c.id);
  }
});

// ---------- importing from a sheet link ----------

const { sheetFromLink, csvUrl, parseCSV, rowsToTrails } = require("../js/parse");

test("sheet links: id and tab", () => {
  assert.deepEqual(sheetFromLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42"), { id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", gid: "42" });
  assert.deepEqual(sheetFromLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit"), { id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", gid: "" });
  assert.equal(sheetFromLink("https://example.com/nope"), null);
  assert.equal(csvUrl({ id: "abc", gid: "" }), "https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv");
  assert.equal(csvUrl({ id: "abc", gid: "7" }), "https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv&gid=7");
});

test("CSV with quotes, commas and blank cells", () => {
  assert.deepEqual(parseCSV('"#","Trail Name","Date"\n"1","Rubicon, upper","10/8/2026"\n"2","Say ""hi""",""\n'), [
    ["#", "Trail Name", "Date"], ["1", "Rubicon, upper", "10/8/2026"], ["2", 'Say "hi"', ""],
  ]);
});

test("sheet rows: finds the header, keeps every numbered trail (dated or not)", () => {
  const rows = parseCSV('"Trail Tracker","","",""\n"Area","Tahoe","",""\n"#","Trail Name","Status","Date"\n"1","Barker Pass","Tracked","10/8/2026"\n"2","Rubicon","Planned",""\n"","","",""\n"3","Mud Lake","Planned",""');
  const r = rowsToTrails(rows);
  assert.deepEqual(r.trails, [
    { number: 1, name: "Barker Pass", date: "10-08-26" },
    { number: 2, name: "Rubicon", date: "" },
    { number: 3, name: "Mud Lake", date: "" },
  ]);
});

test("sheet rows without a header are read like pasted lines", () => {
  const r = rowsToTrails([["11", "Barker Pass", "10/8/2026"], ["12", "Rubicon", ""]]);
  assert.deepEqual(r.trails.map((t) => t.number), [11, 12]);
});

test("area name comes from the template's Area box", () => {
  const rows = [["Trail Tracker", "", "", ""], ["Area", "OR - Mt Hood", "", "", "", "", "Totals"], ["", ""], ["#", "Trail Name", "Status", "Date"], ["1", "Lolo Pass", "Planned", ""]];
  assert.equal(P.areaFromRows(rows), "OR - Mt Hood");
  assert.equal(P.areaFromRows([["#", "Trail Name"], ["1", "Area 51 Road"]]), "");
  assert.equal(P.areaFromRows([["Trail #", "Trail Name", "Date Completed", "Status", "", "Area / Region:", "Tahoe"]]), "Tahoe");
});

test("summary: built from answers, gaps where something's missing", () => {
  const S = require("../js/summary");
  const said = "It forks north from forest road 14n08 through a burn scar. Gravel and dirt double track, crosses gulches and hillsides at about a 12% grade. Climbs and then descends. Out and back, ends where official development halted. Heavy brush, a couple down trees. Level one.";
  const card = { name: "Rubicon Trail", areaText: "flourishing forest", answers: pickAnswers(said), startFrom: S.startFromSpeech(said), pois: [{ type: "Hiking trail", note: "Ellis Peak" }] };
  const text = S.toText(S.build(card));
  assert.match(text, /^Rubicon Trail (forks|travels|runs|branches off|wanders) north from Forest Road 14N08 through the flourishing forest\. The forest is fire-scarred\. It runs as a mixed gravel\/dirt double track trail and crosses hillsides and gulches\. It both gains and loses elevation at a 12% grade variation\./);
  assert.match(text, /As an out-and-back trail, it ends where official development halted and provides a turn-around location\. This trail provides access to Ellis Peak hiking trail\./);
  assert.match(text, /This trail has heavy foliage contact\. Obstacles include a log crossing\. This trail is a level 1 rating and is suitable for all vehicles\.$/);
  assert.deepEqual(S.gaps(S.build(card)), []);
  const bare = S.build({ name: "Barker Pass", answers: pickAnswers("point to point gravel single track") });
  assert.deepEqual(S.gaps(bare), ["direction", "road or trail it starts from", "area description", "forest type", "elevation change", "grade", "foliage contact", "rating"]);
  assert.match(S.toText(bare), /As a point-to-point trail, it provides access to alternative routes along its path\./);
});

test("starts-from guess ignores generic words", () => {
  const S = require("../js/summary");
  assert.equal(S.startFromSpeech("it starts from pavement and heads east"), "");
  assert.equal(S.startFromSpeech("spurs east from the rubicon trail at the lake"), "Rubicon Trail");
});

test("summary: level 2 and 3 are earned by the obstacles", () => {
  const S = require("../js/summary");
  const last = (said) => S.toText(S.build({ name: "X", answers: pickAnswers(said) })).split("\n\n").pop();
  assert.match(last("Level two. Lots of ruts and whoops."), /Ruts and whoops earn this trail a level 2 rating\.$/);
  assert.match(last("level 3, deep ruts"), /Ruts earn this trail a level 3 rating\.$/);
  assert.match(last("level 3 with a creek crossing"), /A water crossing earns this trail a level 3 rating\.$/);
  assert.match(last("level 2, deep sand and low clearance"), /Low overhead clearance and sand earn this trail a level 2 rating\.$/);
  assert.match(last("level 2, no significant obstacles"), /\[obstacles\] earn this trail a level 2 rating\.$/);
  assert.match(last("level two"), /\[obstacles\] earn this trail a level 2 rating\.$/);
  assert.match(last("level one, no brush"), /This trail is a level 1 rating and is suitable for all vehicles\.$/);
});

test("summary: POIs from the + button go into sentences", () => {
  const S = require("../js/summary");
  const text = S.toText(S.build({ name: "X", answers: pickAnswers("point to point"), pois: [
    { type: "Creek crossing", note: "Pine Creek" }, { type: "Lake or river", note: "Loon Lake" }, { type: "Viewpoint" }, { type: "Hot spring" },
    { type: "Hiking trail", note: "Ellis Peak" }, { type: "Developed campground" }, { type: "Water source" }, { type: "Road closure barrier" } ] }));
  assert.match(text, /Along the way it crosses Pine Creek and passes Loon Lake, a viewpoint, and a hot spring\./);
  assert.match(text, /This trail provides access to Ellis Peak hiking trail, a developed campground, and a water source\./);
  assert.match(text, /Boulders or logs across the road mark a closure\./);
});

test("summary: spur only when the trail name ends in a letter", () => {
  const S = require("../js/summary");
  const verb = (name) => S.toText(S.build({ name, answers: {} })).slice(name.length + 1).split(" [")[0];
  assert.equal(verb("96N98A"), "spurs");
  assert.notEqual(verb("96N98"), "spurs");
  const verbs = new Set(["96N98", "9N11", "10N98", "FR 14", "Barker Pass", "Rubicon"].map(verb));
  assert.ok(verbs.size > 1); // not all the same word
});

test("summary: both gaining and losing, multiple endings with a named path", () => {
  const S = require("../js/summary");
  const card = { name: "9N11", startFrom: "Barker Pass Road", endsAt: "Ellis Peak Road",
    answers: { type: { status: "answered", value: "Out-and-back" }, elevation: { status: "answered", values: ["Gains elevation", "Loses elevation"] },
      grade: { status: "answered", value: "12%", number: 12 }, ends: { status: "answered", values: ["Connects to another path", "Downed tree"] } } };
  const text = S.toText(S.build(card));
  assert.match(text, /It both gains and loses elevation at a 12% grade variation\./);
  assert.match(text, /it ends at its junction with Ellis Peak Road \[paved or unpaved\] and at a downed tree and provides a turn-around/);
  assert.equal(S.endsAtSpeech("it connects to ellis peak road and then ends"), "Ellis Peak Road");
});

test("summary: ends on a paved path, and a note for the data curating team goes last", () => {
  const S = require("../js/summary");
  const card = { name: "9N14", startFrom: "Hwy-88", areaText: "flourishing fir", endsAt: "10N50", endsPaved: "Paved",
    curatorOn: true, curatorNote: "GPX files need stitching",
    answers: { type: { status: "answered", value: "Point-to-point" }, ends: { status: "answered", values: ["Connects to another path"] } } };
  const text = S.toText(S.build(card));
  assert.match(text, /ends at the paved 10N50 junction/);
  assert.ok(text.endsWith("*GPX files need stitching"), text.slice(-60));
  const paras = S.build(card);
  assert.ok(paras.flat().some((x) => x.curator));
  // off: nothing added
  assert.ok(!S.toText(S.build({ ...card, curatorOn: false })).includes("GPX"));
});

// ---------- length and time ----------

test("length and time are read from typed or spoken text", () => {
  const f = P.parseLengthTime;
  assert.deepEqual(f("2.4 miles, 1 hour 30 minutes"), { miles: 2.4, hours: 1.5 });
  assert.deepEqual(f("two point four miles and an hour and a half"), { miles: 2.4, hours: 1.5 });
  assert.deepEqual(f("3 miles 45 minutes"), { miles: 3, hours: 0.75 });
  assert.deepEqual(f("five miles, one hour fifteen minutes"), { miles: 5, hours: 1.25 });
  assert.deepEqual(f("about 12 miles took two hours"), { miles: 12, hours: 2 });
  assert.deepEqual(f("hello"), { miles: null, hours: null });
});

test("miles and time are read separately", () => {
  assert.equal(P.parseMiles("2.4 miles"), 2.4);
  assert.equal(P.parseMiles("two point four"), 2.4);
  assert.equal(P.parseMiles("abc"), null);
  assert.equal(P.parseHours("1:30"), 1.5);
  assert.equal(P.parseHours("90 min"), 1.5);
  assert.equal(P.parseHours("an hour and a half"), 1.5);
  assert.equal(P.parseHours("2"), 2);
});

test("a tree to drive over counts as a log crossing", () => {
  const r = pickAnswers("it has a big tree to drive over");
  assert.equal(r.obstacles.status, "answered");
  assert.deepEqual(r.obstacles.values, ["Log crossing"]);
});

test("Nov 8 speech: direction, brush rub, difficulty, point to point, connects", () => {
  const a = pickAnswers("This fork south, it goes on dirt and gravel mixed. It does have brush rub. Difficulty is a one. It's a points of point, so it ends connecting to another trail.");
  assert.equal(a.heads.value, "South");
  assert.equal(a.brush.status, "unclear");
  assert.deepEqual(a.brush.options, ["Slight", "Moderate", "Heavy"]);
  assert.equal(a.level.value, "Level 1");
  assert.equal(a.type.value, "Point-to-point");
  assert.ok(a.ends.values.includes("Connects to another path"));
  assert.equal(pickAnswers("difficulty is a ten").level.value, "Level 10");
  assert.equal(pickAnswers("no brush rub at all").brush.value, "None");
  assert.equal(pickAnswers("this fork southeast").heads.value, "Southeast");
});

test("exact Nov 8 sentence, with hyphenated points-of-point", () => {
  const a = pickAnswers("This fork south that goes on dirt and gravel mixed, it goes over ridges, it crosses creeks, it only loses elevation, it does have brush rub, difficulty is a one, it's a double track, it's got a 5% grade, it's a points-of-point, it ends connecting to another trail and its obstacle is ruts and whoops.");
  assert.equal(a.heads.value, "South");
  assert.equal(a.level.value, "Level 1");
  assert.equal(a.type.value, "Point-to-point");
  assert.ok(a.ends.values.includes("Connects to another path"));
  assert.equal(a.brush.status, "unclear");
  assert.equal(pickAnswers("it's out-and-back").type.value, "Out-and-back");
  assert.equal(findGrade("8-10 percent grade").heard, 10);
});
