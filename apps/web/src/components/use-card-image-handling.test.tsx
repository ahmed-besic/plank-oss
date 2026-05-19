/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCardImageHandling } from "./use-card-image-handling";

const { toast } = vi.hoisted(() => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast,
}));

function createEditor() {
  return {
    document: [],
    getTextCursorPosition() {
      return {
        block: { id: "block-1" },
      };
    },
    insertBlocks: vi.fn(),
    replaceBlocks: vi.fn(),
  };
}

describe("useCardImageHandling", () => {
  it("inserts pasted remote image urls without uploading a file", async () => {
    const editor = createEditor();
    const dirtyRef = { current: false };
    renderHook(() =>
      useCardImageHandling({
        blockNoteEditor: editor,
        dirtyRef,
        fileInputRef: { current: null },
        onRequestCardUploadUrl: vi.fn(async () => "https://upload.example"),
        onResolveCardFileUrl: vi.fn(async () => null),
        pendingDraft: null,
      }),
    );

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [],
        getData: () => "https://example.com/image.png",
      },
    });
    Object.defineProperty(event, "preventDefault", {
      value: vi.fn(),
    });

    await act(async () => {
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [
        {
          type: "image",
          props: {
            url: "https://example.com/image.png",
            caption: "Pasted image",
          },
        },
      ],
      { id: "block-1" },
      "after",
    );
    expect(dirtyRef.current).toBe(true);
  });

  it("warns when the user pastes a local file path", async () => {
    renderHook(() =>
      useCardImageHandling({
        blockNoteEditor: createEditor(),
        dirtyRef: { current: false },
        fileInputRef: { current: null },
        onRequestCardUploadUrl: vi.fn(async () => "https://upload.example"),
        onResolveCardFileUrl: vi.fn(async () => null),
        pendingDraft: null,
      }),
    );

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [],
        getData: () => "/Users/demo/Desktop/image.png",
      },
    });
    Object.defineProperty(event, "preventDefault", {
      value: vi.fn(),
    });

    await act(async () => {
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    expect(toast.message).toHaveBeenCalledWith(
      "That looks like a local file path. Copy the image itself (not the path) and paste again.",
    );
  });
});
