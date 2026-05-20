/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinClientPluginRegistry } from '@plank/plugin-runtime/client'
import { createClientPluginRegistry, getEnabledUiExtensions } from '@plank/plugin-runtime'
import { defineClientPlugin } from '@plank/plugin-sdk'
import { CardDrawer } from './card-drawer'
import { renderTypedPropertyInput } from './card-drawer-property-input'

const useQuerySpy = vi.fn()
const localStorageMock = (() => {
  const store = new Map<string, string>()
  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

vi.mock('@convex-dev/react-query', () => ({
  convexQuery: () => ({
    queryKey: ['mock'],
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useQuery: (options?: { enabled?: boolean }) => {
    useQuerySpy(options)
    return {
      data:
        options?.enabled === false
          ? []
          : {
              outgoing: [],
              incoming: [],
            },
    }
  },
}))

vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    boards: {
      getBoardPage: {},
    },
    cards: {
      addCardRelation: {},
      getCardRelations: {},
      removeCardRelation: {},
    },
    comments: {
      create: {},
      deleteComment: {},
      listForCard: {},
      toggleReaction: {},
      update: {},
    },
    search: {
      searchWorkspaceCardTitles: {},
    },
  },
}))

vi.mock('@blocknote/core', () => ({
  BlockNoteSchema: {
    create: () => ({
      extend: () => ({}),
    }),
  },
}))

vi.mock('@blocknote/react', () => ({
  BlockNoteViewRaw: ({ children, ...props }: { children?: any }) => (
    <div data-testid="mock-editor" {...props}>
      Mock editor
      {children}
    </div>
  ),
  SuggestionMenuController: () => null,
  createReactInlineContentSpec: () => ({}),
  useCreateBlockNote: () => ({
    document: [],
    focus: vi.fn(),
    replaceBlocks: vi.fn(),
    insertBlocks: vi.fn(),
    insertInlineContent: vi.fn(),
    getTextCursorPosition: () => ({
      block: { id: 'mock-block' },
    }),
  }),
}))

vi.mock('../lib/providers', () => ({
  usePlankApp: () => ({
    convexClient: {
      mutation: vi.fn(),
      query: vi.fn(),
    },
    queryClient: {
      invalidateQueries: vi.fn(),
    },
  }),
}))

describe('CardDrawer', () => {
  it('does not query relations for optimistic cards', () => {
    useQuerySpy.mockClear()
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }

    render(
      <CardDrawer
        activePluginPropertyTypes={coreKanban.propertyTypes}
        activePluginSlots={[]}
        boardType={{
          id: 'boardType_1',
          workspaceId: 'workspace_1',
          key: 'task-tracking',
          name: 'Task tracking',
          lifecycleConfig: {
            statuses: [
              {
                key: 'backlog',
                label: 'Backlog',
                category: 'todo',
                orderKey: 'a0',
              },
            ],
            initialStatusKey: 'backlog',
          },
          defaultViewIds: ['core-kanban:board'],
          defaultCardTypeKey: 'core.todo',
        }}
        cardType={{
          id: 'core.todo',
          workspaceId: 'workspace_1',
          key: 'core.todo',
          name: 'Todo',
          schemaVersion: 1,
          propertiesSchema: [],
          defaultTagIds: [],
        }}
        tagDefinitions={[]}
        card={{
          id: 'optimistic:card_1',
          boardId: 'board_1',
          typeKey: 'core.todo',
          typeSchemaVersion: 1,
          cardTypeId: 'core.todo',
          title: 'Unsaved card',
          meta: {
            title: 'Unsaved card',
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
        }}
        members={[]}
        workspaceSlug="acme"
        onAddProperty={async () => {}}
        onDeleteCard={async () => {}}
        onDeleteProperty={async () => {}}
        onUpdatePropertyOptions={async () => {}}
        onRequestCardUploadUrl={async () => 'https://example.com'}
        onResolveCardFileUrl={async () => 'https://example.com/image.png'}
        onOpenCard={() => {}}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    expect(useQuerySpy).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  it('renders a supplied collaboration panel instead of owning comments directly', () => {
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }

    render(
      <CardDrawer
        activePluginPropertyTypes={coreKanban.propertyTypes}
        activePluginSlots={[]}
        boardType={{
          id: 'boardType_1',
          workspaceId: 'workspace_1',
          key: 'task-tracking',
          name: 'Task tracking',
          lifecycleConfig: {
            statuses: [
              {
                key: 'backlog',
                label: 'Backlog',
                category: 'todo',
                orderKey: 'a0',
              },
            ],
            initialStatusKey: 'backlog',
          },
          defaultViewIds: ['core-kanban:board'],
          defaultCardTypeKey: 'core.todo',
        }}
        cardType={{
          id: 'core.todo',
          workspaceId: 'workspace_1',
          key: 'core.todo',
          name: 'Todo',
          schemaVersion: 1,
          propertiesSchema: [],
          defaultTagIds: [],
        }}
        tagDefinitions={[]}
        card={{
          id: 'card_1',
          boardId: 'board_1',
          typeKey: 'core.todo',
          typeSchemaVersion: 1,
          cardTypeId: 'core.todo',
          title: 'Card',
          meta: {
            title: 'Card',
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
        }}
        commentsOpen
        members={[]}
        renderCollaborationPanel={({ cardId }) => (
          <div>Collaboration panel for {cardId}</div>
        )}
        workspaceSlug="acme"
        onAddProperty={async () => {}}
        onDeleteCard={async () => {}}
        onDeleteProperty={async () => {}}
        onUpdatePropertyOptions={async () => {}}
        onRequestCardUploadUrl={async () => 'https://example.com'}
        onResolveCardFileUrl={async () => 'https://example.com/image.png'}
        onOpenCard={() => {}}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    expect(screen.getAllByText('Collaboration panel for card_1')).toHaveLength(2)
  })

  it('renders native card drawer panel fills', () => {
    const plugin = defineClientPlugin(
      {
        id: 'test-panels',
        name: 'Test panels',
        version: '1.0.0',
        hooks: [],
        capabilities: [],
      },
      ({ registerUiExtension }) => {
        registerUiExtension({
          id: 'test:native-panel',
          slot: 'card.drawer.panels',
          label: 'Native panel',
          render: ({ card }) => <div>Native fill for {card?.meta.title}</div>,
        })
      },
    )
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }

    render(
      <CardDrawer
        activePluginPropertyTypes={coreKanban.propertyTypes}
        activePluginSlots={getEnabledUiExtensions({
          registry: createClientPluginRegistry([plugin]),
          enabledPluginIds: ['test-panels'],
          slot: 'card.drawer.panels',
        })}
        boardType={{
          id: 'boardType_1',
          workspaceId: 'workspace_1',
          key: 'task-tracking',
          name: 'Task tracking',
          lifecycleConfig: {
            statuses: [
              {
                key: 'backlog',
                label: 'Backlog',
                category: 'todo',
                orderKey: 'a0',
              },
            ],
            initialStatusKey: 'backlog',
          },
          defaultViewIds: ['core-kanban:board'],
          defaultCardTypeKey: 'core.todo',
        }}
        cardType={{
          id: 'core.todo',
          workspaceId: 'workspace_1',
          key: 'core.todo',
          name: 'Todo',
          schemaVersion: 1,
          propertiesSchema: [],
          defaultTagIds: [],
        }}
        tagDefinitions={[]}
        card={{
          id: 'card_1',
          boardId: 'board_1',
          typeKey: 'core.todo',
          typeSchemaVersion: 1,
          cardTypeId: 'core.todo',
          title: 'Card',
          meta: {
            title: 'Card',
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
        }}
        members={[]}
        workspaceSlug="acme"
        onAddProperty={async () => {}}
        onDeleteCard={async () => {}}
        onDeleteProperty={async () => {}}
        onUpdatePropertyOptions={async () => {}}
        onRequestCardUploadUrl={async () => 'https://example.com'}
        onResolveCardFileUrl={async () => 'https://example.com/image.png'}
        onOpenCard={() => {}}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    fireEvent.click(screen.getByText('Native panel'))
    expect(screen.getByText('Native fill for Card')).toBeTruthy()
  })

  it('copies editor text without escaped hard-break backslashes', () => {
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }
    const getSelectionSpy = vi.spyOn(window, 'getSelection')
    getSelectionSpy.mockReturnValue({
      toString: () => 'First line\\\nSecond line',
    } as Selection)

    const { getByTestId } = render(
      <CardDrawer
        activePluginPropertyTypes={coreKanban.propertyTypes}
        activePluginSlots={[]}
        boardType={{
          id: 'boardType_1',
          workspaceId: 'workspace_1',
          key: 'task-tracking',
          name: 'Task tracking',
          lifecycleConfig: {
            statuses: [
              {
                key: 'backlog',
                label: 'Backlog',
                category: 'todo',
                orderKey: 'a0',
              },
            ],
            initialStatusKey: 'backlog',
          },
          defaultViewIds: ['core-kanban:board'],
          defaultCardTypeKey: 'core.todo',
        }}
        cardType={{
          id: 'core.todo',
          workspaceId: 'workspace_1',
          key: 'core.todo',
          name: 'Todo',
          schemaVersion: 1,
          propertiesSchema: [],
          defaultTagIds: [],
        }}
        tagDefinitions={[]}
        card={{
          id: 'card_1',
          boardId: 'board_1',
          typeKey: 'core.todo',
          typeSchemaVersion: 1,
          cardTypeId: 'core.todo',
          title: 'Card',
          meta: {
            title: 'Card',
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
        }}
        members={[]}
        workspaceSlug="acme"
        onAddProperty={async () => {}}
        onDeleteCard={async () => {}}
        onDeleteProperty={async () => {}}
        onUpdatePropertyOptions={async () => {}}
        onRequestCardUploadUrl={async () => 'https://example.com'}
        onResolveCardFileUrl={async () => 'https://example.com/image.png'}
        onOpenCard={() => {}}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )
    const setData = vi.fn()

    fireEvent.copy(getByTestId('mock-editor'), {
      clipboardData: {
        setData,
      },
    })

    expect(setData).toHaveBeenCalledWith(
      'text/plain',
      'First line\nSecond line',
    )
    getSelectionSpy.mockRestore()
  })

  it('normalizes timestamp date inputs to epoch milliseconds or null', () => {
    const onChange = vi.fn()
    const props = {
      definition: {
        key: 'dueDate',
        name: 'Due date',
        type: 'timestamp' as never,
        orderKey: 'a0',
      },
      members: [],
      onChange,
      pluginPropertyTypeMap: new Map(),
      value: undefined,
    }
    const { container, rerender } = render(
      renderTypedPropertyInput({
        ...props,
      }),
    )

    const input = container.querySelector('input[type="date"]')
    if (!input) {
      throw new Error('Expected date input')
    }

    fireEvent.change(input, { target: { value: '2026-05-16' } })
    expect(onChange).toHaveBeenLastCalledWith(new Date('2026-05-16').getTime())

    rerender(
      renderTypedPropertyInput({
        ...props,
        value: new Date('2026-05-16').getTime(),
      }),
    )
    const populatedInput = container.querySelector('input[type="date"]')
    if (!populatedInput) {
      throw new Error('Expected populated date input')
    }
    fireEvent.change(populatedInput, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('uses registry-provided builtin property editors', () => {
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }

    const { container } = render(
      <CardDrawer
        activePluginPropertyTypes={coreKanban.propertyTypes}
        activePluginSlots={[]}
        boardType={{
          id: 'boardType_1',
          workspaceId: 'workspace_1',
          key: 'task-tracking',
          name: 'Task tracking',
          lifecycleConfig: {
            statuses: [
              {
                key: 'backlog',
                label: 'Backlog',
                category: 'todo',
                orderKey: 'a0',
              },
            ],
            initialStatusKey: 'backlog',
          },
          defaultViewIds: ['core-kanban:board'],
          defaultCardTypeKey: 'core.todo',
        }}
        cardType={{
          id: 'cardType_1',
          workspaceId: 'workspace_1',
          key: 'task',
          name: 'Task',
          schemaVersion: 1,
          propertiesSchema: [
            {
              key: 'ship_date',
              name: 'Ship date',
              type: 'date',
              orderKey: 'a0',
            },
          ],
          defaultTagIds: [],
        }}
        tagDefinitions={[]}
        card={{
          id: 'card_1',
          boardId: 'board_1',
          typeKey: 'cardType_1',
          typeSchemaVersion: 1,
          cardTypeId: 'cardType_1',
          title: 'Refactor board route',
          meta: {
            title: 'Refactor board route',
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
        }}
        members={[]}
        workspaceSlug="acme"
        onAddProperty={async () => {}}
        onDeleteCard={async () => {}}
        onDeleteProperty={async () => {}}
        onUpdatePropertyOptions={async () => {}}
        onRequestCardUploadUrl={async () => 'https://example.com'}
        onResolveCardFileUrl={async () => 'https://example.com/image.png'}
        onOpenCard={() => {}}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    expect(container.querySelector('input[type="date"]')).not.toBeNull()
  })

  it('renders teammate properties with the user picker', () => {
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }

    render(
      renderTypedPropertyInput({
        definition: {
          key: 'assignee',
          name: 'Assignee',
          type: 'user',
          orderKey: 'a0',
        },
        members: [
          {
            id: 'member_1',
            userId: 'user_1',
            name: 'Alex Johnson',
            email: 'alex@example.com',
            role: 'member',
          },
        ],
        onChange: vi.fn(),
        pluginPropertyTypeMap: new Map(
          coreKanban.propertyTypes.map((propertyType) => [
            propertyType.id,
            propertyType,
          ]),
        ),
        value: undefined,
      }),
    )

    expect(screen.getByRole('option', { name: 'Alex Johnson' })).toBeTruthy()
  })

  it('renders editable top-row metadata controls and restores drawer width', () => {
    window.localStorage.setItem('plank:cardDrawerWidth', '900')
    const coreKanban = builtinClientPluginRegistry.pluginMap.get('core-kanban')
    if (!coreKanban) {
      throw new Error('Missing core-kanban plugin')
    }

    const { container } = render(
      <CardDrawer
        activePluginPropertyTypes={coreKanban.propertyTypes}
        activePluginSlots={[]}
        boardType={{
          id: 'boardType_1',
          workspaceId: 'workspace_1',
          key: 'task-tracking',
          name: 'Task tracking',
          lifecycleConfig: {
            statuses: [
              {
                key: 'backlog',
                label: 'Backlog',
                category: 'todo',
                orderKey: 'a0',
              },
              {
                key: 'done',
                label: 'Done',
                category: 'done',
                orderKey: 'a1',
              },
            ],
            initialStatusKey: 'backlog',
          },
          defaultViewIds: ['core-kanban:board'],
          defaultCardTypeKey: 'task',
        }}
        cardType={{
          id: 'task',
          workspaceId: 'workspace_1',
          key: 'task',
          name: 'Task',
          schemaVersion: 1,
          propertiesSchema: [
            {
              key: 'dueDate',
              name: 'Due date',
              type: 'timestamp' as never,
              orderKey: 'a0',
            },
            {
              key: 'priority',
              name: 'Priority',
              type: 'select',
              orderKey: 'a1',
              config: {
                options: [
                  { label: 'High', value: 'high' },
                  { label: 'Low', value: 'low' },
                ],
              },
            },
          ],
          defaultTagIds: [],
        }}
        tagDefinitions={[
          {
            id: 'tag_1',
            workspaceId: 'workspace_1',
            key: 'urgent',
            name: 'Urgent',
          },
        ]}
        card={{
          id: 'card_1',
          boardId: 'board_1',
          typeKey: 'task',
          typeSchemaVersion: 1,
          cardTypeId: 'task',
          title: 'Task card',
          meta: {
            title: 'Task card',
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
        }}
        members={[]}
        workspaceSlug="acme"
        onAddProperty={async () => {}}
        onDeleteCard={async () => {}}
        onDeleteProperty={async () => {}}
        onUpdatePropertyOptions={async () => {}}
        onRequestCardUploadUrl={async () => 'https://example.com'}
        onResolveCardFileUrl={async () => 'https://example.com/image.png'}
        onOpenCard={() => {}}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    expect(screen.getByText('Status')).toBeTruthy()
    expect(screen.getByText('Tags')).toBeTruthy()
    expect(screen.getByText('Due date')).toBeTruthy()
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(0)

    fireEvent.click(screen.getByText('Tags'))
    expect(screen.getByText('Urgent')).toBeTruthy()

    fireEvent.click(screen.getByText('Status'))
    fireEvent.click(screen.getAllByText('Done').at(-1) as HTMLElement)
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Due date'))
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1)

    const resizeHandle = screen.getByLabelText('Resize drawer')
    expect(resizeHandle.parentElement?.getAttribute('style')).toContain('900px')
  })
})
