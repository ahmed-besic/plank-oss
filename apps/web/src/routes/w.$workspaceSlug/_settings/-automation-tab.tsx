import { useMutation } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Code2, Play, Trash2, Wand2 } from 'lucide-react'
import type {
  BehaviorTargetType,
  SimpleBehaviorAction,
  SimpleBehaviorRuleConfig,
} from '@plank/domain'
import { Button, Input } from '@plank/ui'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@convex/_generated/api'
import { getMemberDisplayName } from '../../../lib/member-display'
import type {
  AutomationRunData,
  BehaviorBindingData,
  BehaviorPackData,
} from '../../../lib/types'
import type { SettingsData } from './-use-settings-data'

function getTargetOptions(
  targetType: BehaviorTargetType,
  data: SettingsData,
) {
  const { overview, boardTypes, cardTypes, tags } = data
  if (!overview) return []
  switch (targetType) {
    case 'workspace':
      return [{ id: overview.workspace.id, label: overview.workspace.name }]
    case 'boardType':
      return boardTypes.map((b) => ({ id: b.id, label: b.name }))
    case 'board':
      return overview.boards.map((b) => ({ id: b.id, label: b.name }))
    case 'cardType':
      return cardTypes.map((c) => ({ id: c.id, label: c.name }))
    case 'tag':
      return tags.map((t) => ({ id: t.id, label: t.name }))
  }
}

function getBindingTargetLabel(binding: BehaviorBindingData, data: SettingsData) {
  const { overview, boardTypes, cardTypes, tags } = data
  if (!overview) return binding.targetId
  switch (binding.targetType) {
    case 'workspace':
      return overview.workspace.name
    case 'boardType':
      return boardTypes.find((b) => b.id === binding.targetId)?.name
    case 'board':
      return overview.boards.find((b) => b.id === binding.targetId)?.name
    case 'cardType':
      return cardTypes.find((c) => c.id === binding.targetId)?.name
    case 'tag':
      return tags.find((t) => t.id === binding.targetId)?.name
  }
}

function formatRunStatus(run: AutomationRunData) {
  if (run.status === 'guard_stopped') return 'Guard stopped'
  if (run.status === 'partial') return 'Partial'
  if (run.status === 'error') return 'Error'
  return 'OK'
}

function getPropertyOptions(data: SettingsData) {
  const properties = new Map<
    string,
    {
      key: string
      label: string
      type: string
    }
  >()
  for (const cardType of data.cardTypes) {
    for (const property of cardType.propertiesSchema) {
      if (!properties.has(property.key)) {
        properties.set(property.key, {
          key: property.key,
          label: property.name,
          type: property.type,
        })
      }
    }
  }
  return [...properties.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  )
}

function getStatusOptions(data: SettingsData) {
  const statuses = new Map<string, { key: string; label: string }>()
  for (const boardType of data.boardTypes) {
    for (const status of boardType.lifecycleConfig.statuses) {
      if (!statuses.has(status.key)) {
        statuses.set(status.key, {
          key: status.key,
          label: status.label,
        })
      }
    }
  }
  return [...statuses.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  )
}

function describeSimpleAction(
  action: SimpleBehaviorAction,
  data: SettingsData,
) {
  switch (action.type) {
    case 'set_property': {
      const property =
        getPropertyOptions(data).find((item) => item.key === action.propertyKey)
      return `Set ${property?.label ?? action.propertyKey}`
    }
    case 'set_current_date': {
      const property =
        getPropertyOptions(data).find((item) => item.key === action.propertyKey)
      return `Set ${property?.label ?? action.propertyKey} to current date`
    }
    case 'add_tag':
      return `Add tag ${data.tags.find((tag) => tag.key === action.tagKey)?.name ?? action.tagKey}`
    case 'remove_tag':
      return `Remove tag ${data.tags.find((tag) => tag.key === action.tagKey)?.name ?? action.tagKey}`
    case 'move_status':
      return `Move to ${getStatusOptions(data).find((status) => status.key === action.statusKey)?.label ?? action.statusKey}`
    case 'notify':
      if (action.recipientUserId) {
        const teammate = data.overview?.members.find(
          (member) => member.userId === action.recipientUserId,
        )
        return `Notify ${teammate ? getMemberDisplayName(teammate) : action.recipientUserId}`
      }
      return `Notify ${action.recipientPropertyKey ?? 'teammate field'}`
  }
}

function describeSimpleTrigger(config: SimpleBehaviorRuleConfig) {
  switch (config.trigger.eventName) {
    case 'card.created':
      return 'When a card is created'
    case 'card.moved':
      return 'When a card moves status'
    case 'tag.applied':
      return 'When a tag is added'
  }
}

function parseSimplePropertyValue(type: string, rawValue: string, booleanValue: boolean) {
  if (type === 'boolean') {
    return booleanValue
  }
  if (type === 'number') {
    return Number(rawValue)
  }
  if (type === 'timestamp') {
    const parsed = Date.parse(rawValue)
    return Number.isNaN(parsed) ? Number(rawValue) : parsed
  }
  return rawValue
}

function resolveRecipientPropertyTypeKeys({
  data,
  targetId,
  targetType,
}: {
  data: SettingsData
  targetId: string
  targetType: BehaviorTargetType
}) {
  if (targetType === 'cardType') {
    return [targetId]
  }

  if (targetType === 'boardType') {
    const boardType = data.boardTypes.find((entry) => entry.id === targetId)
    return boardType?.defaultCardTypeKey ? [boardType.defaultCardTypeKey] : []
  }

  if (targetType === 'board') {
    const board = data.overview?.boards.find((entry) => entry.id === targetId)
    const boardType = data.boardTypes.find(
      (entry) => entry.id === board?.boardTypeId,
    )
    return boardType?.defaultCardTypeKey ? [boardType.defaultCardTypeKey] : []
  }

  return data.cardTypes.map((cardType) => cardType.key)
}

export function AutomationTab({ data }: { data: SettingsData }) {
  const { behaviorPacks, behaviorBindings, automationRuns, convexClient, invalidate, workspaceSlug } = data

  const [packName, setPackName] = useState('')
  const [selectedPackId, setSelectedPackId] = useState('')
  const [packSource, setPackSource] = useState('')
  const [bindTargetType, setBindTargetType] =
    useState<BehaviorPackData['allowedTargetTypes'][number]>('workspace')
  const [bindTargetId, setBindTargetId] = useState('')
  const [bindPriority, setBindPriority] = useState('100')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showAllRuns, setShowAllRuns] = useState(false)

  const [editingSimplePackId, setEditingSimplePackId] = useState('')
  const [simpleName, setSimpleName] = useState('')
  const [simpleTrigger, setSimpleTrigger] =
    useState<SimpleBehaviorRuleConfig['trigger']['eventName']>('card.created')
  const [simpleActionType, setSimpleActionType] =
    useState<SimpleBehaviorAction['type']>('move_status')
  const [simpleTargetType, setSimpleTargetType] =
    useState<BehaviorTargetType>('workspace')
  const [simpleTargetId, setSimpleTargetId] = useState('')
  const [simplePriority, setSimplePriority] = useState('100')
  const [simpleEnabled, setSimpleEnabled] = useState(true)
  const [simplePropertyKey, setSimplePropertyKey] = useState('')
  const [simplePropertyValue, setSimplePropertyValue] = useState('')
  const [simpleBooleanValue, setSimpleBooleanValue] = useState(false)
  const [simpleTagKey, setSimpleTagKey] = useState('')
  const [simpleStatusKey, setSimpleStatusKey] = useState('')
  const [simpleNotifyTargetMode, setSimpleNotifyTargetMode] =
    useState<'teammate' | 'property'>('teammate')
  const [simpleRecipientPropertyKey, setSimpleRecipientPropertyKey] = useState('')
  const [simpleRecipientUserId, setSimpleRecipientUserId] = useState('')
  const [simpleNotifyMessage, setSimpleNotifyMessage] = useState('')
  const [simpleDiagnostics, setSimpleDiagnostics] = useState<
    BehaviorPackData['compileDiagnostics']
  >([])

  const selectedPack = behaviorPacks.find((p) => p.id === selectedPackId) ?? null
  const simplePacks = behaviorPacks.filter(
    (pack) => pack.authoringMode === 'simple' && pack.simpleRuleConfig,
  )
  const simpleBindingsByPackId = new Map(
    behaviorBindings.map((binding) => [binding.behaviorPackId, binding]),
  )
  const propertyOptions = useMemo(() => getPropertyOptions(data), [data])
  const userPropertyOptions = useMemo(
    () => propertyOptions.filter((property) => property.type === 'user'),
    [propertyOptions],
  )
  const datePropertyOptions = useMemo(
    () =>
      propertyOptions.filter(
        (property) => property.type === 'timestamp' || property.type === 'date',
      ),
    [propertyOptions],
  )
  const statusOptions = useMemo(() => getStatusOptions(data), [data])
  const memberOptions = useMemo(
    () =>
      (data.overview?.members ?? []).map((member) => ({
        id: member.userId,
        label: getMemberDisplayName(member),
      })),
    [data.overview?.members],
  )
  const simpleTargetOptions = useMemo(
    () => getTargetOptions(simpleTargetType, data),
    [data, simpleTargetType],
  )
  const targetOptions = useMemo(
    () => getTargetOptions(bindTargetType, data),
    [bindTargetType, data],
  )
  const editingSimplePack =
    simplePacks.find((pack) => pack.id === editingSimplePackId) ?? null
  const selectedProperty = propertyOptions.find(
    (property) => property.key === simplePropertyKey,
  )

  useEffect(() => {
    if (!selectedPackId && behaviorPacks.length) setSelectedPackId(behaviorPacks[0]?.id ?? '')
  }, [behaviorPacks, selectedPackId])

  useEffect(() => {
    if (!selectedPack) { setPackSource(''); return }
    setPackSource(selectedPack.source)
  }, [selectedPack?.id, selectedPack?.source])

  useEffect(() => {
    if (selectedPack && !selectedPack.allowedTargetTypes.includes(bindTargetType)) {
      setBindTargetType(selectedPack.allowedTargetTypes[0] ?? 'workspace')
    }
  }, [bindTargetType, selectedPack])

  useEffect(() => {
    if (!targetOptions.length) { setBindTargetId(''); return }
    if (!targetOptions.some((t) => t.id === bindTargetId)) setBindTargetId(targetOptions[0]?.id ?? '')
  }, [bindTargetId, targetOptions])

  useEffect(() => {
    if (!simpleTargetOptions.length) {
      setSimpleTargetId('')
      return
    }
    if (!simpleTargetOptions.some((target) => target.id === simpleTargetId)) {
      setSimpleTargetId(simpleTargetOptions[0]?.id ?? '')
    }
  }, [simpleTargetId, simpleTargetOptions])

  useEffect(() => {
    if (!propertyOptions.length) {
      setSimplePropertyKey('')
      setSimpleRecipientPropertyKey('')
      return
    }
    if (!propertyOptions.some((property) => property.key === simplePropertyKey)) {
      setSimplePropertyKey(propertyOptions[0]?.key ?? '')
    }
    if (!userPropertyOptions.some((property) => property.key === simpleRecipientPropertyKey)) {
      setSimpleRecipientPropertyKey(userPropertyOptions[0]?.key ?? '')
    }
  }, [propertyOptions, simplePropertyKey, simpleRecipientPropertyKey, userPropertyOptions])

  useEffect(() => {
    if (simpleActionType !== 'set_current_date') {
      return
    }
    if (!datePropertyOptions.length) {
      setSimplePropertyKey('')
      return
    }
    if (!datePropertyOptions.some((property) => property.key === simplePropertyKey)) {
      setSimplePropertyKey(datePropertyOptions[0]?.key ?? '')
    }
  }, [datePropertyOptions, simpleActionType, simplePropertyKey])

  useEffect(() => {
    if (!data.tags.length) {
      setSimpleTagKey('')
      return
    }
    if (!data.tags.some((tag) => tag.key === simpleTagKey)) {
      setSimpleTagKey(data.tags[0]?.key ?? '')
    }
  }, [data.tags, simpleTagKey])

  useEffect(() => {
    if (!statusOptions.length) {
      setSimpleStatusKey('')
      return
    }
    if (!statusOptions.some((status) => status.key === simpleStatusKey)) {
      setSimpleStatusKey(statusOptions[0]?.key ?? '')
    }
  }, [simpleStatusKey, statusOptions])

  useEffect(() => {
    if (!memberOptions.length) {
      setSimpleRecipientUserId('')
      return
    }
    if (!memberOptions.some((member) => member.id === simpleRecipientUserId)) {
      setSimpleRecipientUserId(memberOptions[0]?.id ?? '')
    }
  }, [memberOptions, simpleRecipientUserId])

  useEffect(() => {
    if (!editingSimplePackId) {
      return
    }
    if (!editingSimplePack) {
      setEditingSimplePackId('')
      setSimpleDiagnostics([])
    }
  }, [editingSimplePack, editingSimplePackId])

  const resetSimpleForm = () => {
    setEditingSimplePackId('')
    setSimpleName('')
    setSimpleTrigger('card.created')
    setSimpleActionType('move_status')
    setSimpleTargetType('workspace')
    setSimplePriority('100')
    setSimpleEnabled(true)
    setSimplePropertyValue('')
    setSimpleBooleanValue(false)
    setSimpleNotifyTargetMode('teammate')
    setSimpleRecipientUserId('')
    setSimpleNotifyMessage('')
    setSimpleDiagnostics([])
  }

  const loadSimplePackIntoForm = (pack: BehaviorPackData) => {
    const config = pack.simpleRuleConfig
    if (!config) return
    const binding = simpleBindingsByPackId.get(pack.id)
    setEditingSimplePackId(pack.id)
    setSimpleName(config.name)
    setSimpleTrigger(config.trigger.eventName)
    setSimpleActionType(config.action.type)
    setSimpleTargetType(config.targetType)
    setSimpleTargetId(config.targetId)
    setSimplePriority(String(binding?.priority ?? config.priority))
    setSimpleEnabled(binding?.enabled ?? config.enabled)
    if (config.action.type === 'set_property') {
      setSimplePropertyKey(config.action.propertyKey)
      setSimplePropertyValue(
        config.action.value === null ? 'null' : String(config.action.value),
      )
      setSimpleBooleanValue(Boolean(config.action.value))
    }
    if (config.action.type === 'set_current_date') {
      setSimplePropertyKey(config.action.propertyKey)
    }
    if (config.action.type === 'add_tag' || config.action.type === 'remove_tag') {
      setSimpleTagKey(config.action.tagKey)
    }
    if (config.action.type === 'move_status') {
      setSimpleStatusKey(config.action.statusKey)
    }
    if (config.action.type === 'notify') {
      setSimpleNotifyTargetMode(
        config.action.recipientUserId ? 'teammate' : 'property',
      )
      setSimpleRecipientPropertyKey(config.action.recipientPropertyKey ?? '')
      setSimpleRecipientUserId(config.action.recipientUserId ?? '')
      setSimpleNotifyMessage(config.action.message)
    }
    setSimpleDiagnostics(pack.compileDiagnostics)
  }

  const createPack = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.behaviors.createPack, { workspaceSlug, name: packName, source: packSource }),
    onSuccess: async (r) => { setPackName(''); setSelectedPackId(r.packId); await invalidate() },
  })
  const saveSource = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.behaviors.updatePackSource, {
        workspaceSlug, packId: selectedPackId as never, source: packSource,
      }),
    onSuccess: async () => {
      await invalidate()
      if (selectedPackId === editingSimplePackId) {
        resetSimpleForm()
      }
    },
  })
  const compile = useMutation({
    mutationFn: async (id: string) =>
      convexClient.mutation(api.behaviors.compilePack, { workspaceSlug, packId: id as never }),
    onSuccess: () => void invalidate(),
  })
  const activate = useMutation({
    mutationFn: async (id: string) =>
      convexClient.mutation(api.behaviors.activatePack, { workspaceSlug, packId: id as never }),
    onSuccess: () => void invalidate(),
  })
  const archive = useMutation({
    mutationFn: async (id: string) =>
      convexClient.mutation(api.behaviors.archivePack, { workspaceSlug, packId: id as never }),
    onSuccess: () => void invalidate(),
  })
  const bind = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.behaviors.bindPack, {
        workspaceSlug, packId: selectedPackId as never,
        targetType: bindTargetType, targetId: bindTargetId,
        priority: Number(bindPriority || 100),
      }),
    onSuccess: () => void invalidate(),
  })
  const toggleBind = useMutation({
    mutationFn: async (p: { bindingId: string; enabled: boolean }) =>
      convexClient.mutation(api.behaviors.setBindingEnabled, {
        workspaceSlug, bindingId: p.bindingId as never, enabled: p.enabled,
      }),
    onSuccess: () => void invalidate(),
  })
  const unbind = useMutation({
    mutationFn: async (id: string) =>
      convexClient.mutation(api.behaviors.unbindPack, { workspaceSlug, bindingId: id as never }),
    onSuccess: () => void invalidate(),
  })
  const saveSimplePack = useMutation({
    mutationFn: async () => {
      let ensuredRecipientPropertyKey = simpleRecipientPropertyKey
      if (
        simpleActionType === 'notify' &&
        simpleNotifyTargetMode === 'property' &&
        !ensuredRecipientPropertyKey
      ) {
        const typeKeys = [...new Set(resolveRecipientPropertyTypeKeys({
          data,
          targetId: simpleTargetId,
          targetType: simpleTargetType,
        }))]
        if (!typeKeys.length) {
          throw new Error('No card type is available for teammate notifications')
        }

        for (const typeKey of typeKeys) {
          const cardType = data.cardTypes.find((entry) => entry.key === typeKey)
          const existingUserField = cardType?.propertiesSchema.find(
            (property) => property.type === 'user',
          )
          if (existingUserField) {
            ensuredRecipientPropertyKey = existingUserField.key
            continue
          }

          await convexClient.mutation(api.cardTypes.createProperty, {
            workspaceSlug,
            typeKey,
            name: 'Assignee',
            type: 'user',
          })
          ensuredRecipientPropertyKey = 'assignee'
        }
      }

      let action: SimpleBehaviorAction
      if (simpleActionType === 'set_property') {
        action = {
          type: 'set_property',
          propertyKey: simplePropertyKey,
          value: parseSimplePropertyValue(
            selectedProperty?.type ?? 'string',
            simplePropertyValue,
            simpleBooleanValue,
          ),
        }
      } else if (simpleActionType === 'add_tag') {
        action = {
          type: 'add_tag',
          tagKey: simpleTagKey,
        }
      } else if (simpleActionType === 'set_current_date') {
        action = {
          type: 'set_current_date',
          propertyKey: simplePropertyKey,
        }
      } else if (simpleActionType === 'remove_tag') {
        action = {
          type: 'remove_tag',
          tagKey: simpleTagKey,
        }
      } else if (simpleActionType === 'move_status') {
        action = {
          type: 'move_status',
          statusKey: simpleStatusKey,
        }
      } else {
        action = {
          type: 'notify',
          recipientPropertyKey:
            simpleNotifyTargetMode === 'property'
              ? ensuredRecipientPropertyKey
              : undefined,
          recipientUserId:
            simpleNotifyTargetMode === 'teammate'
              ? simpleRecipientUserId
              : undefined,
          message: simpleNotifyMessage,
        }
      }
      return convexClient.mutation(api.behaviors.saveSimplePack, {
        workspaceSlug,
        packId: editingSimplePackId ? (editingSimplePackId as never) : undefined,
        config: {
          name: simpleName,
          trigger: {
            eventName: simpleTrigger,
          },
          action,
          targetType: simpleTargetType,
          targetId: simpleTargetId,
          priority: Number(simplePriority || 100),
          enabled: simpleEnabled,
        },
      })
    },
    onSuccess: async (result) => {
      setEditingSimplePackId(result.packId)
      setSelectedPackId(result.packId)
      setSimpleDiagnostics(result.diagnostics)
      await invalidate()
    },
  })
  const toggleSimplePack = useMutation({
    mutationFn: async (pack: BehaviorPackData) => {
      const config = pack.simpleRuleConfig
      if (!config) {
        throw new Error('Simple rule config not found')
      }
      const binding = simpleBindingsByPackId.get(pack.id)
      return convexClient.mutation(api.behaviors.saveSimplePack, {
        workspaceSlug,
        packId: pack.id as never,
        config: {
          ...config,
          priority: binding?.priority ?? config.priority,
          enabled: !(binding?.enabled ?? config.enabled),
        },
      })
    },
    onSuccess: async () => {
      await invalidate()
    },
  })

  const canSaveSimple =
    simpleName.trim().length > 0 &&
    simpleTargetId.length > 0 &&
    (
      (simpleActionType === 'set_property' &&
        simplePropertyKey.length > 0 &&
        (selectedProperty?.type === 'boolean' || simplePropertyValue.trim().length > 0)) ||
      (simpleActionType === 'set_current_date' && simplePropertyKey.length > 0) ||
      ((simpleActionType === 'add_tag' || simpleActionType === 'remove_tag') &&
        simpleTagKey.length > 0) ||
      (simpleActionType === 'move_status' && simpleStatusKey.length > 0) ||
      (simpleActionType === 'notify' &&
        (simpleNotifyTargetMode === 'teammate'
          ? simpleRecipientUserId.length > 0
          : true) &&
        simpleNotifyMessage.trim().length > 0)
    )
  const visibleAutomationRuns = showAllRuns
    ? automationRuns.slice(0, 50)
    : automationRuns.slice(0, 6)

  const [advancedSection, setAdvancedSection] = useState<'packs' | 'bindings' | 'runs'>('packs')

  return (
    <div className="automation-tab">
      <h2 className="automation-title">Automations</h2>
      <p className="automation-subtitle">
        {simplePacks.length} simple rule{simplePacks.length !== 1 ? 's' : ''} · {behaviorBindings.length} binding{behaviorBindings.length !== 1 ? 's' : ''} · {automationRuns.length} run{automationRuns.length !== 1 ? 's' : ''}
      </p>

      {/* Simple rules editor */}
      <section className="automation-section">
        <div className="automation-section-header">
          <Wand2 size={16} />
          <h3 className="automation-section-title">Simple rules</h3>
        </div>

        <div className="automation-rule-form">
          <div className="automation-form-row">
            <label className="automation-label">Rule name</label>
            <Input
              onChange={(e) => setSimpleName(e.target.value)}
              placeholder="Tag completed tasks"
              value={simpleName}
            />
          </div>

          <div className="automation-form-row automation-form-row-3">
            <div>
              <label className="automation-label">When</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleTrigger(e.target.value as SimpleBehaviorRuleConfig['trigger']['eventName'])}
                value={simpleTrigger}
              >
                <option value="card.created">Card created</option>
                <option value="card.moved">Card moved to status</option>
                <option value="tag.applied">Tag added</option>
              </select>
            </div>
            <div>
              <label className="automation-label">Action</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleActionType(e.target.value as SimpleBehaviorAction['type'])}
                value={simpleActionType}
              >
                <option value="set_property">Set property</option>
                <option value="set_current_date">Set current date</option>
                <option value="add_tag">Add tag</option>
                <option value="remove_tag">Remove tag</option>
                <option value="move_status">Move to status</option>
                <option value="notify">Notify teammate</option>
              </select>
            </div>
            <div>
              <label className="automation-label">Priority</label>
              <Input
                onChange={(e) => setSimplePriority(e.target.value)}
                placeholder="100"
                type="number"
                value={simplePriority}
              />
            </div>
          </div>

          {simpleActionType === 'set_property' ? (
            <div className="automation-form-row automation-form-row-2">
              <div>
                <label className="automation-label">Property</label>
                <select
                  className="settings-select"
                  onChange={(e) => setSimplePropertyKey(e.target.value)}
                  value={simplePropertyKey}
                >
                  {propertyOptions.map((property) => (
                    <option key={property.key} value={property.key}>{property.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="automation-label">Value</label>
                {selectedProperty?.type === 'boolean' ? (
                  <select
                    className="settings-select"
                    onChange={(e) => setSimpleBooleanValue(e.target.value === 'true')}
                    value={String(simpleBooleanValue)}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <Input
                    onChange={(e) => setSimplePropertyValue(e.target.value)}
                    placeholder={selectedProperty?.type === 'timestamp' ? '2026-05-15T09:00' : selectedProperty?.type === 'number' ? '5' : '"High"'}
                    type={selectedProperty?.type === 'number' ? 'number' : 'text'}
                value={simplePropertyValue}
              />
                )}
              </div>
            </div>
          ) : null}

          {simpleActionType === 'set_current_date' ? (
            <div className="automation-form-row">
              <label className="automation-label">Date property</label>
              <select
                className="settings-select"
                onChange={(e) => setSimplePropertyKey(e.target.value)}
                value={simplePropertyKey}
              >
                {datePropertyOptions.map((property) => (
                  <option key={property.key} value={property.key}>{property.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {(simpleActionType === 'add_tag' || simpleActionType === 'remove_tag') ? (
            <div className="automation-form-row">
              <label className="automation-label">Tag</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleTagKey(e.target.value)}
                value={simpleTagKey}
              >
                {data.tags.map((tag) => (
                  <option key={tag.key} value={tag.key}>{tag.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          {simpleActionType === 'move_status' ? (
            <div className="automation-form-row">
              <label className="automation-label">Move to</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleStatusKey(e.target.value)}
                value={simpleStatusKey}
              >
                {statusOptions.map((status) => (
                  <option key={status.key} value={status.key}>{status.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {simpleActionType === 'notify' ? (
            <div className="automation-form-row automation-form-row-2">
              <div>
                <label className="automation-label">Notify by</label>
                <select
                  className="settings-select"
                  onChange={(e) =>
                    setSimpleNotifyTargetMode(
                      e.target.value as 'teammate' | 'property',
                    )
                  }
                  value={simpleNotifyTargetMode}
                >
                  <option value="teammate">Specific teammate</option>
                  <option value="property">Teammate field on card</option>
                </select>
              </div>
              <div>
                <label className="automation-label">Message</label>
                <Input
                  onChange={(e) => setSimpleNotifyMessage(e.target.value)}
                  placeholder="Card entered done"
                value={simpleNotifyMessage}
              />
              </div>
            </div>
          ) : null}

          {simpleActionType === 'notify' && simpleNotifyTargetMode === 'teammate' ? (
            <div className="automation-form-row">
              <label className="automation-label">Teammate</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleRecipientUserId(e.target.value)}
                value={simpleRecipientUserId}
              >
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>{member.label}</option>
                ))}
              </select>
            </div>
          ) : null}

          {simpleActionType === 'notify' && simpleNotifyTargetMode === 'property' ? (
            <div className="automation-form-row">
              <label className="automation-label">Teammate field</label>
              {userPropertyOptions.length ? (
                <select
                  className="settings-select"
                  onChange={(e) => setSimpleRecipientPropertyKey(e.target.value)}
                  value={simpleRecipientPropertyKey}
                >
                  {userPropertyOptions.map((property) => (
                    <option key={property.key} value={property.key}>{property.label}</option>
                  ))}
                </select>
              ) : (
                <p className="automation-bind-form-note">
                  No teammate field exists yet. Saving this rule will create an
                  <strong> Assignee </strong>
                  field for the card types in scope and use it automatically.
                </p>
              )}
            </div>
          ) : null}

          <div className="automation-form-row automation-form-row-2">
            <div>
              <label className="automation-label">Apply to</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleTargetType(e.target.value as BehaviorTargetType)}
                value={simpleTargetType}
              >
                <option value="workspace">Workspace</option>
                <option value="boardType">Board type</option>
                <option value="board">Board</option>
                <option value="cardType">Card type</option>
                <option value="tag">Tag</option>
              </select>
            </div>
            <div>
              <label className="automation-label">Target</label>
              <select
                className="settings-select"
                onChange={(e) => setSimpleTargetId(e.target.value)}
                value={simpleTargetId}
              >
                {simpleTargetOptions.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="automation-checkbox">
            <input
              checked={simpleEnabled}
              onChange={(e) => setSimpleEnabled(e.target.checked)}
              type="checkbox"
            />
            Enable rule immediately
          </label>

          <div className="automation-form-actions">
            <Button
              disabled={!canSaveSimple || saveSimplePack.isPending}
              onClick={() => saveSimplePack.mutate()}
              size="sm"
            >
              {editingSimplePackId ? 'Save rule' : 'Create rule'}
            </Button>
            {editingSimplePackId ? (
              <Button size="sm" tone="ghost" onClick={resetSimpleForm}>
                New rule
              </Button>
            ) : null}
          </div>

          {simpleDiagnostics.length ? (
            <div className="automation-diagnostics">
              {simpleDiagnostics.map((diagnostic, index) => (
                <div key={`simple-diagnostic-${index}`} className="diagnostic-card">
                  <p className="diagnostic-level">
                    {diagnostic.level}
                    {diagnostic.ruleName ? ` · ${diagnostic.ruleName}` : ''}
                  </p>
                  <p className="diagnostic-msg">{diagnostic.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Simple rules list */}
        <div className="automation-list">
          {simplePacks.length ? simplePacks.map((pack) => {
            const config = pack.simpleRuleConfig!
            const binding = simpleBindingsByPackId.get(pack.id)
            return (
              <div
                key={pack.id}
                className={`automation-list-item${pack.id === editingSimplePackId ? ' active' : ''}`}
              >
                <div className="automation-list-item-main">
                  <div>
                    <p className="automation-list-item-name">{pack.name}</p>
                    <p className="automation-list-item-detail">
                      {describeSimpleTrigger(config)} · {describeSimpleAction(config.action, data)}
                    </p>
                    <p className="automation-list-item-meta">
                      {config.targetType} · {getTargetOptions(config.targetType, data).find((target) => target.id === config.targetId)?.label ?? config.targetId}
                    </p>
                  </div>
                  <div className="automation-list-item-actions">
                    <button
                      aria-checked={binding?.enabled ?? config.enabled}
                      aria-label={`${(binding?.enabled ?? config.enabled) ? 'Disable' : 'Enable'} ${pack.name}`}
                      className="automation-toggle"
                      role="switch"
                      disabled={toggleSimplePack.isPending}
                      onClick={() => {
                        toggleSimplePack.mutate(pack)
                      }}
                      type="button"
                    >
                      <span />
                    </button>
                    <Button size="sm" tone="ghost" onClick={() => loadSimplePackIntoForm(pack)}>
                      Edit
                    </Button>
                    <Button size="sm" tone="ghost" onClick={() => {
                      setShowAdvanced(true)
                      setSelectedPackId(pack.id)
                    }}>
                      <Code2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          }) : (
            <div className="automation-empty">No simple rules yet.</div>
          )}
        </div>
      </section>

      {/* Advanced mode toggle */}
      <button
        className="automation-advanced-toggle"
        onClick={() => setShowAdvanced((s) => !s)}
        type="button"
      >
        {showAdvanced ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>Advanced mode</span>
        <span className="automation-advanced-toggle-meta">
          {behaviorPacks.length} pack{behaviorPacks.length !== 1 ? 's' : ''}
        </span>
      </button>

      {showAdvanced ? (
        <section className="automation-section automation-advanced">
          {/* Advanced nav */}
          <div className="automation-advanced-nav">
            {(['packs', 'bindings', 'runs'] as const).map((s) => (
              <button
                key={s}
                className={`automation-advanced-nav-item${advancedSection === s ? ' active' : ''}`}
                onClick={() => setAdvancedSection(s)}
                type="button"
              >
                {s === 'packs' && 'Packs'}
                {s === 'bindings' && `Bindings (${behaviorBindings.length})`}
                {s === 'runs' && `Runs (${automationRuns.length})`}
              </button>
            ))}
          </div>

          {advancedSection === 'packs' && (
            <div className="automation-advanced-panel">
              <form
                onSubmit={(e) => { e.preventDefault(); if (packName.trim()) createPack.mutate() }}
                className="automation-inline-form"
              >
                <Input
                  onChange={(e) => setPackName(e.target.value)}
                  placeholder="New behavior pack…"
                  value={packName}
                />
                <Button type="submit" disabled={!packName.trim()} size="sm">Create</Button>
              </form>

              <div className="automation-pack-list">
                {behaviorPacks.length ? behaviorPacks.map((pack) => (
                  <div
                    key={pack.id}
                    className={`automation-pack-item${pack.id === selectedPackId ? ' active' : ''}`}
                  >
                    <div className="automation-pack-item-head">
                      <div>
                        <p className="automation-pack-item-name">{pack.name}</p>
                        <p className="automation-pack-item-meta">
                          {pack.status}
                          {pack.authoringMode ? ` · ${pack.authoringMode}` : ''}
                          {pack.compileDiagnostics.length ? ` · ${pack.compileDiagnostics.length} diagnostic${pack.compileDiagnostics.length !== 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        tone={pack.id === selectedPackId ? 'primary' : 'ghost'}
                        onClick={() => setSelectedPackId(pack.id)}
                      >
                        {pack.id === selectedPackId ? 'Selected' : 'Select'}
                      </Button>
                    </div>
                    {pack.id === selectedPackId && (
                      <div className="automation-pack-editor">
                        <textarea
                          className="settings-textarea"
                          onChange={(e) => setPackSource(e.target.value)}
                          placeholder={'rule Tag moved cards\nwhen card moved\nadd tag priority'}
                          value={packSource}
                          rows={6}
                        />
                        <div className="automation-pack-editor-actions">
                          <Button size="sm" disabled={!selectedPack || packSource === selectedPack.source} onClick={() => saveSource.mutate()}>
                            Save
                          </Button>
                          <Button size="sm" tone="ghost" disabled={!selectedPack} onClick={() => selectedPack && compile.mutate(selectedPack.id)}>
                            Compile
                          </Button>
                          <Button size="sm" tone="ghost" disabled={!selectedPack || selectedPack.authoringMode === 'simple'} onClick={() => selectedPack && activate.mutate(selectedPack.id)}>
                            Activate
                          </Button>
                          <Button size="sm" tone="ghost" disabled={pack.status === 'archived' || pack.authoringMode === 'simple'} onClick={() => archive.mutate(pack.id)}>
                            Archive
                          </Button>
                        </div>
                        {selectedPack?.compileDiagnostics.length ? (
                          <div className="automation-diagnostics">
                            {selectedPack.compileDiagnostics.map((d, i) => (
                              <div key={`${selectedPack.id}-${i}`} className="diagnostic-card">
                                <p className="diagnostic-level">{d.level}{d.ruleName ? ` · ${d.ruleName}` : ''}</p>
                                <p className="diagnostic-msg">{d.message}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {/* Binding creation for selected pack */}
                        <div className="automation-bind-form">
                          <p className="automation-bind-form-title">Create binding</p>
                          {selectedPack?.authoringMode === 'simple' ? (
                            <p className="automation-bind-form-note">Simple packs manage a single binding in the simple editor.</p>
                          ) : (
                            <>
                              <div className="automation-form-row automation-form-row-3">
                                <select
                                  className="settings-select"
                                  value={bindTargetType}
                                  onChange={(e) => setBindTargetType(e.target.value as BehaviorPackData['allowedTargetTypes'][number])}
                                >
                                  {(selectedPack?.allowedTargetTypes ?? ['workspace','boardType','board','cardType','tag']).map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <select
                                  className="settings-select"
                                  value={bindTargetId}
                                  onChange={(e) => setBindTargetId(e.target.value)}
                                >
                                  {targetOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                                <Input
                                  onChange={(e) => setBindPriority(e.target.value)}
                                  placeholder="Priority"
                                  type="number"
                value={bindPriority}
              />
                              </div>
                              <Button
                                size="sm"
                                disabled={!selectedPack || !bindTargetId}
                                onClick={() => bind.mutate()}
                              >
                                Create binding
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="automation-empty">No behavior packs yet.</div>
                )}
              </div>
            </div>
          )}

          {advancedSection === 'bindings' && (
            <div className="automation-advanced-panel">
              <div className="automation-binding-list">
                {behaviorBindings.length ? behaviorBindings.map((b) => (
                  <div key={b.id} className="automation-binding-row">
                    <div className="automation-binding-main">
                      <div>
                        <p className="automation-binding-pack">{b.packName ?? 'Behavior pack'}</p>
                        <p className="automation-binding-target">
                          {b.targetType} · {getBindingTargetLabel(b, data) ?? b.targetId}
                        </p>
                      </div>
                      <div className="automation-binding-actions">
                        <button
                          aria-checked={b.enabled}
                          aria-label={`${b.enabled ? 'Disable' : 'Enable'} binding for ${b.packName ?? 'behavior pack'}`}
                          className="automation-toggle"
                          role="switch"
                          disabled={b.packAuthoringMode === 'simple'}
                          onClick={() => toggleBind.mutate({ bindingId: b.id, enabled: !b.enabled })}
                          type="button"
                        >
                          <span />
                        </button>
                        <button
                          aria-label="Remove binding"
                          className="automation-trash-btn"
                          disabled={b.packAuthoringMode === 'simple'}
                          onClick={() => unbind.mutate(b.id)}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <p className="automation-binding-meta">
                      Priority {b.priority}{b.packAuthoringMode ? ` · ${b.packAuthoringMode}` : ''}
                    </p>
                  </div>
                )) : (
                  <div className="automation-empty">No bindings yet.</div>
                )}
              </div>
            </div>
          )}

          {advancedSection === 'runs' && (
            <div className="automation-advanced-panel">
              <div className="automation-run-list">
                {visibleAutomationRuns.length ? visibleAutomationRuns.map((run) => (
                  <div key={run._id ?? `${run.eventName}-${run.createdAt}`} className="automation-run-item">
                    <div className="automation-run-head">
                      <div className="automation-run-event">
                        <Play size={12} />
                        <span>{run.eventName}</span>
                      </div>
                      <span className={`automation-status-badge ${run.status}`}>{formatRunStatus(run)}</span>
                    </div>
                    <p className="automation-run-stats">
                      {run.actionsExecuted}/{run.actionsPlanned} actions · {run.matchedRuleIds.length} rules
                    </p>
                    {(run.guardReason || run.error) && (
                      <p className="automation-run-message">{run.guardReason ?? run.error}</p>
                    )}
                    {run.trace.length > 0 && (
                      <div className="automation-run-trace">
                        {run.trace.map((step, i) => (
                          <div key={`${run._id ?? run.createdAt}-${i}`} className="automation-run-trace-step">
                            <span className="automation-run-trace-name">{step.ruleName}</span>
                            <span className={`automation-status-badge ${step.status}`}>{step.status}</span>
                            {step.detail && <span className="automation-run-trace-detail">{step.detail}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="automation-run-time">{new Date(run.createdAt).toLocaleString()}</span>
                  </div>
                )) : (
                  <div className="automation-empty">No automation runs yet.</div>
                )}
              </div>
              {automationRuns.length > 6 ? (
                <div className="automation-show-more">
                  <Button size="sm" tone="ghost" onClick={() => setShowAllRuns((v) => !v)}>
                    {showAllRuns ? 'Show latest 6' : 'Show more'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
