// Build pipeline.
//
//   node scripts/build.mjs            dev build     -> build/  (readable, debug hooks on)
//   node scripts/build.mjs --watch    dev build, rebuilt when src/ changes
//   node scripts/build.mjs --release  release build -> dist/ + release/x-simplified-<version>.zip
//
// Sources live in src/ (page/, content/, styles/, manifest.json) and the popup in
// ui/. Nothing the browser loads is hand-written: load build/ (or dist/) unpacked.
//
// Release is minified, with comments and debug hooks (`__DEV__` blocks) removed.
// It is deliberately not obfuscated: the Chrome Web Store rejects obfuscated code,
// and it would slow the per-frame layout code.

import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import sharp from "sharp"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "src")
const uiDir = join(root, "ui")
const release = process.argv.includes("--release")
const watching = process.argv.includes("--watch")
const out = join(root, release ? "dist" : "build")

const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"))

async function scripts() {
  await build({
    entryPoints: { "page": join(src, "page/index.js"), "content": join(src, "content/index.js") },
    outdir: out,
    bundle: true,
    format: "iife",
    target: "chrome111",
    minify: release,
    legalComments: "none",
    define: { __DEV__: String(!release) },
    logLevel: "warning",
  })
  await build({
    entryPoints: { content: join(src, "styles/index.css") },
    outdir: out,
    bundle: true,
    minify: release,
    legalComments: "none",
    target: "chrome111",
    logLevel: "warning",
  })
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, release ? 0 : 2))
}

const POPUP_LOGO = 96
const ICON_SIZES = [16, 32, 48, 128]

// src/icons/icon.png is the single source; the sizes Chrome asks for are made here.
async function icons() {
  mkdirSync(join(uiDir, "src/assets"), { recursive: true })
  await sharp(join(src, "icons/icon.png")).resize(POPUP_LOGO, POPUP_LOGO, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(join(uiDir, "src/assets/logo.png"))
  mkdirSync(join(out, "icons"), { recursive: true })
  for (const s of ICON_SIZES) {
    await sharp(join(src, "icons/icon.png")).resize(s, s, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(join(out, "icons", `${s}.png`))
  }
}

function popup() {
  execSync("npm run build", { cwd: uiDir, stdio: "inherit" })
  rmSync(join(out, "popup"), { recursive: true, force: true })
  cpSync(join(uiDir, "out"), join(out, "popup"), { recursive: true })
}

function check() {
  const problems = []
  for (const f of ["page.js", "content.js", "content.css"]) {
    const text = readFileSync(join(out, f), "utf8")
    if (/\/\*|\/\/[^"'`\n]{0,80}$/m.test(text.replace(/https?:\/\/\S+/g, ""))) problems.push(`${f}: still contains a comment`)
    if (f === "page.js" && /__xs(Dbg|Saved|Err)/.test(text)) problems.push("page.js: debug hooks survived")
  }
  if (existsSync(join(out, "x.com_01-10-2026.json"))) problems.push("a cookie export is in dist")
  if (problems.length) {
    console.error("\nRELEASE CHECK FAILED:\n - " + problems.join("\n - "))
    process.exit(1)
  }
}

function zip() {
  const dir = join(root, "release")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `x-ultrawide-${manifest.version}.zip`)
  rmSync(file, { force: true })
  // Web Store zips need manifest.json at the archive root and forward-slash paths.
  // Windows' own bsdtar does that (PowerShell's Compress-Archive does not; a PATH `tar`
  // may be GNU tar, which cannot write zips), so call it by full path.
  if (process.platform === "win32") {
    const tar = join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe")
    execSync(`"${tar}" -a -c -f "${file}" ${readdirSync(out).join(" ")}`, { cwd: out })
  } else {
    execSync(`zip -qr "${file}" .`, { cwd: out })
  }
  return file
}

// empty the folder instead of removing it: Chrome or an editor may hold the folder open
for (const f of existsSync(out) ? readdirSync(out) : []) rmSync(join(out, f), { recursive: true, force: true })
mkdirSync(out, { recursive: true })
await scripts()
await icons()
popup()

const kb = (f) => (readFileSync(join(out, f)).length / 1024).toFixed(1) + " KB"
const sizes = `page.js ${kb("page.js")} | content.js ${kb("content.js")} | content.css ${kb("content.css")}`
if (release) {
  check()
  const file = zip()
  console.log(`\nRelease ready.\n  dist/     ${sizes}\n  release/  ${file.split(/[\/]/).pop()} (${(readFileSync(file).length / 1024).toFixed(0)} KB)`)
} else {
  console.log(`\nDev build ready in build/  (${sizes})`)
}

if (watching) {
  let timer
  watch(src, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(() => scripts().then(() => console.log("rebuilt")).catch((e) => console.error(e.message)), 80)
  })
  console.log("watching src/ …")
}
