import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { canManageWorkspace } from '@plank/domain'
import { useConvexAuth } from 'convex/react'

import { api } from '@convex/_generated/api'
import { usePlankApp } from '../../../lib/providers'
import type {
  AutomationRunData,
  BehaviorBindingData,
  BehaviorPackData,
  BoardTypeData,
  CardTypeData,
  TagData,
} from '../../../lib/types'
import { useHydrated } from '../../../lib/use-hydrated'

export function useSettingsData(workspaceSlug: string) {
  const hydrated = useHydrated()
  const auth = useConvexAuth()
  const { convexClient, queryClient } = usePlankApp()
  const enabled = hydrated && auth.isAuthenticated

  const overviewOpts = convexQuery(api.workspaces.getOverview, { workspaceSlug })
  const boardTypesOpts = convexQuery(api.boardTypes.listForWorkspace, { workspaceSlug })
  const cardTypesOpts = convexQuery(api.cardTypes.listForWorkspace, { workspaceSlug })
  const tagsOpts = convexQuery(api.tags.listForWorkspace, { workspaceSlug })
  const packsOpts = convexQuery(api.behaviors.listPacks, { workspaceSlug })
  const bindingsOpts = convexQuery(api.behaviors.listBindings, { workspaceSlug })
  const runsOpts = convexQuery(api.behaviors.listRuns, { workspaceSlug })

  const overview = useQuery({ ...overviewOpts, enabled })
  const canLoadManagerData =
    enabled && Boolean(overview.data) && canManageWorkspace(overview.data!.workspace.role)
  const boardTypesQ = useQuery({ ...boardTypesOpts, enabled })
  const cardTypesQ = useQuery({ ...cardTypesOpts, enabled })
  const tagsQ = useQuery({ ...tagsOpts, enabled })
  const packsQ = useQuery({ ...packsOpts, enabled: canLoadManagerData })
  const bindingsQ = useQuery({ ...bindingsOpts, enabled: canLoadManagerData })
  const runsQ = useQuery({ ...runsOpts, enabled: canLoadManagerData })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: overviewOpts.queryKey }),
      queryClient.invalidateQueries({ queryKey: boardTypesOpts.queryKey }),
      queryClient.invalidateQueries({ queryKey: cardTypesOpts.queryKey }),
      queryClient.invalidateQueries({ queryKey: tagsOpts.queryKey }),
      queryClient.invalidateQueries({ queryKey: packsOpts.queryKey }),
      queryClient.invalidateQueries({ queryKey: bindingsOpts.queryKey }),
      queryClient.invalidateQueries({ queryKey: runsOpts.queryKey }),
    ])
  }

  const boardTypes = (boardTypesQ.data ?? []) as BoardTypeData[]
  const cardTypes = (cardTypesQ.data ?? []) as CardTypeData[]
  const tags = (tagsQ.data ?? []) as TagData[]
  const behaviorPacks = (packsQ.data ?? []) as BehaviorPackData[]
  const behaviorBindings = (bindingsQ.data ?? []) as BehaviorBindingData[]
  const automationRuns = ((runsQ.data ?? []) as AutomationRunData[])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)

  return {
    overview: overview.data ?? null,
    boardTypes,
    cardTypes,
    tags,
    behaviorPacks,
    behaviorBindings,
    automationRuns,
    convexClient,
    invalidate,
    workspaceSlug,
  }
}

export type SettingsData = ReturnType<typeof useSettingsData>
