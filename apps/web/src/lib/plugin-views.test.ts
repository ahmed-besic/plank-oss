import { describe, expect, it } from 'vitest'
import { getMissingPluginViewIds } from './plugin-views'

describe('getMissingPluginViewIds', () => {
  it('returns only plugin views that are not persisted yet', () => {
    expect(
      getMissingPluginViewIds({
        pluginViewIds: ['focus-tools:focus', 'focus-tools:energy'],
        persistedViews: [
          {
            viewId: 'core:board',
          },
          {
            viewId: 'focus-tools:focus',
            pluginId: 'focus-tools',
          },
        ],
      }),
    ).toEqual(['focus-tools:energy'])
  })

  it('returns an empty list when all plugin views are already available', () => {
    expect(
      getMissingPluginViewIds({
        pluginViewIds: ['focus-tools:focus'],
        persistedViews: [
          {
            viewId: 'core:board',
          },
          {
            viewId: 'focus-tools:focus',
            pluginId: 'focus-tools',
          },
        ],
      }),
    ).toEqual([])
  })
})
