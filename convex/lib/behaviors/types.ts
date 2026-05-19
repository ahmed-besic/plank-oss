import type {
  BehaviorAction,
  BehaviorCompileDiagnostic,
  BehaviorEventName,
  CompiledBehaviorProgram,
  TraceStep,
} from "@plank/domain";
import type { Doc, Id } from "../../_generated/dataModel";
import type { CardEventPayload } from "@plank/domain";

export interface ParsedBehaviorBranch {
  condition?: string;
  actions: BehaviorAction[];
}

export interface ParsedBehaviorRule {
  id: string;
  name: string;
  trigger: {
    eventName: BehaviorEventName;
    propertyKey?: string;
  };
  branches: ParsedBehaviorBranch[];
}

export interface ParseResult {
  rules: ParsedBehaviorRule[];
  diagnostics: BehaviorCompileDiagnostic[];
}

export interface CompileResult {
  program?: CompiledBehaviorProgram;
  diagnostics: BehaviorCompileDiagnostic[];
}

export interface ValidatorContext {
  workspaceId: Id<"workspaces">;
  statusKeys: Set<string>;
  propertyKeys: Set<string>;
  tagKeys: Set<string>;
  memberUserIds: Set<string>;
}

export interface RuleMatchResult {
  actions: BehaviorAction[];
  trace: TraceStep[];
}

export interface EvaluatorInput {
  event: CardEventPayload;
  program: CompiledBehaviorProgram;
}

export interface RuntimeCardContext {
  card: Doc<"cards">;
  board: Doc<"boards">;
}

export interface ExecutionOutcome {
  trace: TraceStep[];
  actionsExecuted: number;
  actionsPlanned: number;
  matchedRuleIds: string[];
  stop: boolean;
}

export type GuardState = {
  startedAt: number;
  actionsPlanned: number;
  actionsExecuted: number;
  matchedRules: number;
};
