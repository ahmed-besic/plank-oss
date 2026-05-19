import type { BehaviorAction, BehaviorCompileDiagnostic, BehaviorEventName } from "@plank/domain";
import type { ParseResult, ParsedBehaviorRule } from "./types";

function toRuleId(name: string, index: number) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `rule_${index + 1}_${slug}` : `rule_${index + 1}`;
}

function parseTrigger(input: string): { eventName: BehaviorEventName; propertyKey?: string } | null {
  const normalized = input.trim().toLowerCase();
  if (normalized === "card created") {
    return { eventName: "card.created" };
  }
  if (normalized === "card updated") {
    return { eventName: "card.updated" };
  }
  if (normalized === "card moved") {
    return { eventName: "card.moved" };
  }
  if (normalized === "card deleted") {
    return { eventName: "card.deleted" };
  }
  if (normalized === "tag applied") {
    return { eventName: "tag.applied" };
  }
  if (normalized.startsWith("property changed ")) {
    const propertyKey = normalized.slice("property changed ".length).trim();
    if (!propertyKey) {
      return null;
    }
    return {
      eventName: "property.changed",
      propertyKey,
    };
  }
  return null;
}

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

function parseAction(input: string): BehaviorAction | null {
  const trimmed = input.trim();

  if (trimmed.startsWith("set ")) {
    const currentDateMatch = /^set\s+([a-zA-Z0-9_:-]+)\s+to\s+(current date|now)$/i.exec(trimmed);
    if (currentDateMatch) {
      return {
        type: "set_current_date",
        propertyKey: currentDateMatch[1],
      };
    }

    const match = /^set\s+([a-zA-Z0-9_:-]+)\s+to\s+(.+)$/i.exec(trimmed);
    if (!match) {
      return null;
    }
    const parsedValue = parseLiteral(match[2]);
    if (parsedValue === undefined) {
      return null;
    }
    return {
      type: "set_property",
      propertyKey: match[1],
      value: parsedValue,
    };
  }

  if (trimmed.startsWith("add tag ")) {
    const tagKey = trimmed.slice("add tag ".length).trim();
    if (!tagKey) {
      return null;
    }
    return {
      type: "add_tag",
      tagKey,
    };
  }

  if (trimmed.startsWith("remove tag ")) {
    const tagKey = trimmed.slice("remove tag ".length).trim();
    if (!tagKey) {
      return null;
    }
    return {
      type: "remove_tag",
      tagKey,
    };
  }

  if (trimmed.startsWith("move card to status ")) {
    const statusKey = trimmed.slice("move card to status ".length).trim();
    if (!statusKey) {
      return null;
    }
    return {
      type: "move_status",
      statusKey,
    };
  }

  if (trimmed.startsWith("notify ")) {
    const notifyPayload = trimmed.slice("notify ".length).trim();
    const separatorIndex = notifyPayload.indexOf(":");
    if (separatorIndex > 0) {
      const recipientTarget = notifyPayload.slice(0, separatorIndex).trim();
      const message = notifyPayload.slice(separatorIndex + 1).trim();
      if (!recipientTarget || !message) {
        return null;
      }
      const directRecipientMatch = /^user\s+(.+)$/i.exec(recipientTarget);
      if (directRecipientMatch) {
        const recipientUserId = directRecipientMatch[1]?.trim();
        if (!recipientUserId) {
          return null;
        }
        return {
          type: "notify",
          recipientUserId,
          message,
        };
      }
      return {
        type: "notify",
        recipientPropertyKey: recipientTarget,
        message,
      };
    }
    const message = notifyPayload.trim();
    if (!message) {
      return null;
    }
    return {
      type: "notify",
      message,
    };
  }

  if (trimmed === "stop") {
    return {
      type: "stop",
    };
  }

  return null;
}

function pushDiagnostic(
  diagnostics: BehaviorCompileDiagnostic[],
  message: string,
  line: number,
  ruleName?: string,
) {
  diagnostics.push({
    level: "error",
    message,
    line,
    ruleName,
  });
}

export function parseBehaviorSource(source: string): ParseResult {
  const diagnostics: BehaviorCompileDiagnostic[] = [];
  const rules: ParsedBehaviorRule[] = [];
  const lines = source.split(/\r?\n/);

  let currentRule: ParsedBehaviorRule | null = null;

  const ensureActiveRule = (lineNumber: number): ParsedBehaviorRule | null => {
    if (!currentRule) {
      pushDiagnostic(diagnostics, "Expected `rule <Name>` before this line", lineNumber);
      return null;
    }
    return currentRule;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const rawLine = lines[i] ?? "";
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.toLowerCase().startsWith("rule ")) {
      const name = line.slice(5).trim();
      if (!name) {
        pushDiagnostic(diagnostics, "Rule name is required", lineNumber);
        currentRule = null;
        continue;
      }
      currentRule = {
        id: toRuleId(name, rules.length),
        name,
        trigger: {
          eventName: "card.updated",
        },
        branches: [{ actions: [] }],
      };
      rules.push(currentRule);
      continue;
    }

    if (line.toLowerCase().startsWith("when ")) {
      const activeRule = ensureActiveRule(lineNumber);
      if (!activeRule) {
        continue;
      }
      const trigger = parseTrigger(line.slice(5));
      if (!trigger) {
        pushDiagnostic(diagnostics, `Unsupported trigger: ${line.slice(5).trim()}`, lineNumber, activeRule.name);
        continue;
      }
      activeRule.trigger = trigger;
      continue;
    }

    if (line.toLowerCase().startsWith("if ")) {
      const activeRule = ensureActiveRule(lineNumber);
      if (!activeRule) {
        continue;
      }
      const condition = line.slice(3).trim();
      if (!condition) {
        pushDiagnostic(diagnostics, "`if` requires a condition", lineNumber, activeRule.name);
        continue;
      }
      activeRule.branches = [{ condition, actions: [] }];
      continue;
    }

    if (line.toLowerCase().startsWith("elif ")) {
      const activeRule = ensureActiveRule(lineNumber);
      if (!activeRule) {
        continue;
      }
      if (!activeRule.branches.some((branch) => branch.condition !== undefined)) {
        pushDiagnostic(diagnostics, "`elif` requires a previous `if` branch", lineNumber, activeRule.name);
        continue;
      }
      const condition = line.slice(5).trim();
      if (!condition) {
        pushDiagnostic(diagnostics, "`elif` requires a condition", lineNumber, activeRule.name);
        continue;
      }
      activeRule.branches.push({ condition, actions: [] });
      continue;
    }

    if (line.toLowerCase() === "else") {
      const activeRule = ensureActiveRule(lineNumber);
      if (!activeRule) {
        continue;
      }
      if (!activeRule.branches.some((branch) => branch.condition !== undefined)) {
        pushDiagnostic(diagnostics, "`else` requires a previous `if` branch", lineNumber, activeRule.name);
        continue;
      }
      activeRule.branches.push({ actions: [] });
      continue;
    }

    const activeRule = ensureActiveRule(lineNumber);
    if (!activeRule) {
      continue;
    }

    const action = parseAction(line);
    if (!action) {
      pushDiagnostic(diagnostics, `Unsupported action syntax: ${line}`, lineNumber, activeRule.name);
      continue;
    }

    if (activeRule.branches.length === 0) {
      activeRule.branches.push({ actions: [] });
    }
    activeRule.branches[activeRule.branches.length - 1]?.actions.push(action);
  }

  for (const rule of rules) {
    if (rule.branches.every((branch) => branch.actions.length === 0)) {
      diagnostics.push({
        level: "error",
        message: "Rule must include at least one action",
        ruleName: rule.name,
      });
    }
  }

  return { rules, diagnostics };
}
