/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinClientPluginRegistry } from '@plank/plugin-runtime/client'

describe('core board plugin view', () => {
  afterEach(() => cleanup())

  const baseBoardProps = {
    boardId: 'board_1',
    boardName: 'Team board',
    viewId: 'core-kanban:board',
    viewLabel: 'Board',
    boardType: {
      id: 'boardType_1',
      workspaceId: 'workspace_1',
      key: 'task-tracking',
      name: 'Task tracking',
      lifecycleConfig: {
        statuses: [
          {
            key: 'backlog',
            label: 'Backlog',
            category: 'todo' as const,
            orderKey: 'a0',
          },
        ],
        initialStatusKey: 'backlog',
      },
      defaultViewIds: ['core-kanban:board'],
      defaultCardTypeKey: 'core.todo',
    },
    columns: [
      {
        id: 'backlog',
        statusKey: 'backlog',
        title: 'Backlog',
        orderKey: 'a0',
      },
    ],
    cardTypes: [
      {
        id: 'core.todo',
        workspaceId: 'workspace_1',
        key: 'core.todo',
        name: 'Todo',
        schemaVersion: 1,
        propertiesSchema: [],
        defaultTagIds: [],
      },
    ],
    tagDefinitions: [],
    members: [],
  }

  it('renders the canonical board view through the plugin registry', () => {
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    const boardView = coreKanban?.views.find(
      (view) => view.id === 'core-kanban:board',
    )

    if (!boardView) {
      throw new Error('Missing canonical board view')
    }

    render(
      boardView.render({
        ...baseBoardProps,
        cards: [
          {
            id: 'card_1',
            boardId: 'board_1',
            typeKey: 'core.todo',
            typeSchemaVersion: 1,
            cardTypeId: 'core.todo',
            title: 'Move board into core plugin',
            meta: {
              title: 'Move board into core plugin',
            },
            statusKey: 'backlog',
            orderKey: 'a0',
            body: {
              type: 'blocknote',
              content: [{ id: 'paragraph-1', type: 'paragraph' }],
            },
            properties: {},
            fields: {
              core: {},
              custom: {},
            },
            relations: [],
            tagIds: [],
            createdAt: 1,
            updatedAt: 1,
            createdBy: 'user_1',
          },
        ],
        actions: {
          createCard: vi.fn(async () => {}),
          createColumn: vi.fn(async () => {}),
          deleteColumn: vi.fn(async () => {}),
          moveCard: vi.fn(async () => {}),
          updateCard: vi.fn(async () => {}),
          openCard: vi.fn(),
          renameColumn: vi.fn(async () => {}),
          reorderColumn: vi.fn(async () => {}),
        },
      }),
    )

    expect(screen.getByText('Move board into core plugin')).toBeTruthy()
  })

  it('creates cards in the requested kanban status', async () => {
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    const boardView = coreKanban?.views.find(
      (view) => view.id === 'core-kanban:board',
    )

    if (!boardView) {
      throw new Error('Missing canonical board view')
    }

    const createCard = vi.fn(async () => 'card_2')
    render(
      boardView.render({
        ...baseBoardProps,
        cards: [],
        actions: {
          createCard,
          createColumn: vi.fn(async () => {}),
          deleteColumn: vi.fn(async () => {}),
          moveCard: vi.fn(async () => {}),
          updateCard: vi.fn(async () => {}),
          openCard: vi.fn(),
          renameColumn: vi.fn(async () => {}),
          reorderColumn: vi.fn(async () => {}),
        },
      }),
    )

    fireEvent.click(screen.getByTitle('Add card'))
    fireEvent.change(screen.getByPlaceholderText('Card title'), {
      target: { value: 'New kanban card' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('Card title'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(createCard).toHaveBeenCalledWith('New kanban card', 'backlog')
    })
  })
})
