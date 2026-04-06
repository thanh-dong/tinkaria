let fontLoaded = false
let fontReadyPromise: Promise<boolean> | null = null

export function isFontReady(): boolean {
  return fontLoaded
}

export function waitForFont(): Promise<boolean> {
  if (fontLoaded) return Promise.resolve(true)
  if (fontReadyPromise) return fontReadyPromise

  fontReadyPromise = document.fonts.ready.then(() => {
    fontLoaded = document.fonts.check("14px Body")
    return fontLoaded
  })

  return fontReadyPromise
}
