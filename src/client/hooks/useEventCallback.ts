import { useCallback, useLayoutEffect, useRef } from "react"

export function useEventCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback)

  useLayoutEffect(() => {
    callbackRef.current = callback
  })

  return useCallback((...args: TArgs) => callbackRef.current(...args), [])
}
