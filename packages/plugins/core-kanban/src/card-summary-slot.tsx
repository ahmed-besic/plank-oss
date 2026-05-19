import type { CardSlotProps } from "@plank/plugin-sdk";

export function CardSummarySlot({ card, boardType }: CardSlotProps) {
  const statusLabel =
    boardType.lifecycleConfig.statuses.find(
      (status) => status.key === card.statusKey,
    )?.label ?? card.statusKey;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text-tertiary">Status</p>
      <p className="text-sm text-text-primary">{statusLabel}</p>
    </div>
  );
}
