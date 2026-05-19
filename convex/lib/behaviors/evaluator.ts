import type { BehaviorAction, CardEventPayload, CompiledBehaviorProgram, TraceStep } from "@plank/domain";

function parseLiteral(raw: string): string | number | boolean | null | undefined {
  const value = raw.trim();
  if (value === "null") {
    return null;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return undefined;
}

function evaluateCondition(condition: string | undefined, event: CardEventPayload) {
  if (!condition) {
    return true;
  }

  const normalized = condition.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  if (normalized.startsWith("status is ")) {
    return event.statusKey === normalized.slice("status is ".length).trim();
  }
  if (normalized.startsWith("previous status is ")) {
    return event.previousStatusKey === normalized.slice("previous status is ".length).trim();
  }
  if (normalized.startsWith("next status is ")) {
    return event.nextStatusKey === normalized.slice("next status is ".length).trim();
  }
  if (normalized.startsWith("has tag ")) {
    const tagKey = normalized.slice("has tag ".length).trim();
    return (event.tagIds ?? []).includes(tagKey);
  }
  if (normalized.startsWith("property ") && normalized.endsWith(" changed")) {
    const key = normalized.slice("property ".length, -" changed".length).trim();
    return (event.changedPropertyKeys ?? []).includes(key);
  }

  const equalsMatch = /^property\s+([a-zA-Z0-9_:-]+)\s+equals\s+(.+)$/i.exec(condition);
  if (equalsMatch) {
    const key = equalsMatch[1];
    const expected = parseLiteral(equalsMatch[2]);
    const value = event.patch?.[key];
    if (expected === undefined) {
      return false;
    }
    return value === expected;
  }

  return false;
}

function actionLabel(action: BehaviorAction): string {
  switch (action.type) {
		case "set_property":
			return `set ${action.propertyKey}`;
		case "set_current_date":
			return `set ${action.propertyKey} to current date`;
		case "add_tag":
			return `add tag ${action.tagKey}`;
    case "remove_tag":
      return `remove tag ${action.tagKey}`;
    case "move_status":
      return `move card to status ${action.statusKey}`;
    case "notify":
      if (action.recipientUserId) {
        return `notify user ${action.recipientUserId}: ${action.message}`;
      }
      return action.recipientPropertyKey
        ? `notify ${action.recipientPropertyKey}: ${action.message}`
        : `notify ${action.message}`;
    case "stop":
      return "stop";
  }
}

export interface EvaluationResult {
  matchedRuleIds: string[];
  actions: Array<{ ruleId: string; ruleName: string; action: BehaviorAction }>;
  trace: TraceStep[];
}

export function evaluateProgram({
  event,
  program,
}: {
  event: CardEventPayload;
  program: CompiledBehaviorProgram;
}): EvaluationResult {
  const actions: Array<{ ruleId: string; ruleName: string; action: BehaviorAction }> = [];
  const matchedRuleIds: string[] = [];
  const trace: TraceStep[] = [];

  for (const rule of program.rules) {
    if (rule.trigger.eventName !== event.name) {
      continue;
    }

    if (
      rule.trigger.eventName === "property.changed" &&
      rule.trigger.propertyKey &&
      !(event.changedPropertyKeys ?? []).includes(rule.trigger.propertyKey)
    ) {
      continue;
    }

    matchedRuleIds.push(rule.id);

    const matchedBranch = rule.branches.find((branch) => evaluateCondition(branch.condition, event));
    if (!matchedBranch) {
      continue;
    }

    for (const action of matchedBranch.actions) {
      actions.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action,
      });
      trace.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: actionLabel(action),
        status: "skipped",
        detail: "planned",
      });
    }
  }

  return {
    matchedRuleIds,
    actions,
    trace,
  };
}
