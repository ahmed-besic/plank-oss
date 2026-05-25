import { describe, expect, it } from "vitest";
import {
	canViewerAccessBoard,
	createDefaultCardBody,
	getBoardVisibility,
	isPrivateBoard,
	normalizeCardBody,
} from "./board";

describe("board visibility", () => {
	it("defaults missing visibility to workspace", () => {
		expect(getBoardVisibility({})).toBe("workspace");
		expect(isPrivateBoard({})).toBe(false);
	});

	it("allows only the owner to access private boards", () => {
		const board = { visibility: "private" as const, createdBy: "user-a" };

		expect(canViewerAccessBoard(board, "user-a")).toBe(true);
		expect(canViewerAccessBoard(board, "user-b")).toBe(false);
	});

	it("allows any viewer to access workspace boards", () => {
		const board = { visibility: "workspace" as const, createdBy: "user-a" };

		expect(canViewerAccessBoard(board, "user-b")).toBe(true);
	});
});

describe("card body helpers", () => {
	it("creates a non-empty blocknote document", () => {
		const body = createDefaultCardBody();

		expect(body.type).toBe("blocknote");
		expect(
			(body.content?.[0] as { type?: string } | undefined)?.type,
		).toBe("paragraph");
	});

	it("normalizes empty blocknote content into starter content", () => {
		const body = normalizeCardBody({
			type: "blocknote",
			content: [],
		});

		expect(body.type).toBe("blocknote");
		expect(
			(body.content?.[0] as { type?: string } | undefined)?.type,
		).toBe("paragraph");
	});

	it("returns a starter document for invalid input", () => {
		const body = normalizeCardBody({
			type: "unknown",
		});

		expect(body.type).toBe("blocknote");
		expect(
			(body.content?.[0] as { type?: string } | undefined)?.type,
		).toBe("paragraph");
	});
});
