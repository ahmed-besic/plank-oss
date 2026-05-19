export function getMissingPluginViewIds({
  pluginViewIds,
  persistedViews,
}: {
  pluginViewIds: string[]
  persistedViews: Array<{
    viewId: string
    definitionViewId?: string
    instanceMode?: 'shared' | 'private'
    pluginId?: string
  }>
}) {
  const persistedPluginViewIds = new Set(
    persistedViews
      .filter((view) => view.pluginId && (view.instanceMode ?? 'shared') === 'shared')
      .map((view) => view.definitionViewId ?? view.viewId),
  )

  return pluginViewIds.filter((viewId) => !persistedPluginViewIds.has(viewId)).sort()
}
