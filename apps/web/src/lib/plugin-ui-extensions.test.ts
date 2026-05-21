import { describe, expect, it } from 'vitest'
import { defineClientPlugin } from '@plank/plugin-sdk'
import { createClientPluginRegistry } from '@plank/plugin-runtime'
import {
  collectEnabledUiExtensions,
  collectEnabledUiExtensionsForSlots,
} from './plugin-ui-extensions'

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

  it('collects multiple card surface slots in requested slot order', () => {
    const plugin = defineClientPlugin(
      {
        id: 'card-surfaces',
        name: 'Card surfaces',
        version: '1.0.0',
        hooks: [],
        capabilities: ['cards:read'],
      },
      ({ registerUiExtension }) => {
        registerUiExtension({
          id: 'card-surfaces:body',
          slot: 'card.body.tools',
          label: 'Body',
          render: () => null,
        })
        registerUiExtension({
          id: 'card-surfaces:sidebar',
          slot: 'card.sidebar.panels',
          label: 'Sidebar',
          render: () => null,
        })
      },
    )

    expect(
      collectEnabledUiExtensionsForSlots({
        registry: createClientPluginRegistry([plugin]),
        enabledPluginIds: ['card-surfaces'],
        slots: ['card.sidebar.panels', 'card.body.tools'],
      }).map((entry) => entry.extension.id),
    ).toEqual(['card-surfaces:sidebar', 'card-surfaces:body'])
  })
})
