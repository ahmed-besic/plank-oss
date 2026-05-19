import type { PropertyEditorProps } from "@plank/plugin-sdk";
import { taskPriorityOptions } from "../manifest";

export function PriorityEditor({ onChange, value }: PropertyEditorProps) {
  return (
    <select
      className="w-full rounded-lg border border-border-subtle bg-cloud-white px-3 py-2 text-sm text-text-primary outline-none focus:border-electric-violet"
      onChange={(event) => onChange(event.target.value)}
      value={typeof value === "string" ? value : "medium"}
    >
      {taskPriorityOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
