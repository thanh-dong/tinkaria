import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { serve } from "bun"
import { EmbedRenderer } from "../src/client/components/rich-content/EmbedRenderer"

const source = `main.min-h-screen.bg-zinc-950.text-white.p-8
  section.mx-auto.max-w-xl.rounded-xl.border.border-white/10.bg-white/5.p-8.shadow-2xl
    p.text-xs.uppercase.tracking-[0.2em].text-emerald-300 Tinkaria Pug
    h1.mt-3.text-4xl.font-semibold Ship faster
    p.mt-3.text-zinc-300 Pug compiles into the HTML embed path, with Tailwind v4 available by default.
    .mt-6.flex.gap-3
      button.rounded-md.bg-emerald-400.px-4.py-2.font-medium.text-zinc-950 Launch
      button.rounded-md.border.border-white/15.px-4.py-2.text-white Ghost`

const markup = renderToStaticMarkup(
  <div style={{ padding: "24px", background: "#111827", minHeight: "100vh" }}>
    <EmbedRenderer format="pugjs" source={source} />
  </div>
)

const server = serve({
  port: 4187,
  fetch() {
    return new Response(`<!doctype html><html><body style="margin:0">${markup}</body></html>`, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  },
})

console.log(`http://127.0.0.1:${server.port}`)
setInterval(() => {}, 1000)
