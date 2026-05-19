import { BlockNoteSchema } from '@blocknote/core'
import { createReactInlineContentSpec } from '@blocknote/react'

const mentionInlineSpec = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      userId: {
        default: '',
      },
      label: {
        default: '',
      },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent, contentRef }) => (
      <span
        ref={contentRef}
        className="rounded-md bg-electric-violet/10 px-1 py-0.5 font-medium text-electric-violet"
      >
        @{inlineContent.props.label}
      </span>
    ),
  },
)

export const cardDrawerSchema = BlockNoteSchema.create().extend({
  inlineContentSpecs: {
    mention: mentionInlineSpec,
  },
})
