import { v } from "convex/values";
import type {
	BoardSettingsEnvelope,
	BoardSettingsValue,
	BoardTypeViewDefaultsEnvelope,
	BoardTypeViewDefaultsValue,
	PlatformConfigScalar,
	PlatformConfigValue,
	WorkspaceExtensionConfigEnvelope,
} from "@plank/domain";

export const PERSISTED_STATE_SCHEMA_VERSION = 1;

const platformConfigScalarValidator = v.union(
	v.string(),
	v.number(),
	v.boolean(),
	v.null(),
);

export const platformConfigValueValidator = v.union(
	platformConfigScalarValidator,
	v.array(platformConfigScalarValidator),
	v.record(v.string(), platformConfigScalarValidator),
);

export const platformConfigRecordValidator = v.record(
	v.string(),
	platformConfigValueValidator,
);

export const workspaceExtensionConfigEnvelopeValidator = v.object({
	schemaVersion: v.literal(PERSISTED_STATE_SCHEMA_VERSION),
	pluginPackageId: v.string(),
	value: platformConfigRecordValidator,
});

export const persistedWorkspaceExtensionConfigValidator = v.union(
	workspaceExtensionConfigEnvelopeValidator,
	platformConfigRecordValidator,
);

export const boardSettingsEnvelopeValidator = v.object({
	schemaVersion: v.literal(PERSISTED_STATE_SCHEMA_VERSION),
	value: platformConfigRecordValidator,
});

export const persistedBoardSettingsValidator = v.union(
	boardSettingsEnvelopeValidator,
	platformConfigRecordValidator,
);

export const boardTypeViewDefaultsValueValidator = v.object({
	defaultViewIds: v.array(v.string()),
	viewConfigByViewId: v.optional(
		v.record(v.string(), platformConfigRecordValidator),
	),
});

export const boardTypeViewDefaultsEnvelopeValidator = v.object({
	schemaVersion: v.literal(PERSISTED_STATE_SCHEMA_VERSION),
	value: boardTypeViewDefaultsValueValidator,
});

export const persistedBoardTypeViewDefaultsValidator = v.union(
	boardTypeViewDefaultsEnvelopeValidator,
	boardTypeViewDefaultsValueValidator,
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlatformConfigScalar(value: unknown): value is PlatformConfigScalar {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value === null
	);
}

function normalizePlatformConfigValue(value: unknown): PlatformConfigValue | undefined {
	if (isPlatformConfigScalar(value)) {
		return value;
	}
	if (Array.isArray(value)) {
		const values = value.filter(isPlatformConfigScalar);
		return values.length === value.length ? values : undefined;
	}
	if (isRecord(value)) {
		const record: Record<string, PlatformConfigScalar> = {};
		for (const [key, nestedValue] of Object.entries(value)) {
			if (!isPlatformConfigScalar(nestedValue)) {
				return undefined;
			}
			record[key] = nestedValue;
		}
		return record;
	}
	return undefined;
}

export function normalizePlatformConfigRecord(
	value: unknown,
): Record<string, PlatformConfigValue> {
	if (!isRecord(value)) {
		return {};
	}
	const normalized: Record<string, PlatformConfigValue> = {};
	for (const [key, rawValue] of Object.entries(value)) {
		const configValue = normalizePlatformConfigValue(rawValue);
		if (configValue !== undefined) {
			normalized[key] = configValue;
		}
	}
	return normalized;
}

export function createWorkspaceExtensionConfigEnvelope({
	config,
	pluginPackageId,
}: {
	config?: unknown;
	pluginPackageId: string;
}): WorkspaceExtensionConfigEnvelope {
	return {
		schemaVersion: PERSISTED_STATE_SCHEMA_VERSION,
		pluginPackageId,
		value: normalizePlatformConfigRecord(config),
	};
}

export function unwrapWorkspaceExtensionConfig(
	config: unknown,
): Record<string, PlatformConfigValue> | undefined {
	if (!config) {
		return undefined;
	}
	if (
		isRecord(config) &&
		config.schemaVersion === PERSISTED_STATE_SCHEMA_VERSION &&
		typeof config.pluginPackageId === "string" &&
		isRecord(config.value)
	) {
		return normalizePlatformConfigRecord(config.value);
	}
	return normalizePlatformConfigRecord(config);
}

export function createBoardSettingsEnvelope(
	value: unknown = {},
): BoardSettingsEnvelope {
	return {
		schemaVersion: PERSISTED_STATE_SCHEMA_VERSION,
		value: normalizePlatformConfigRecord(value),
	};
}

export function unwrapBoardSettings(
	value: unknown,
): BoardSettingsValue | undefined {
	if (!value) {
		return undefined;
	}
	if (
		isRecord(value) &&
		value.schemaVersion === PERSISTED_STATE_SCHEMA_VERSION &&
		isRecord(value.value)
	) {
		return normalizePlatformConfigRecord(value.value);
	}
	return normalizePlatformConfigRecord(value);
}

export function createBoardTypeViewDefaultsEnvelope(
	value: BoardTypeViewDefaultsValue,
): BoardTypeViewDefaultsEnvelope {
	return {
		schemaVersion: PERSISTED_STATE_SCHEMA_VERSION,
		value: {
			defaultViewIds: [...value.defaultViewIds],
			...(value.viewConfigByViewId
				? {
						viewConfigByViewId: Object.fromEntries(
							Object.entries(value.viewConfigByViewId).map(([viewId, config]) => [
								viewId,
								normalizePlatformConfigRecord(config),
							]),
						),
					}
				: {}),
		},
	};
}

export function unwrapBoardTypeViewDefaults(
	value: unknown,
): BoardTypeViewDefaultsValue | undefined {
	if (!value) {
		return undefined;
	}
	const candidate =
		isRecord(value) &&
		value.schemaVersion === PERSISTED_STATE_SCHEMA_VERSION &&
		isRecord(value.value)
			? value.value
			: value;
	if (!isRecord(candidate) || !Array.isArray(candidate.defaultViewIds)) {
		return undefined;
	}
	const defaultViewIds = candidate.defaultViewIds.filter(
		(viewId): viewId is string => typeof viewId === "string",
	);
	const viewConfigByViewId = isRecord(candidate.viewConfigByViewId)
		? Object.fromEntries(
				Object.entries(candidate.viewConfigByViewId).map(([viewId, config]) => [
					viewId,
					normalizePlatformConfigRecord(config),
				]),
			)
		: undefined;
	return {
		defaultViewIds,
		...(viewConfigByViewId ? { viewConfigByViewId } : {}),
	};
}
