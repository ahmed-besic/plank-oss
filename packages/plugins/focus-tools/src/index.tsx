import { defineClientPlugin } from "@plank/plugin-sdk";
import type {
  PropertyEditorProps,
  UiExtensionRenderProps,
  ViewRenderProps,
} from "@plank/plugin-sdk";
import {
  confidencePropertyType,
  focusToolsManifest,
} from "./manifest";

export { focusBoardTemplate } from "./manifest";

function normalizeConfidence(value: unknown) {
  const candidate =
    typeof value === "number" && Number.isFinite(value) ? value : 3;
  return Math.max(1, Math.min(5, Math.round(candidate)));
}

function ConfidenceBars({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`h-1.5 w-6 rounded-full ${
            index < value ? "bg-amber-500" : "bg-zinc-200"
          }`}
        />
      ))}
    </div>
  );
}

function ConfidenceEditor({ value, onChange }: PropertyEditorProps) {
  const current = normalizeConfidence(value);

  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 5 }).map((_, index) => {
        const nextValue = index + 1;
        return (
          <button
            key={nextValue}
            className={`rounded-md px-3 py-1 text-sm font-medium transition ${
              nextValue === current
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-700"
            }`}
            onClick={() => onChange(nextValue)}
            type="button"
          >
            {nextValue}
          </button>
        );
      })}
    </div>
  );
}

function FocusView({ cards, cardTypes, boardType, actions }: ViewRenderProps) {
  const cardTypeById = new Map(
    cardTypes.map((cardType) => [cardType.id, cardType]),
  );
  const statusLabelByKey = new Map(
    boardType.lifecycleConfig.statuses.map((status) => [
      status.key,
      status.label,
    ]),
  );

  const scored = cards
    .map((card) => {
      const mergedFields = { ...card.fields.core, ...card.fields.custom };
      const cardType = cardTypeById.get(card.typeKey);
      const confidenceProperty = cardType?.propertiesSchema.find(
        (definition) => definition.type === confidencePropertyType,
      );
      const score = confidenceProperty
        ? normalizeConfidence(mergedFields[confidenceProperty.key])
        : 3;
      return {
        card,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Focus</h2>
          </div>
          <p className="text-sm text-zinc-500">
            Cards are ranked by the custom confidence property.
          </p>
        </div>
        <div className="space-y-3">
          {scored.map(({ card, score }) => (
            <button
              key={card.id}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-white"
              onClick={() => actions.openCard(card.id)}
              type="button"
            >
              <div>
                <p className="font-semibold text-zinc-900">{card.meta.title}</p>
                <p className="text-sm text-zinc-500">
                  {statusLabelByKey.get(card.statusKey) ?? card.statusKey}
                </p>
              </div>
              <ConfidenceBars value={score} />
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-zinc-900">
          Triage what needs confidence first.
        </h3>
        <p className="mt-3 text-sm text-zinc-600">
          Teams can use this view to quickly find uncertain work and discuss it
          before it drifts through the board.
        </p>
      </section>
    </div>
  );
}

function ConfidencePanel({ card, cardType }: UiExtensionRenderProps) {
  if (!card) {
    return null;
  }

  const confidenceProperty = cardType?.propertiesSchema.find(
    (definition) => definition.type === confidencePropertyType,
  );
  if (!confidenceProperty) {
    return (
      <p className="text-sm text-slate-500">
        Add the confidence property from the command palette to activate this
        slot.
      </p>
    );
  }

  const mergedFields = { ...card.fields.core, ...card.fields.custom };
  const value = normalizeConfidence(mergedFields[confidenceProperty.key]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500">Confidence</p>
      <ConfidenceBars value={value} />
    </div>
  );
}

export const focusToolsPlugin = defineClientPlugin(
  focusToolsManifest,
  ({
    registerView,
    registerPropertyType,
    registerCommand,
    registerUiExtension,
  }) => {
    registerView({
      id: "focus-tools:focus-view",
      label: "Focus",
      description: "Sort work by confidence.",
      render: (props) => <FocusView {...props} />,
    });

    registerPropertyType({
      id: confidencePropertyType,
      label: "Confidence",
      description: "How confident is the team about this card?",
      getDefaultValue: () => 3,
      renderValue: (value) => (
        <ConfidenceBars value={normalizeConfidence(value)} />
      ),
      renderEditor: (props) => <ConfidenceEditor {...props} />,
    });

    registerCommand({
      id: "focus-tools:add-confidence-property",
      label: "Add confidence property",
      keywords: ["confidence", "focus", "property"],
      run: async ({ services }) => {
        await services.properties.add("Confidence", confidencePropertyType, {});
        services.toast.show("Confidence property added.");
      },
    });

    registerUiExtension({
      id: "focus-tools:confidence-slot",
      slot: "card.drawer.panels",
      label: "Focus confidence",
      order: -10,
      requiredPermissions: ["cards:read"],
      render: (props) => <ConfidencePanel {...props} />,
    });
  },
);
