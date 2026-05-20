import { v } from "convex/values";
import type {
	BoardViewConfigEnvelope,
	BoardViewConfigScalar,
	BoardViewConfigValue,
} from "@plank/domain";

export const BOARD_VIEW_CONFIG_SCHEMA_VERSION = 1;

const boardViewConfigScalarValidator = v.union(
	v.string(),
	v.number(),
	v.boolean(),
	v.null(),
);

export const boardViewConfigValueValidator = v.object({
	dateFieldKey: v.optional(v.union(v.string(), v.null())),
	inboxVisible: v.optional(v.boolean()),
	kanbanDefaultPropertyValuesByType: v.optional(
		v.record(
			v.string(),
			v.record(v.string(), boardViewConfigScalarValidator),
		),
	),
});

export const boardViewConfigEnvelopeValidator = v.object({
	schemaVersion: v.literal(BOARD_VIEW_CONFIG_SCHEMA_VERSION),
	viewId: v.string(),
	value: boardViewConfigValueValidator,
});

export const persistedBoardViewConfigValidator = v.union(
	boardViewConfigEnvelopeValidator,
	boardViewConfigValueValidator,
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoardViewConfigEnvelope(
	value: unknown,
): value is BoardViewConfigEnvelope {
	return (
		isRecord(value) &&
		value.schemaVersion === BOARD_VIEW_CONFIG_SCHEMA_VERSION &&
		typeof value.viewId === "string" &&
		isRecord(value.value)
	);
}

function assertAllowedKeys(
	config: Record<string, unknown>,
	allowedKeys: Set<string>,
) {
	for (const key of Object.keys(config)) {
		if (!allowedKeys.has(key)) {
			throw new Error(`Unsupported board view config key: ${key}`);
		}
	}
}

function assertScalarRecord(value: unknown, key: string) {
	if (!isRecord(value)) {
		throw new Error(`Board view config ${key} must be an object`);
	}
	for (const [propertyKey, propertyValue] of Object.entries(value)) {
		const valid =
			typeof propertyValue === "string" ||
			typeof propertyValue === "number" ||
			typeof propertyValue === "boolean" ||
			propertyValue === null;
		if (!valid) {
			throw new Error(
				`Board view config ${key}.${propertyKey} must be a scalar value`,
			);
		}
	}
	return value as Record<string, BoardViewConfigScalar>;
}

export function unwrapBoardViewConfig(
	config: unknown,
): BoardViewConfigValue | undefined {
	if (!config) {
		return undefined;
	}
	if (isBoardViewConfigEnvelope(config)) {
		return config.value;
	}
	return isRecord(config) ? (config as BoardViewConfigValue) : undefined;
}

export function normalizeBoardViewConfigForStorage({
	config,
	viewId,
}: {
	config: Record<string, unknown>;
	viewId: string;
}): BoardViewConfigEnvelope {
	const value = validateBoardViewConfigValue({ config, viewId });
	return {
		schemaVersion: BOARD_VIEW_CONFIG_SCHEMA_VERSION,
		viewId,
		value,
	};
}

export function validateBoardViewConfigValue({
	config,
	viewId,
}: {
	config: Record<string, unknown>;
	viewId: string;
}): BoardViewConfigValue {
	if (viewId === "calendar-board:month") {
		assertAllowedKeys(config, new Set(["dateFieldKey"]));
		const dateFieldKey = config.dateFieldKey;
		if (
			dateFieldKey !== undefined &&
			dateFieldKey !== null &&
			typeof dateFieldKey !== "string"
		) {
			throw new Error("Calendar board config dateFieldKey must be a string or null");
		}
		return {
			...(dateFieldKey !== undefined ? { dateFieldKey } : {}),
		};
	}

	if (viewId === "core-kanban:board") {
		assertAllowedKeys(
			config,
			new Set(["inboxVisible", "kanbanDefaultPropertyValuesByType"]),
		);
		const inboxVisible = config.inboxVisible;
		if (inboxVisible !== undefined && typeof inboxVisible !== "boolean") {
			throw new Error("Kanban board config inboxVisible must be a boolean");
		}
		const rawDefaults = config.kanbanDefaultPropertyValuesByType;
		let kanbanDefaultPropertyValuesByType:
			| Record<string, Record<string, BoardViewConfigScalar>>
			| undefined;
		if (rawDefaults !== undefined) {
			if (!isRecord(rawDefaults)) {
				throw new Error(
					"Kanban board config kanbanDefaultPropertyValuesByType must be an object",
				);
			}
			kanbanDefaultPropertyValuesByType = {};
			for (const [typeKey, typeDefaults] of Object.entries(rawDefaults)) {
				kanbanDefaultPropertyValuesByType[typeKey] = assertScalarRecord(
					typeDefaults,
					`kanbanDefaultPropertyValuesByType.${typeKey}`,
				);
			}
		}
		return {
			...(inboxVisible !== undefined ? { inboxVisible } : {}),
			...(kanbanDefaultPropertyValuesByType !== undefined
				? { kanbanDefaultPropertyValuesByType }
				: {}),
		};
	}

	assertAllowedKeys(config, new Set());
	return {};
}
