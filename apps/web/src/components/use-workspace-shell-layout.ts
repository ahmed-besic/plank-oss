import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useState } from 'react'

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 420
const SIDEBAR_WIDTH_KEY = 'plank:sidebarWidth'
const SIDEBAR_HIDDEN_KEY = 'plank:sidebarHidden'

export function useWorkspaceShellLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [isSidebarHidden, setIsSidebarHidden] = useState(false)

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_KEY)
    const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : NaN
    if (Number.isFinite(parsedWidth)) {
      setSidebarWidth(
        Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsedWidth)),
      )
    }
    setIsSidebarHidden(window.localStorage.getItem(SIDEBAR_HIDDEN_KEY) === 'true')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_HIDDEN_KEY,
      isSidebarHidden ? 'true' : 'false',
    )
  }, [isSidebarHidden])

  const startSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(
        Math.min(
          MAX_SIDEBAR_WIDTH,
          Math.max(MIN_SIDEBAR_WIDTH, startWidth + moveEvent.clientX - startX),
        ),
      )
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return {
    isSidebarHidden,
    setIsSidebarHidden,
    sidebarWidth,
    startSidebarResize,
  }
}
