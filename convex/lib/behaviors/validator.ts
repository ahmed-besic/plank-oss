import type { BehaviorCompileDiagnostic } from "@plank/domain";
import type { ParsedBehaviorRule, ValidatorContext } from "./types";

function addError(
  diagnostics: BehaviorCompileDiagnostic[],
  message: string,
  ruleName?: string,
) {
  diagnostics.push({
    level: "error",
    message,
    ruleName,
  });
}

function addWarning(
  diagnostics: BehaviorCompileDiagnostic[],
  message: string,
  ruleName?: string,
) {
  diagnostics.push({
    level: "warning",
    message,
    ruleName,
  });
}

function validateDeletedTriggerCompatibility(
  diagnostics: BehaviorCompileDiagnostic[],
  rule: ParsedBehaviorRule,
) {
  if (rule.trigger.eventName !== "card.deleted") {
    return;
  }

  for (const branch of rule.branches) {
    for (const action of branch.actions) {
      if (
        action.type === "set_property" ||
        action.type === "set_current_date" ||
        action.type === "add_tag" ||
        action.type === "remove_tag" ||
        action.type === "move_status"
      ) {
        addError(
          diagnostics,
          "`when card deleted` only supports `notify` and `stop` actions",
          rule.name,
        );
      }
    }
  }
}

export function validateParsedRules({
  rules,
  context,
}: {
  rules: ParsedBehaviorRule[];
  context: ValidatorContext;
}) {
  const diagnostics: BehaviorCompileDiagnostic[] = [];
  const names = new Set<string>();

  for (const rule of rules) {
    if (names.has(rule.name)) {
      addWarning(diagnostics, `Duplicate rule name: ${rule.name}`, rule.name);
    }
    names.add(rule.name);

    if (rule.trigger.eventName === "property.changed" && !rule.trigger.propertyKey) {
      addError(diagnostics, "`when property changed` requires a property key", rule.name);
    }

    validateDeletedTriggerCompatibility(diagnostics, rule);

    for (const branch of rule.branches) {
      if (branch.actions.length === 0) {
        addWarning(diagnostics, "Branch has no actions", rule.name);
      }

      for (const action of branch.actions) {
        if (action.type === "move_status" && !context.statusKeys.has(action.statusKey)) {
          addError(diagnostics, `Unknown status key: ${action.statusKey}`, rule.name);
        }
        if (action.type === "set_property" && !context.propertyKeys.has(action.propertyKey)) {
          addError(diagnostics, `Unknown property key: ${action.propertyKey}`, rule.name);
        }
        if (action.type === "set_current_date" && !context.propertyKeys.has(action.propertyKey)) {
          addError(diagnostics, `Unknown property key: ${action.propertyKey}`, rule.name);
        }
        if (
          (action.type === "add_tag" || action.type === "remove_tag") &&
          !context.tagKeys.has(action.tagKey)
        ) {
          addError(diagnostics, `Unknown tag key: ${action.tagKey}`, rule.name);
        }
        if (
          action.type === "notify" &&
          action.recipientPropertyKey &&
          !context.propertyKeys.has(action.recipientPropertyKey)
        ) {
          addError(
            diagnostics,
            `Unknown property key: ${action.recipientPropertyKey}`,
            rule.name,
          );
        }
        if (
          action.type === "notify" &&
          action.recipientUserId &&
          !context.memberUserIds.has(action.recipientUserId)
        ) {
          addError(
            diagnostics,
            `Unknown member userId: ${action.recipientUserId}`,
            rule.name,
          );
        }
      }
    }
  }

  return diagnostics;
}
