import { Resvg } from "@resvg/resvg-js"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const svg = readFileSync(resolve(ROOT, "public/favicon.svg"), "utf-8")

for (const size of [192, 512]) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } })
  const out = resolve(ROOT, `public/icon-${size}.png`)
  writeFileSync(out, resvg.render().asPng())
  console.log(`Generated ${out}`)
}
