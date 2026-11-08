// Run this ONCE on your computer, before you put Trail Notes online:
//     node get-model.js
// It downloads the speech library and the speech model (about 100 MB) into this folder,
// so they install together with the app and speech-to-text works offline from the start.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const ROOT = __dirname;
const LIB = "@huggingface/transformers@3.8.1";
const MODEL = "Xenova/whisper-base.en";
const MODEL_FILES = [
  "config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx",
];

async function download(url, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  fs.writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  console.log(`  ${(fs.statSync(to).size / 1048576).toFixed(1).padStart(6)} MB  ${path.relative(ROOT, to)}`);
}

(async () => {
  const problems = [];
  const made = [];

  // 1. the speech library, from npm (its engine files come inside the package)
  console.log("1/2  Speech library…");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tn-lib-"));
  execSync(`npm pack ${LIB} --silent`, { cwd: tmp, stdio: "pipe" });
  const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  execSync(`tar -xzf "${tgz}"`, { cwd: tmp });
  const dist = path.join(tmp, "package", "dist");
  fs.mkdirSync(path.join(ROOT, "vendor"), { recursive: true });
  const want = fs.readdirSync(dist).filter((f) => f === "transformers.min.js" || /^ort-wasm.*\.(wasm|mjs)$/.test(f));
  if (!want.includes("transformers.min.js")) problems.push("transformers.min.js wasn't in the library package");
  for (const f of want) {
    fs.copyFileSync(path.join(dist, f), path.join(ROOT, "vendor", f));
    made.push(`vendor/${f}`);
    console.log(`  ${(fs.statSync(path.join(dist, f)).size / 1048576).toFixed(1).padStart(6)} MB  vendor/${f}`);
  }

  // 2. the speech model, from Hugging Face
  console.log("2/2  Speech model…");
  for (const f of MODEL_FILES) {
    try {
      const to = path.join(ROOT, "models", MODEL, f);
      await download(`https://huggingface.co/${MODEL}/resolve/main/${f}`, to);
      made.push(`models/${MODEL}/${f}`);
    } catch (e) {
      problems.push(String(e.message || e));
    }
  }

  // 3. the list the app uses to keep everything on the device
  fs.writeFileSync(path.join(ROOT, "vendor", "manifest.json"), JSON.stringify({ files: made }, null, 1));

  // GitHub refuses single files over 100 MB
  const big = made.filter((f) => fs.statSync(path.join(ROOT, f)).size > 95 * 1048576);
  if (big.length) problems.push(`These files are too big for GitHub (over 100 MB): ${big.join(", ")}`);

  console.log("");
  if (problems.length) {
    console.log("PROBLEMS:\n - " + problems.join("\n - "));
    console.log("\nSend me this message. The app still works (it falls back to downloading the speech model on first use).");
    process.exit(1);
  }
  console.log(`Done: ${made.length} files. Now upload the whole folder (including vendor and models) to GitHub.`);
})().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
