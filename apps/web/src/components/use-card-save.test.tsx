/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCardSave  } from "./use-card-save";
import type {PersistSnapshot} from "./use-card-save";

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

function createSnapshot(): PersistSnapshot {
  return {
    title: "Draft",
    body: [],
    propertyUpdates: {},
    tagIds: [],
    baseUpdatedAt: 1,
  };
}

describe("useCardSave", () => {
  it("closes immediately when the draft is clean", async () => {
    const onClose = vi.fn();
    const saveSnapshot = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useCardSave({
        cardId: "card-1",
        clearDraft: vi.fn(),
        dirtyRef: { current: false },
        hasMeaningfulChanges: () => false,
        getSnapshot: createSnapshot,
        isMountedRef: { current: true },
        onClose,
        saveSnapshot,
      }),
    );

    await act(async () => {
      await result.current.closeAndSave();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("retries saves, clears the draft, and warns on stale writes", async () => {
    const saveSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ stale: true, serverUpdatedAt: 5000 });
    const clearDraft = vi.fn();
    const onClose = vi.fn();
    const dirtyRef = { current: true };

    const { result } = renderHook(() =>
      useCardSave({
        cardId: "card-1",
        clearDraft,
        dirtyRef,
        hasMeaningfulChanges: () => true,
        getSnapshot: createSnapshot,
        isMountedRef: { current: true },
        onClose,
        saveSnapshot,
      }),
    );

    vi.useFakeTimers();
    const promise = act(async () => {
      const closePromise = result.current.closeAndSave();
      await vi.runAllTimersAsync();
      await closePromise;
    });
    await promise;
    vi.useRealTimers();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveSnapshot).toHaveBeenCalledTimes(2);
    expect(clearDraft).toHaveBeenCalledWith("card-1");
    expect(dirtyRef.current).toBe(false);
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });
});
