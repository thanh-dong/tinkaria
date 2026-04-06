import { useCallback, useEffect, useRef, useState } from "react"
import { estimateRenderItemHeight, type RenderItem } from "./messageHeights"
import { waitForFont } from "./fontReady"

export function useMessageHeights(
  renderItems: RenderItem[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const [fontReady, setFontReady] = useState(false)
  const [containerWidth, setContainerWidth] = useState(800)
  const renderItemsRef = useRef(renderItems)
  renderItemsRef.current = renderItems

  useEffect(() => {
    let mounted = true
    waitForFont().then((ready) => {
      if (mounted) setFontReady(ready)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const width = el.clientWidth
      if (width > 0) setContainerWidth(Math.min(width, 800))
    }

    const observer = new ResizeObserver(update)
    observer.observe(el)
    update()

    return () => observer.disconnect()
  }, [scrollRef])

  const estimateSize = useCallback(
    (index: number) => {
      const item = renderItemsRef.current[index]
      if (!item) return 80
      return estimateRenderItemHeight(item, containerWidth, fontReady)
    },
    [containerWidth, fontReady],
  )

  return { estimateSize }
}
