import type { PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useState } from 'react'

const DEFAULT_DRAWER_WIDTH = 760
const MIN_DRAWER_WIDTH = 680
const MAX_DRAWER_WIDTH = 1120
const DRAWER_WIDTH_KEY = 'plank:cardDrawerWidth'

function clampDrawerWidth(width: number) {
  return Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, width))
}

function getLocalStorage() {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function useCardDrawerLayout() {
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH)

  useEffect(() => {
    const storedWidth = getLocalStorage()?.getItem(DRAWER_WIDTH_KEY)
    const parsedWidth = storedWidth ? Number.parseInt(storedWidth, 10) : NaN
    if (Number.isFinite(parsedWidth)) {
      setDrawerWidth(clampDrawerWidth(parsedWidth))
    }
  }, [])

  useEffect(() => {
    getLocalStorage()?.setItem(DRAWER_WIDTH_KEY, String(drawerWidth))
  }, [drawerWidth])

  const startDrawerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = drawerWidth

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setDrawerWidth(
        clampDrawerWidth(startWidth - (moveEvent.clientX - startX)),
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
    drawerWidth,
    startDrawerResize,
  }
}
