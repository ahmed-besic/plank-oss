import { describe, expect, it, vi } from 'vitest'
import { createBoardPlatformServices, createPluginBoardPlatformServices } from './plugin-platform-services'
import type { BoardActions } from './board-actions/types'

function createActions(overrides: Partial<BoardActions> = {}): BoardActions {
  return {
    addProperty: vi.fn(async () => {}),
    deleteProperty: vi.fn(async () => {}),
    updatePropertyOptions: vi.fn(async () => {}),
    createCard: vi.fn(async () => 'card_1'),
    createSubTask: vi.fn(async () => 'card_2'),
    createColumn: vi.fn(async () => {}),
    moveCard: vi.fn(async () => {}),
    renameColumn: vi.fn(async () => {}),
    reorderColumn: vi.fn(async () => {}),
    deleteColumn: vi.fn(async () => {}),
    syncPluginViews: vi.fn(async () => {}),
    updateViewConfig: vi.fn(async () => {}),
    addBoardView: vi.fn(async () => 'view_1'),
    removeBoardView: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    deleteCard: vi.fn(async () => {}),
    requestCardUploadUrl: vi.fn(async () => 'upload-url'),
    resolveCardFileUrl: vi.fn(async () => null),
    ...overrides,
  }
}

describe('createBoardPlatformServices', () => {
  it('mediates plugin operations through board actions', async () => {
    const actions = createActions()
    const navigate = vi.fn()
    const openCard = vi.fn()
    const showToast = vi.fn()

    const services = createBoardPlatformServices({
      actions,
      activeViewId: 'view_1',
      navigate,
      openCard,
      showToast,
    })

    await services.properties.add(
      'Confidence',
      'focus-tools:confidence',
      {},
      'core:task',
    )
    await services.views.updateConfig({ inboxVisible: true })
    services.navigation.openCard('card_1')
    services.toast.show('Saved')

    expect(actions.addProperty).toHaveBeenCalledWith(
      'Confidence',
      'focus-tools:confidence',
      {},
      'core:task',
    )
    expect(actions.updateViewConfig).toHaveBeenCalledWith('view_1', {
      inboxVisible: true,
    })
    expect(openCard).toHaveBeenCalledWith('card_1')
    expect(showToast).toHaveBeenCalledWith('Saved')
  })

  it('keeps view config updates safe when there is no active view', async () => {
    const actions = createActions()
    const services = createBoardPlatformServices({
      actions,
      navigate: vi.fn(),
      openCard: vi.fn(),
      showToast: vi.fn(),
    })

    await services.views.updateConfig({ inboxVisible: true })

    expect(actions.updateViewConfig).not.toHaveBeenCalled()
  })

  it('scopes plugin-facing board services by manifest permissions', async () => {
    const actions = createActions()
    const services = createPluginBoardPlatformServices({
      actions,
      activeViewId: 'view_1',
      navigate: vi.fn(),
      openCard: vi.fn(),
      plugin: {
        manifest: {
          id: 'readonly-plugin',
          name: 'Readonly plugin',
          version: '1.0.0',
          hooks: [],
          capabilities: ['cards:read'],
        },
      },
      showToast: vi.fn(),
    })

    await expect(services.cards.create('Card')).rejects.toThrow(
      /runtime permission cards:write/,
    )
    services.navigation.openCard('card_1')

    expect(actions.createCard).not.toHaveBeenCalled()
  })
})
