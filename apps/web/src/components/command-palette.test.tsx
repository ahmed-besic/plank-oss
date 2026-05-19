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
})
