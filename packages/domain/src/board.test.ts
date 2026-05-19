import { describe, expect, it } from "vitest";
import {
	createDefaultCardBody,
	normalizeCardBody,
} from "./board";

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
