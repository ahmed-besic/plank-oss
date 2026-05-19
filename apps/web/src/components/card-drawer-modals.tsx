import {
  Button,
  Input,
  TAG_COLOR_PALETTE,
  getTagChipStyle,
  getTagDotStyle,
} from '@plank/ui'
import type { BoardPageData } from '../lib/types'
import { SECTION_LABELS } from './card-drawer-draft'
import type { PendingDraftState } from './use-card-draft'

export function PendingDraftModal({
  onOpenLatest,
  onRestoreDraft,
  pendingDraft,
}: {
  onOpenLatest: () => void
  onRestoreDraft: () => void
  pendingDraft: PendingDraftState | null
}) {
  if (!pendingDraft) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-text-primary">
          Unsaved draft found
        </h3>
        <p className="mt-2 text-sm text-text-secondary">
          {pendingDraft.stale
            ? 'Server content changed since this draft was created. Restoring may overwrite newer edits.'
            : 'You have an unsaved local draft for this card.'}
        </p>
        {pendingDraft.changedSections.length ? (
          <p className="mt-2 text-xs text-text-tertiary">
            Changed on server:{' '}
            {pendingDraft.changedSections
              .map((section) => SECTION_LABELS[section])
              .join(', ')}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-text-tertiary">
          Draft saved at {new Date(pendingDraft.payload.draftSavedAt).toLocaleString()}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            onClick={onOpenLatest}
            tone="ghost"
          >
            Open latest server version
          </Button>
          <Button onClick={onRestoreDraft}>
            Restore draft anyway
          </Button>
        </div>
      </div>
    </div>
  )
}

export function SelectOptionsEditorModal({
  definition,
  draftOptions,
  onCancel,
  onChangeOptionColor,
  onChangeOptionLabel,
  onChangeOptionValue,
  onRemoveOption,
  onAddOption,
  onSave,
}: {
  definition?: BoardPageData['cardTypes'][number]['propertiesSchema'][number]
  draftOptions: Array<{ color?: string; label: string; value: string }>
  onCancel: () => void
  onChangeOptionColor: (index: number, color: string) => void
  onChangeOptionLabel: (index: number, label: string) => void
  onChangeOptionValue: (index: number, value: string) => void
  onRemoveOption: (index: number) => void
  onAddOption: () => void
  onSave: () => void
}) {
  if (!definition) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-text-primary">
          Edit options: {definition.name}
        </h3>
        <div className="mt-3 space-y-2">
          {draftOptions.map((option, index) => (
            <div
              key={`${option.value}:${index}`}
              className="grid grid-cols-[1fr_1fr_auto] gap-2"
            >
              <Input
                onChange={(event) => onChangeOptionLabel(index, event.target.value)}
                placeholder="Label"
                value={option.label}
              />
              <Input
                onChange={(event) => onChangeOptionValue(index, event.target.value)}
                placeholder="value_key"
                value={option.value}
              />
              <button
                className="rounded-lg px-2 text-xs text-text-tertiary hover:bg-zinc-100 hover:text-text-primary"
                onClick={() => onRemoveOption(index)}
                type="button"
              >
                Remove
              </button>
              <div className="col-span-full flex flex-wrap gap-2 pt-1">
                {TAG_COLOR_PALETTE.map((paletteOption) => {
                  const selected = (option.color ?? 'violet') === paletteOption.key
                  return (
                    <button
                      key={`${option.value}:${paletteOption.key}`}
                      aria-label={`Set ${option.label || 'option'} to ${paletteOption.label}`}
                      className={`schema-tag-color-button schema-tag-color-button-compact${selected ? ' is-selected' : ''}`}
                      onClick={() => onChangeOptionColor(index, paletteOption.key)}
                      style={getTagChipStyle(paletteOption.key, { selected })}
                      type="button"
                    >
                      <span
                        className="schema-tag-color-swatch"
                        style={getTagDotStyle(paletteOption.key)}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          className="mt-3 rounded-lg px-2 py-1 text-xs font-medium text-text-tertiary hover:bg-zinc-100 hover:text-text-primary"
          onClick={onAddOption}
          type="button"
        >
          + Add option
        </button>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            onClick={onCancel}
            tone="ghost"
          >
            Cancel
          </Button>
          <Button onClick={onSave}>
            Save options
          </Button>
        </div>
      </div>
    </div>
  )
}
