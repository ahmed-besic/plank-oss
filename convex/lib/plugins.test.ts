import { describe, expect, it } from 'vitest'
import {
  CANONICAL_CORE_BOARD_VIEW_ID,
  getActivePluginIds,
  getSeededBoardViews,
  LEGACY_CORE_BOARD_VIEW_ID,
  normalizeBoardView,
  normalizeWorkspaceExtensionState,
} from './plugins'

describe('plugin helpers', () => {
  it('always includes required builtin plugins in the active set', () => {
    expect(
      getActivePluginIds([
        {
          pluginId: 'focus-tools',
          status: 'enabled',
        },
      ]),
    ).toEqual(
      expect.arrayContaining(['core-kanban', 'calendar-board', 'focus-tools']),
    )
  })

  it('normalizes the legacy core board view id', () => {
    expect(
      normalizeBoardView({
        viewId: LEGACY_CORE_BOARD_VIEW_ID,
        kind: 'core',
        label: 'Board',
        orderKey: 'a0',
        isDefault: true,
      }),
    ).toMatchObject({
      viewId: CANONICAL_CORE_BOARD_VIEW_ID,
      pluginId: 'core-kanban',
      kind: 'core',
      label: 'Board',
    })
  })

  it('normalizes legacy board view rows into feature instance refs', () => {
    expect(
      normalizeBoardView({
        _id: 'boardView_1' as never,
        viewId: 'calendar-board:month',
        definitionViewId: 'calendar-board:month',
        instanceMode: 'shared',
        pluginId: 'calendar-board',
        kind: 'core',
        label: 'Calendar',
        orderKey: 'a0',
        isDefault: true,
      }).featureInstance,
    ).toEqual({
      schemaVersion: 1,
      kind: 'view',
      pluginPackageId: 'calendar-board',
      featureId: 'calendar-board:month',
      instanceId: 'boardView_1',
      instanceMode: 'shared',
    })
  })

  it('normalizes workspace extension rows as enablement state', () => {
    expect(
      normalizeWorkspaceExtensionState({
        pluginId: 'focus-tools',
        status: 'enabled',
        config: { panel: true },
        installedAt: 1,
        updatedAt: 2,
      } as never),
    ).toEqual({
      pluginPackageId: 'focus-tools',
      status: 'enabled',
      config: { panel: true },
      installedAt: 1,
      updatedAt: 2,
    })
  })

  it('seeds the canonical core view and enabled plugin views without duplicating legacy entries', () => {
    expect(
      getSeededBoardViews({
        activePluginIds: ['core-kanban', 'focus-tools'],
        existingViews: [
          {
            viewId: LEGACY_CORE_BOARD_VIEW_ID,
            kind: 'core',
            label: 'Board',
            orderKey: 'a0',
            isDefault: true,
          },
        ],
      }).map((view) => view.viewId),
    ).toEqual(['calendar-board:month', 'focus-tools:focus-view'])
  })

	it('seeds task board views in board type template order', () => {
		expect(
			getSeededBoardViews({
				activePluginIds: ['core-kanban', 'focus-tools', 'task-board'],
				allowedViewIds: ['task-board:board'],
				existingViews: [],
			}).map((view) => ({
				viewId: view.viewId,
				isDefault: view.willBeDefault,
			})),
		).toEqual([{ viewId: 'task-board:board', isDefault: true }])
	})

	it('seeds calendar board views in board type template order', () => {
		expect(
			getSeededBoardViews({
				activePluginIds: ['core-kanban', 'calendar-board'],
				allowedViewIds: ['calendar-board:month'],
				existingViews: [],
			}).map((view) => ({
				viewId: view.viewId,
				isDefault: view.willBeDefault,
			})),
		).toEqual([{ viewId: 'calendar-board:month', isDefault: true }])
	})

  it('seeds only core kanban for core-only board types', () => {
    expect(
      getSeededBoardViews({
        activePluginIds: ['core-kanban', 'calendar-board', 'focus-tools'],
        allowedViewIds: ['core-kanban:board'],
        existingViews: [],
      }).map((view) => view.viewId),
    ).toEqual(['core-kanban:board'])
  })

  it('keeps the first allowed view as the default when there is no existing default', () => {
    expect(
      getSeededBoardViews({
        activePluginIds: ['core-kanban', 'calendar-board'],
        allowedViewIds: ['calendar-board:month', 'core-kanban:board'],
        existingViews: [],
      }).map((view) => ({
        viewId: view.viewId,
        isDefault: view.willBeDefault,
      })),
    ).toEqual([
      { viewId: 'calendar-board:month', isDefault: true },
      { viewId: 'core-kanban:board', isDefault: false },
    ])
  })

  it('does not mark a new default when an existing normalized default already exists', () => {
    expect(
      getSeededBoardViews({
        activePluginIds: ['core-kanban', 'calendar-board'],
        allowedViewIds: ['calendar-board:month'],
        existingViews: [
          {
            viewId: LEGACY_CORE_BOARD_VIEW_ID,
            kind: 'core',
            label: 'Board',
            orderKey: 'a0',
            isDefault: true,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        viewId: 'calendar-board:month',
        willBeDefault: false,
      }),
    ])
  })

  it('filters out disallowed views even when the plugin is active', () => {
    expect(
      getSeededBoardViews({
        activePluginIds: ['core-kanban', 'focus-tools', 'task-board'],
        allowedViewIds: ['focus-tools:focus-view'],
        existingViews: [],
      }).map((view) => view.viewId),
    ).toEqual(['focus-tools:focus-view'])
  })

  it('includes required builtin plugins even when workspace records are empty', () => {
    expect(getActivePluginIds([])).toEqual(
      expect.arrayContaining(['core-kanban', 'calendar-board']),
    )
  })
})
