import type { ShortcutScope } from './keyboard-shortcuts'

export interface ShortcutBindingInfo {
  id: string
  keys: string[]
  description: string
  scope: ShortcutScope | 'comments'
}

export const KEYBOARD_SHORTCUT_BINDINGS: ShortcutBindingInfo[] = [
  {
    id: 'global.help',
    keys: ['?'],
    description: 'Show keyboard shortcuts',
    scope: 'global',
  },
  {
    id: 'global.toggle-sidebar',
    keys: ['mod+b'],
    description: 'Show or hide sidebar',
    scope: 'global',
  },
  {
    id: 'global.workspace-home',
    keys: ['g', 'h'],
    description: 'Go to workspace home',
    scope: 'global',
  },
  {
    id: 'global.settings',
    keys: ['g', 's'],
    description: 'Go to workspace settings',
    scope: 'global',
  },
  {
    id: 'global.first-board',
    keys: ['g', 'b'],
    description: 'Go to first board',
    scope: 'global',
  },
  {
    id: 'global.create-board',
    keys: ['n', 'b'],
    description: 'Open new board menu',
    scope: 'global',
  },
  {
    id: 'global.workspace-menu',
    keys: ['n', 'w'],
    description: 'Open workspace menu',
    scope: 'global',
  },
  {
    id: 'board.command-palette',
    keys: ['mod+k'],
    description: 'Open command palette',
    scope: 'board',
  },
  {
    id: 'board.search',
    keys: ['/'],
    description: 'Search cards',
    scope: 'board',
  },
  {
    id: 'board.search-mod',
    keys: ['mod+f'],
    description: 'Search cards',
    scope: 'board',
  },
  {
    id: 'board.create-card',
    keys: ['n', 'c'],
    description: 'Create card in first column',
    scope: 'board',
  },
  {
    id: 'board.create-column',
    keys: ['n', 'l'],
    description: 'Create column',
    scope: 'board',
  },
  {
    id: 'board.add-view',
    keys: ['v'],
    description: 'Add a board view',
    scope: 'board',
  },
  {
    id: 'board.next-view',
    keys: [']'],
    description: 'Next view',
    scope: 'board',
  },
  {
    id: 'board.previous-view',
    keys: ['['],
    description: 'Previous view',
    scope: 'board',
  },
  {
    id: 'board.board-menu',
    keys: ['b'],
    description: 'Open board switcher',
    scope: 'board',
  },
  {
    id: 'board.activity',
    keys: ['a'],
    description: 'Toggle activity',
    scope: 'board',
  },
  {
    id: 'board.inbox',
    keys: ['i'],
    description: 'Toggle inbox',
    scope: 'board',
  },
  {
    id: 'board.close-panel',
    keys: ['escape'],
    description: 'Close board menu or utility panel',
    scope: 'board',
  },
  {
    id: 'card.save-close',
    keys: ['mod+enter'],
    description: 'Save and close card',
    scope: 'card',
  },
  {
    id: 'card.close',
    keys: ['escape'],
    description: 'Save and close card when focus is not in the editor',
    scope: 'card',
  },
  {
    id: 'card.title',
    keys: ['t'],
    description: 'Focus title',
    scope: 'card',
  },
  {
    id: 'card.description',
    keys: ['d'],
    description: 'Focus description',
    scope: 'card',
  },
  {
    id: 'card.status',
    keys: ['s'],
    description: 'Open status',
    scope: 'card',
  },
  {
    id: 'card.tags',
    keys: ['g'],
    description: 'Open tags',
    scope: 'card',
  },
  {
    id: 'card.relations',
    keys: ['l'],
    description: 'Open relations',
    scope: 'card',
  },
  {
    id: 'card.add-property',
    keys: ['p'],
    description: 'Add property',
    scope: 'card',
  },
  {
    id: 'card.comments',
    keys: ['mod+shift+c'],
    description: 'Toggle comments',
    scope: 'card',
  },
  {
    id: 'card.upload-image',
    keys: ['u'],
    description: 'Upload image',
    scope: 'card',
  },
  {
    id: 'comments.submit',
    keys: ['mod+enter'],
    description: 'Submit comment or save edited comment',
    scope: 'comments',
  },
  {
    id: 'comments.cancel',
    keys: ['escape'],
    description: 'Cancel editing a comment',
    scope: 'comments',
  },
  {
    id: 'comments.mention-next',
    keys: ['arrowdown'],
    description: 'Move down mention suggestions',
    scope: 'comments',
  },
  {
    id: 'comments.mention-prev',
    keys: ['arrowup'],
    description: 'Move up mention suggestions',
    scope: 'comments',
  },
  {
    id: 'comments.mention-select',
    keys: ['enter'],
    description: 'Select highlighted mention',
    scope: 'comments',
  },
  {
    id: 'settings.extensions',
    keys: ['1'],
    description: 'Open Extensions settings',
    scope: 'settings',
  },
  {
    id: 'settings.schema',
    keys: ['2'],
    description: 'Open Schema settings',
    scope: 'settings',
  },
  {
    id: 'settings.automation',
    keys: ['3'],
    description: 'Open Automation settings',
    scope: 'settings',
  },
  {
    id: 'settings.members',
    keys: ['4'],
    description: 'Open Members settings',
    scope: 'settings',
  },
  {
    id: 'settings.shortcuts',
    keys: ['5'],
    description: 'Open Shortcuts settings',
    scope: 'settings',
  },
]
