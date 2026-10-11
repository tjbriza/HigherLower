"use client";

import type { PlayableModeId } from "@/lib/catalog/semanticCatalog";

export interface SelectableMode {
  readonly id: PlayableModeId | "pvp";
  readonly label: string;
  readonly description: string;
  readonly comingSoon?: boolean;
}

interface ModeButtonProps {
  mode: SelectableMode;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const MODE_CONTENT = {
  classic: {
    description: "Survive as long as you can. No clock, just skill.",
  },
  "time-attack": {
    description: "Race the clock. Every right answer buys more time.",
  },
  pvp: {
    description: "Player-versus-player mode is not available yet.",
  },
} as const;

export default function ModeButton({
  mode,
  selected,
  disabled = false,
  onSelect,
}: ModeButtonProps) {
  const unavailable = disabled || Boolean(mode.comingSoon);
  const { description } = MODE_CONTENT[mode.id];

  return (
    <label
      className={`relative grid min-h-28 w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 p-3 text-left focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--focus-ring)] sm:min-h-32 sm:p-4 ${unavailable ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name="playable-mode"
        value={mode.id}
        checked={!unavailable && selected}
        disabled={unavailable}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 flex size-4 shrink-0 items-center justify-center self-center rounded-full border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus-ring)] ${selected && !unavailable ? "border-[var(--accent-time-attack)] bg-transparent" : "border-white bg-transparent"}`}
      >
        {selected && !unavailable && (
          <span className="size-2 rounded-full bg-[var(--accent-time-attack)]" />
        )}
      </span>
      <span
        className={`col-start-2 row-start-1 text-2xl font-bold leading-tight sm:text-4xl ${selected && !unavailable ? "text-white [text-shadow:2px_2px_0_var(--accent-time-attack)]" : "text-white"}`}
      >
        {mode.label}
        {unavailable && (
          <span className="ml-2 align-middle text-[0.65rem] uppercase tracking-wide text-[var(--text-secondary)]">
            Coming Soon
          </span>
        )}
      </span>
      <span className="col-start-2 row-start-2 text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
        {description}
      </span>
    </label>
  );
}
