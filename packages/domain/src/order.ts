import { generateKeyBetween } from "fractional-indexing";

export function compareOrderKeys(left: string, right: string) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function createKeyBetween(
  previous?: string | null,
  next?: string | null,
) {
  return generateKeyBetween(previous ?? null, next ?? null);
}

export function createKeyAfter(previous?: string | null) {
  return generateKeyBetween(previous ?? null, null);
}

export function createKeyBefore(next?: string | null) {
  return generateKeyBetween(null, next ?? null);
}

export function normalizeOrderBounds(
  previous?: string | null,
  next?: string | null,
) {
  if (previous && next && compareOrderKeys(previous, next) > 0) {
    return {
      previous: next,
      next: previous,
    };
  }

  return {
    previous: previous ?? undefined,
    next: next ?? undefined,
  };
}
