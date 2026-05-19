import { useBoardActionContext  } from './board-actions/context'
import type {BoardActionOptions} from './board-actions/context';
import { useCardBoardActions } from './board-actions/cards'
import { useColumnBoardActions } from './board-actions/columns'
import { usePluginBoardActions } from './board-actions/plugins'
import { usePropertyBoardActions } from './board-actions/properties'
import type { BoardActions } from './board-actions/types'
import { useViewBoardActions } from './board-actions/views'

export function useBoardActions(options: BoardActionOptions): BoardActions {
  const context = useBoardActionContext(options)

  const cardActions = useCardBoardActions(context)
  const columnActions = useColumnBoardActions(context)
  const propertyActions = usePropertyBoardActions(context)
  const pluginActions = usePluginBoardActions(context)
  const viewActions = useViewBoardActions(context)

  return {
    ...propertyActions,
    ...cardActions,
    ...columnActions,
    ...pluginActions,
    ...viewActions,
  }
}
