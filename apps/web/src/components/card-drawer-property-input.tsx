import type { PlankPropertyTypeDefinition } from '@plank/plugin-sdk'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getTagChipStyle, TAG_COLOR_PALETTE } from '@plank/ui'
import type { BoardPageData } from '../lib/types'

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
  const [tempLabel, setTempLabel] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
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
      if (containerRef.current?.contains(event.target as Node)) {
        return
      }
      setOpen(false)
      setEditingOptionValue(null)
      setColorPickerOptionValue(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

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
    const nextColor = TAG_COLOR_PALETTE[options.length % TAG_COLOR_PALETTE.length]?.key ?? 'violet'
    const newOptionVal = `option_${Date.now()}`
    const newOption = {
      label: 'New option',
      value: newOptionVal,
      color: nextColor,
    }
    const updatedOptions = [...options, newOption]
    onUpdateOptions?.(updatedOptions)
    setEditingOptionValue(newOptionVal)
    setTempLabel('New option')
  }

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
        <div className="absolute left-0 top-full z-30 mt-2 min-w-[280px] rounded-xl border border-border-subtle bg-cloud-white p-1.5 shadow-2xl">
          <button
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
              !selectedValue
                ? 'bg-surface-sunken text-text-primary font-medium'
                : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
            }`}
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            type="button"
          >
            <span>No value</span>
          </button>

          <div className="my-1 border-t border-zinc-100" />

          <div className="space-y-0.5 max-h-60 overflow-y-auto pr-0.5">
            {options.map((option) => {
              const selected = selectedValue === option.value
              const optionColor = getOptionColor(option)
              const isEditing = editingOptionValue === option.value
              const swatchColor = TAG_COLOR_PALETTE.find((c) => c.key === optionColor)?.swatch ?? '#A78BFA'

              return (
                <div
                  key={option.value}
                  className={`group relative flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    selected ? 'bg-surface-sunken/60 text-text-primary' : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary'
                  }`}
                >
                  {/* Left part: Color Selector swatch button */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Change color"
                      className="p-1 rounded-md hover:bg-zinc-200 transition flex items-center justify-center"
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

                    {/* Color Picker Dropdown (Absolute layout) */}
                    {colorPickerOptionValue === option.value && (
                      <div className="absolute left-8 top-0 z-50 flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl max-h-48 overflow-y-auto w-32">
                        {TAG_COLOR_PALETTE.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition w-full text-left"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleColorChange(option.value, c.key)
                            }}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: c.swatch }}
                            />
                            <span className="truncate">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Middle part: Option Label or Rename Input */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        className="h-7 w-full rounded-lg border border-electric-violet bg-white px-2 py-0.5 text-xs text-text-primary outline-none focus:ring-1 focus:ring-electric-violet"
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
                      <button
                        type="button"
                        className="w-full text-left truncate font-medium flex items-center"
                        onClick={() => {
                          onChange(option.value)
                          setOpen(false)
                        }}
                      >
                        <span
                          className="tag-chip font-medium"
                          style={getTagChipStyle(optionColor, { selected })}
                        >
                          {option.label}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Right part: Actions (Pencil & Trash icons, visible on hover) */}
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        aria-label="Rename option"
                        className="p-1 text-text-tertiary rounded-md hover:bg-zinc-200 hover:text-text-primary transition"
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
                        className="p-1 text-text-tertiary rounded-md hover:bg-zinc-200 hover:text-red-600 transition"
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

          <div className="my-1 border-t border-zinc-100" />

          {/* Add Option Trigger button */}
          {onUpdateOptions ? (
            <button
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-200 py-2 text-xs font-semibold text-text-tertiary transition hover:border-zinc-300 hover:bg-surface-sunken hover:text-text-primary"
              onClick={handleAddOption}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              Add option
            </button>
          ) : null}
        </div>
      ) : null}
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
