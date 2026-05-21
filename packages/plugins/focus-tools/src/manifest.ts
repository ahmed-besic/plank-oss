import type { PlankBoardTypeTemplate } from "@plank/plugin-sdk";
import type { PluginManifest } from "@plank/domain";

export const confidencePropertyType = "focus-tools:confidence";

export const focusToolsManifest: PluginManifest = {
  id: "focus-tools",
  name: "Focus tools",
  version: "1.0.0",
  hooks: [
    "registerView",
    "registerPropertyType",
    "registerCommand",
    "registerUiExtension",
    "registerCardChange",
    "registerBoardTypeTemplate",
  ],
  capabilities: ["cards:read", "cards:write", "boardViews:read"],
  trustLevel: "trusted-local",
  description: "Adds a focus-oriented view and confidence scoring.",
  serverModule: "./server",
};

export const focusBoardTemplate: PlankBoardTypeTemplate = {
  id: "focus-tools:default",
  name: "Focus Board",
  description: "A board that opens with work ranked by confidence.",
  defaultLifecycleStatuses: [
    { key: "triage", label: "Triage", category: "todo", orderKey: "a0" },
    { key: "focus", label: "Focus", category: "active", orderKey: "a1" },
    { key: "resolved", label: "Resolved", category: "done", orderKey: "a2" },
  ],
  defaultViewIds: ["focus-tools:focus-view"],
  version: 1,
};

export const focusToolsClientSummaries = {
  views: [
    {
      id: "focus-tools:focus-view",
      label: "Focus",
      description: "Sort work by confidence.",
    },
  ],
  propertyTypes: [
    {
      id: confidencePropertyType,
      label: "Confidence",
      description: "How confident is the team about this card?",
    },
  ],
  commands: [
    {
      id: "focus-tools:add-confidence-property",
      label: "Add confidence property",
      keywords: ["confidence", "focus", "property"],
    },
  ],
  uiExtensions: [
    {
      id: "focus-tools:confidence-slot",
      slot: "card.sidebar.panels" as const,
      label: "Focus confidence",
      order: -10,
      requiredPermissions: ["cards:read" as const],
    },
  ],
};
