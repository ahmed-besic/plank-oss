import type { PlankPropertyTypeDefinition } from '@plank/plugin-sdk'
import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getTagChipStyle, TAG_COLOR_PALETTE } from '@plank/ui'
import type { BoardPageData } from '../lib/types'

const NEW_OPTION_COLOR_PICKER_VALUE = '__new_option__'

function getOptionColor(option: { label: string; value: string; color?: string }) {
  if (option.color) {
    return option.color
  }
  const lbl = option.label.toLowerCase()
  const val = option.value.toLowerCase()
  if (lbl === 'low' || val === 'low') return 'green'
  if (lbl === 'medium' || val === 'medium' || lbl === 'middle' || val === 'middle') return 'amber'
  if (lbl === 'high' || val === 'high') return 'red'
  return 'violet'
}

function getMemberLabel(member: BoardPageData['members'][number]) {
  if (member.name?.trim()) return member.name
  if (member.email?.trim()) return member.email
  return member.userId
}

function UserPropertyInput({
  members,
  onChange,
  value,
}: {
  members: BoardPageData['members']
  onChange: (value: unknown) => void
  value: unknown
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedUserIds = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string' && value
      ? [value]
      : []
  const selectedSet = new Set(selectedUserIds)
  const selectedMembers = selectedUserIds
    .map((userId) => members.find((member) => member.userId === userId))
    .filter((member): member is BoardPageData['members'][number] => Boolean(member))

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggleUser = (userId: string) => {
    const next = selectedSet.has(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId]
    onChange(next)
  }

  if (!members.length) {
    return <span className="text-sm text-text-placeholder">No teammates</span>
  }

  return (
    <div className="relative inline-block max-w-full" ref={containerRef}>
      <button
        type="button"
        aria-label="Select people"
        aria-expanded={open}
        className="inline-flex max-w-[260px] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-sm text-text-secondary transition hover:text-text-primary"
        onClick={() => setOpen((current) => !current)}
      >
        {selectedMembers.length ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="flex -space-x-1">
              {selectedMembers.slice(0, 3).map((member) => (
                <span
                  key={member.id}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-200 text-[10px] font-bold uppercase text-zinc-600"
                  title={getMemberLabel(member)}
                >
                  {getMemberLabel(member).slice(0, 1)}
                </span>
              ))}
            </span>
            <span className="truncate">
              {selectedMembers.length === 1
                ? getMemberLabel(selectedMembers[0]!)
                : `${selectedMembers.length} people`}
            </span>
          </span>
        ) : (
          <span className="text-text-placeholder">Select people</span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-border-subtle bg-cloud-white p-1.5 shadow-2xl">
          <div className="max-h-60 space-y-0.5 overflow-y-auto pr-0.5">
            {members.map((member) => {
              const selected = selectedSet.has(member.userId)
              const label = getMemberLabel(member)
              return (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={selected}
                  className={[
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition',
                    selected
                      ? 'bg-surface-sunken text-text-primary'
                      : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                  ].join(' ')}
                  onClick={() => toggleUser(member.userId)}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase',
                      selected ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-600',
                    ].join(' ')}
                  >
                    {label.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span
                    className={[
                      'flex h-4 w-4 items-center justify-center rounded border text-[10px]',
                      selected
                        ? 'border-zinc-800 bg-zinc-900 text-white'
                        : 'border-zinc-300 text-transparent',
                    ].join(' ')}
                  >
                    ✓
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SelectPropertyInput({
  definition,
  onChange,
  onUpdateOptions,
  value,
}: {
  definition: BoardPageData['cardTypes'][number]['propertiesSchema'][number]
  onChange: (value: unknown) => void
  onUpdateOptions?: ((options: Array<{ color?: string; label: string; value: string }>) => void) | undefined
  value: unknown
}) {
  const [open, setOpen] = useState(false)
  const [editingOptionValue, setEditingOptionValue] = useState<string | null>(null)
  const [colorPickerOptionValue, setColorPickerOptionValue] = useState<string | null>(null)
  const [newOptionLabel, setNewOptionLabel] = useState('')
  const [newOptionColor, setNewOptionColor] = useState('violet')
  const [tempLabel, setTempLabel] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const colorPickerMenuRef = useRef<HTMLDivElement>(null)
  const colorPickerTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const options = useMemo(
    () =>
      Array.isArray(definition.config?.options)
        ? (definition.config.options as Array<{ color?: string; label: string; value: string }>)
        : [],
    [definition.config?.options],
  )
  const selectedValue = typeof value === 'string' ? value : ''
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? null

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) {
        return
      }
      if (colorPickerMenuRef.current?.contains(target)) {
        return
      }
      if (
        colorPickerOptionValue &&
        colorPickerTriggerRefs.current[colorPickerOptionValue]?.contains(target)
      ) {
        return
      }
      setOpen(false)
      setEditingOptionValue(null)
      setColorPickerOptionValue(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [colorPickerOptionValue, open])

  const handleColorChange = (optionValue: string, newColor: string) => {
    const updatedOptions = options.map((opt) =>
      opt.value === optionValue ? { ...opt, color: newColor } : opt
    )
    onUpdateOptions?.(updatedOptions)
    setColorPickerOptionValue(null)
  }

  const handleRenameComplete = (optionValue: string) => {
    if (!tempLabel.trim()) {
      setEditingOptionValue(null)
      return
    }
    const updatedOptions = options.map((opt) =>
      opt.value === optionValue ? { ...opt, label: tempLabel.trim() } : opt
    )
    onUpdateOptions?.(updatedOptions)
    setEditingOptionValue(null)
  }

  const handleDeleteOption = (optionValue: string) => {
    const updatedOptions = options.filter((opt) => opt.value !== optionValue)
    onUpdateOptions?.(updatedOptions)
    if (selectedValue === optionValue) {
      onChange('')
    }
  }

  const handleAddOption = () => {
    const label = newOptionLabel.trim()
    if (!label) {
      return
    }
    const normalizedValue = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    const baseValue = normalizedValue || `option_${Date.now()}`
    let nextValue = baseValue
    let suffix = 2
    while (options.some((option) => option.value === nextValue)) {
      nextValue = `${baseValue}_${suffix}`
      suffix += 1
    }
    const newOption = {
      label,
      value: nextValue,
      color: newOptionColor,
    }
    const updatedOptions = [...options, newOption]
    onUpdateOptions?.(updatedOptions)
    onChange(nextValue)
    setNewOptionLabel('')
    setNewOptionColor('violet')
    setOpen(false)
  }

  const activeColorPickerRect = colorPickerOptionValue
    ? colorPickerTriggerRefs.current[colorPickerOptionValue]?.getBoundingClientRect() ?? null
    : null

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-left text-sm text-text-primary outline-none transition-all duration-200"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {selectedOption ? (
          <span
            className="tag-chip text-xs px-1.5 py-0.5 font-medium"
            style={getTagChipStyle(getOptionColor(selectedOption))}
          >
            {selectedOption.label}
          </span>
        ) : (
          <span className="text-zinc-400">Select value</span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-border-subtle bg-cloud-white p-1.5 shadow-2xl">
          <div className="space-y-0.5 max-h-60 overflow-y-auto pr-0.5">
            {options.map((option) => {
              const selected = selectedValue === option.value
              const optionColor = getOptionColor(option)
              const isEditing = editingOptionValue === option.value
              const swatchColor = TAG_COLOR_PALETTE.find((c) => c.key === optionColor)?.swatch ?? '#A78BFA'

              return (
                <div
                  key={option.value}
                  onClick={() => {
                    if (!isEditing) {
                      onChange(selected ? '' : option.value)
                      setOpen(false)
                    }
                  }}
                  className={`group relative flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    selected ? 'bg-surface-sunken/60 text-text-primary' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
                  }`}
                >
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Change color"
                      className="p-1 rounded-md hover:bg-cloud-white transition flex items-center justify-center"
                      ref={(element) => {
                        colorPickerTriggerRefs.current[option.value] = element
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setColorPickerOptionValue(
                          colorPickerOptionValue === option.value ? null : option.value
                        )
                      }}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full block border border-black/10 transition transform hover:scale-110"
                        style={{ backgroundColor: swatchColor }}
                      />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        className="h-7 w-full rounded-lg border border-border-subtle bg-surface-sunken px-2 py-0.5 text-xs text-text-primary outline-none focus:ring-1 focus:ring-border-strong"
                        value={tempLabel}
                        onChange={(e) => setTempLabel(e.target.value)}
                        onBlur={() => handleRenameComplete(option.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleRenameComplete(option.value)
                          } else if (e.key === 'Escape') {
                            setEditingOptionValue(null)
                          }
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="tag-chip max-w-[120px] truncate font-medium"
                        style={getTagChipStyle(optionColor, { selected })}
                      >
                        {option.label}
                      </span>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        aria-label="Rename option"
                        className="p-1 text-text-tertiary rounded-md hover:bg-cloud-white hover:text-text-primary transition"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingOptionValue(option.value)
                          setTempLabel(option.label)
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete option"
                        className="p-1 text-text-tertiary rounded-md hover:bg-cloud-white hover:text-red-400 transition"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteOption(option.value)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="my-1 border-t border-border-subtle" />

          {onUpdateOptions ? (
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <button
                type="button"
                aria-label="Choose new option color"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition hover:bg-cloud-white"
                ref={(element) => {
                  colorPickerTriggerRefs.current[NEW_OPTION_COLOR_PICKER_VALUE] = element
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  setColorPickerOptionValue(
                    colorPickerOptionValue === NEW_OPTION_COLOR_PICKER_VALUE
                      ? null
                      : NEW_OPTION_COLOR_PICKER_VALUE,
                  )
                }}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor:
                      TAG_COLOR_PALETTE.find((c) => c.key === newOptionColor)?.swatch ??
                      '#A78BFA',
                  }}
                />
              </button>
              <input
                className="h-8 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-sunken px-2.5 py-1 text-xs text-text-primary outline-none transition focus:ring-1 focus:ring-border-strong placeholder:text-text-placeholder"
                onChange={(event) => setNewOptionLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleAddOption()
                  }
                }}
                placeholder="New option"
                value={newOptionLabel}
              />
              <button
                className="inline-flex h-8 items-center justify-center rounded-lg bg-cloud-white px-2.5 text-xs font-semibold text-text-primary transition hover:bg-surface-sunken disabled:pointer-events-none disabled:opacity-40"
                disabled={!newOptionLabel.trim()}
                onClick={handleAddOption}
                type="button"
              >
                Add
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {open && colorPickerOptionValue && activeColorPickerRect
        ? createPortal(
            <div
              ref={colorPickerMenuRef}
              className="fixed z-[70] flex max-h-48 w-32 flex-col gap-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
              style={{
                left: activeColorPickerRect.right + 8,
                top: activeColorPickerRect.top,
              }}
            >
              {TAG_COLOR_PALETTE.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (colorPickerOptionValue === NEW_OPTION_COLOR_PICKER_VALUE) {
                      setNewOptionColor(c.key)
                      setColorPickerOptionValue(null)
                      return
                    }
                    handleColorChange(colorPickerOptionValue, c.key)
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.swatch }}
                  />
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function renderTypedPropertyInput({
  definition,
  members,
  onChange,
  onUpdateOptions,
  pluginPropertyTypeMap,
  value,
}: {
  definition: BoardPageData['cardTypes'][number]['propertiesSchema'][number]
  members: BoardPageData['members']
  onChange: (value: unknown) => void
  onUpdateOptions?: ((options: Array<{ color?: string; label: string; value: string }>) => void) | undefined
  pluginPropertyTypeMap: Map<string, PlankPropertyTypeDefinition>
  value: unknown
}) {
  const propertyType = String(definition.type)

  if (propertyType === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2 text-sm text-text-primary">
        <input
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        Enabled
      </label>
    )
  }

  if (propertyType === 'number') {
    return (
      <input
        className="inline-flex items-center rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 w-24"
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={typeof value === 'number' ? value : 0}
      />
    )
  }

  if (propertyType === 'date' || propertyType === 'timestamp') {
    const toDateValue = (v: unknown): string => {
      if (typeof v === 'string') return v
      if (typeof v === 'number' && Number.isFinite(v)) {
        return new Date(v).toISOString().slice(0, 10)
      }
      return ''
    }
    return (
      <input
        className="inline-flex items-center rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 w-36"
        onChange={(event) => {
          const str = event.target.value
          if (!str) {
            onChange(null)
            return
          }
          onChange(propertyType === 'timestamp' ? new Date(str).getTime() : str)
        }}
        type="date"
        value={toDateValue(value)}
      />
    )
  }

  if (propertyType === 'select') {
    return (
      <SelectPropertyInput
        definition={definition}
        onChange={onChange}
        onUpdateOptions={onUpdateOptions}
        value={value}
      />
    )
  }

  if (propertyType === 'user') {
    return (
      <UserPropertyInput
        members={members}
        onChange={onChange}
        value={value}
      />
    )
  }

  const pluginPropertyType = pluginPropertyTypeMap.get(definition.type)
  if (pluginPropertyType) {
    return pluginPropertyType.renderEditor({
      definition,
      value,
      onChange,
      members,
    })
  }

  return (
    <input
      className="inline-flex items-center rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 w-48 max-w-full placeholder:text-zinc-400"
      onChange={(event) => onChange(event.target.value)}
      placeholder="None"
      value={typeof value === 'string' ? value : ''}
    />
  )
}
