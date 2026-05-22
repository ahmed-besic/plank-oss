/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './command-palette'

describe('CommandPalette', () => {
  it('runs the selected command without injecting fake context', () => {
    const run = vi.fn()

    render(
      <CommandPalette
        commands={[
          {
            id: 'core-kanban:create-card',
            label: 'Create card',
            run,
          },
        ]}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('Create card'))

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs the highlighted command with Enter', () => {
    const first = vi.fn()
    const second = vi.fn()

    render(
      <CommandPalette
        commands={[
          {
            id: 'first',
            label: 'First command',
            run: first,
          },
          {
            id: 'second',
            label: 'Second command',
            run: second,
          },
        ]}
        onClose={() => {}}
      />,
    )

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
