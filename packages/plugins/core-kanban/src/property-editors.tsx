import type { PropertyEditorProps, RegisterPluginApi } from "@plank/plugin-sdk";
import { ChevronDown } from "lucide-react";

function getMemberLabel(member: PropertyEditorProps["members"][number]) {
  if (member.name?.trim()) {
    return member.name;
  }
  if (member.email?.trim()) {
    return member.email;
  }
  return member.userId;
}

function renderTextProperty({ value, onChange }: PropertyEditorProps) {
  return (
    <input
      className="inline-flex items-center rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 w-48 max-w-full placeholder:text-zinc-400"
      onChange={(event) => onChange(event.target.value)}
      placeholder="None"
      value={typeof value === "string" ? value : ""}
    />
  );
}

function renderNumberProperty({ value, onChange }: PropertyEditorProps) {
  return (
    <input
      className="inline-flex items-center rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 w-24"
      onChange={(event) => onChange(Number(event.target.value))}
      type="number"
      value={typeof value === "number" ? value : 0}
    />
  );
}

function renderDateProperty({ value, onChange }: PropertyEditorProps) {
  return (
    <input
      className="inline-flex items-center rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 w-36"
      onChange={(event) => onChange(event.target.value)}
      type="date"
      value={typeof value === "string" ? value : ""}
    />
  );
}

function renderSelectProperty({
  definition,
  onChange,
  value,
}: PropertyEditorProps) {
  const selectOptions = Array.isArray(definition.config?.options)
    ? definition.config.options
    : [];

  return (
    <div className="relative inline-block w-48 max-w-full">
      <select
        className="w-full rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 cursor-pointer appearance-none pr-7"
        onChange={(event) => onChange(event.target.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">Select value</option>
        {selectOptions.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {String(option.label)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

function renderUserProperty({ members, onChange, value }: PropertyEditorProps) {
  return (
    <div className="relative inline-block w-48 max-w-full">
      <select
        className="w-full rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 outline-none transition focus:bg-white focus:ring-1 focus:ring-zinc-300 cursor-pointer appearance-none pr-7"
        onChange={(event) => onChange(event.target.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">Assign teammate</option>
        {members.map((member) => (
          <option key={member.id} value={member.userId}>
            {getMemberLabel(member)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

const CORE_PROPERTY_TYPES = [
  { id: "text", label: "Text", renderEditor: renderTextProperty },
  { id: "date", label: "Date", renderEditor: renderDateProperty },
  { id: "select", label: "Select", renderEditor: renderSelectProperty },
  { id: "user", label: "User", renderEditor: renderUserProperty },
  { id: "number", label: "Number", renderEditor: renderNumberProperty },
] as const;

export function registerCorePropertyTypes(
  registerPropertyType: RegisterPluginApi["registerPropertyType"],
) {
  for (const propertyType of CORE_PROPERTY_TYPES) {
    registerPropertyType(propertyType);
  }
}
