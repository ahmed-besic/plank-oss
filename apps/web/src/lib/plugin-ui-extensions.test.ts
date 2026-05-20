import { describe, expect, it } from 'vitest'
import { defineClientPlugin } from '@plank/plugin-sdk'
import { createClientPluginRegistry } from '@plank/plugin-runtime'
import { collectEnabledUiExtensions } from './plugin-ui-extensions'

describe('collectEnabledUiExtensions', () => {
  it('collects board header action fills for enabled plugins', () => {
    const plugin = defineClientPlugin(
      {
        id: 'board-actions',
        name: 'Board actions',
        version: '1.0.0',
        hooks: [],
        capabilities: ['boardViews:read'],
      },
      ({ registerUiExtension }) => {
        registerUiExtension({
          id: 'board-actions:header',
          slot: 'board.header.actions',
          label: 'Board action',
          requiredPermissions: ['boardViews:read'],
          render: () => null,
        })
      },
    )

    expect(
      collectEnabledUiExtensions({
        registry: createClientPluginRegistry([plugin]),
        enabledPluginIds: ['board-actions'],
        slot: 'board.header.actions',
      }).map((entry) => entry.extension.id),
    ).toEqual(['board-actions:header'])
  })
})
