import type { PropertyOption } from "./board";

export const DEFAULT_PRIORITY_PROPERTY_OPTIONS: PropertyOption[] = [
  { label: "Low", value: "low", color: "green" },
  { label: "Medium", value: "medium", color: "amber" },
  { label: "High", value: "high", color: "red" },
];

export function normalizePropertyOptions(args: {
  enumOptions?: PropertyOption[];
  enumValues?: string[];
}): PropertyOption[] | undefined {
  if (Array.isArray(args.enumOptions) && args.enumOptions.length > 0) {
    return args.enumOptions.map((option) => ({
      label: option.label,
      value: option.value,
      color: option.color,
    }));
  }

  if (Array.isArray(args.enumValues) && args.enumValues.length > 0) {
    return args.enumValues.map((value) => ({
      label: value,
      value,
    }));
  }

  return undefined;
}

