type TableName =
	| "automationRuns"
	| "behaviorBindings"
	| "behaviorPacks"
	| "boardDigests"
	| "boardHeartbeats"
	| "boardMembershipStates"
	| "boardTypes"
	| "boards"
	| "boardViews"
	| "cardDigests"
	| "cardChangeEvents"
	| "cardComments"
	| "cardTypeRegistry"
	| "cardTypes"
	| "cardSeenStates"
	| "cards"
	| "commentReactions"
	| "fieldDefinitions"
	| "nodes"
	| "notifications"
	| "tagDefinitions"
	| "workflowEvents"
	| "workspaceCardTypeCustomFields"
	| "workspaceExtensions"
	| "workspaceInvites"
	| "workspaceMembers"
	| "workspaces";

type DocRecord = Record<string, unknown> & { _id: string };

class FilterBuilder {
	field(name: string) {
		return name;
	}

	eq(fieldName: string, value: unknown) {
		return (doc: DocRecord) => doc[fieldName] === value;
	}
}

class SearchBuilder {
	constructor(private readonly state: QueryState) {}

	search(fieldName: string, term: string) {
		this.state.searchField = fieldName;
		this.state.searchTerm = term.toLowerCase();
		return this;
	}

	eq(fieldName: string, value: unknown) {
		this.state.constraints.push((doc) => doc[fieldName] === value);
		return this;
	}
}

interface QueryState {
	constraints: Array<(doc: DocRecord) => boolean>;
	searchField?: string;
	searchTerm?: string;
	order?: "asc" | "desc";
}

interface IndexBuilder {
	eq: (fieldName: string, value: unknown) => IndexBuilder;
	lt: (fieldName: string, value: unknown) => IndexBuilder;
	lte: (fieldName: string, value: unknown) => IndexBuilder;
}

class QueryBuilder {
	private readonly state: QueryState = {
		constraints: [],
	};

	constructor(private readonly rows: DocRecord[]) {}

	withIndex(_name: string, build: (query: IndexBuilder) => unknown) {
		const indexQuery: IndexBuilder = {
			eq: (fieldName: string, value: unknown) => {
				this.state.constraints.push((doc) => doc[fieldName] === value);
				return indexQuery;
			},
			lt: (fieldName: string, value: unknown) => {
				this.state.constraints.push((doc) => {
					const fieldValue = doc[fieldName];
					return (
						typeof fieldValue === "number" &&
						typeof value === "number" &&
						fieldValue < value
					);
				});
				return indexQuery;
			},
			lte: (fieldName: string, value: unknown) => {
				this.state.constraints.push((doc) => {
					const fieldValue = doc[fieldName];
					return (
						typeof fieldValue === "number" &&
						typeof value === "number" &&
						fieldValue <= value
					);
				});
				return indexQuery;
			},
		};
		build(indexQuery);
		return this;
	}

	withSearchIndex(_name: string, build: (query: SearchBuilder) => unknown) {
		build(new SearchBuilder(this.state));
		return this;
	}

	order(direction: "asc" | "desc") {
		this.state.order = direction;
		return this;
	}

	filter(build: (query: FilterBuilder) => (doc: DocRecord) => boolean) {
		const predicate = build(new FilterBuilder());
		this.state.constraints.push(predicate);
		return this;
	}

	collect() {
		return Promise.resolve(this.results());
	}

	take(count: number) {
		return Promise.resolve(this.results().slice(0, count));
	}

	first() {
		return Promise.resolve(this.results()[0] ?? null);
	}

	unique() {
		const results = this.results();
		return Promise.resolve(results[0] ?? null);
	}

	private results() {
		const getByPath = (row: DocRecord, path: string) =>
			path.split(".").reduce<unknown>((value, segment) => {
				if (value && typeof value === "object") {
					return (value as Record<string, unknown>)[segment];
				}
				return undefined;
			}, row);

		const results = this.rows.filter((row) => {
			if (this.state.constraints.some((constraint) => !constraint(row))) {
				return false;
			}

			if (!this.state.searchField || !this.state.searchTerm) {
				return true;
			}

			const value = getByPath(row, this.state.searchField);
			return typeof value === "string"
				? value.toLowerCase().includes(this.state.searchTerm)
				: false;
		});
		if (!this.state.order) {
			return results;
		}
		return [...results].sort((left, right) => {
			const leftCreatedAt =
				typeof left.createdAt === "number" ? left.createdAt : 0;
			const rightCreatedAt =
				typeof right.createdAt === "number" ? right.createdAt : 0;
			return this.state.order === "desc"
				? rightCreatedAt - leftCreatedAt
				: leftCreatedAt - rightCreatedAt;
		});
	}
}

export class MockConvexDb {
	private readonly tables = new Map<TableName, DocRecord[]>();
	private counter = 1;

	constructor(seed?: Partial<Record<TableName, DocRecord[]>>) {
		for (const tableName of [
			"automationRuns",
			"behaviorBindings",
			"behaviorPacks",
			"boardDigests",
			"boardHeartbeats",
			"boardMembershipStates",
			"boardTypes",
			"boards",
			"boardViews",
			"cardDigests",
			"cardChangeEvents",
			"cardComments",
			"cardTypeRegistry",
			"cardTypes",
			"cardSeenStates",
			"cards",
			"commentReactions",
			"fieldDefinitions",
			"nodes",
			"notifications",
			"tagDefinitions",
			"workflowEvents",
			"workspaceCardTypeCustomFields",
			"workspaceExtensions",
			"workspaceInvites",
			"workspaceMembers",
			"workspaces",
		] satisfies TableName[]) {
			this.tables.set(tableName, [...(seed?.[tableName] ?? [])]);
		}
	}

	get(id: string) {
		for (const rows of this.tables.values()) {
			const match = rows.find((row) => row._id === id);
			if (match) {
				return Promise.resolve(match);
			}
		}

		return Promise.resolve(null);
	}

	insert(tableName: TableName, value: Record<string, unknown>) {
		const id = `${tableName}_${this.counter++}`;
		const row = {
			_id: id,
			...value,
		};
		this.table(tableName).push(row);
		return Promise.resolve(id);
	}

	patch(id: string, patch: Record<string, unknown>) {
		const row = this.mustFind(id);
		Object.assign(row, patch);
		return Promise.resolve();
	}

	replace(id: string, value: Record<string, unknown>) {
		for (const [tableName, rows] of this.tables.entries()) {
			const index = rows.findIndex((row) => row._id === id);
			if (index >= 0) {
				const nextRow = {
					_id: id,
					...value,
				};
				this.tables.set(tableName, [
					...rows.slice(0, index),
					nextRow,
					...rows.slice(index + 1),
				]);
				return Promise.resolve();
			}
		}

		throw new Error(`Missing row ${id}`);
	}

	delete(id: string) {
		for (const [tableName, rows] of this.tables.entries()) {
			const nextRows = rows.filter((row) => row._id !== id);
			if (nextRows.length !== rows.length) {
				this.tables.set(tableName, nextRows);
				return Promise.resolve();
			}
		}

		return Promise.resolve();
	}

	query(tableName: TableName) {
		return new QueryBuilder(this.table(tableName));
	}

	rows(tableName: TableName) {
		return this.table(tableName);
	}

	private mustFind(id: string) {
		for (const rows of this.tables.values()) {
			const match = rows.find((row) => row._id === id);
			if (match) {
				return match;
			}
		}

		throw new Error(`Missing row ${id}`);
	}

	private table(tableName: TableName) {
		return this.tables.get(tableName) ?? [];
	}
}

export function createMockCtx({
	db,
	email = "user@example.com",
	tokenIdentifier = "user_1",
}: {
	db: MockConvexDb;
	email?: string | undefined;
	tokenIdentifier?: string | null;
}) {
	return {
		auth: {
			getUserIdentity: async () =>
				tokenIdentifier
					? {
							email,
							tokenIdentifier,
						}
					: null,
		},
		db,
	};
}
