// ─── Category ────────────────────────────────────────────────────────────────

export type CategoryId =
  | "movie-ratings"
  | "game-playerbase"
  | "game-ratings"
  | "item-prices";

export interface Category {
  /** Stable URL-safe identifier */
  id: CategoryId;
  /** Human-readable label shown in the UI */
  label: string;
  /** Short description of what the player is comparing */
  description: string;
  /** Emoji / icon character used as a visual accent */
  icon: string;
  /** Tailwind gradient classes for the category card */
  gradient: string;
}

// ─── Game Mode ───────────────────────────────────────────────────────────────

export type GameModeId = "classic" | "time-attack" | "co-op";

export interface GameMode {
  /** Stable URL-safe identifier used in /game/[mode] routing */
  id: GameModeId;
  /** Human-readable label */
  label: string;
  /** One-line description of the mode rules */
  description: string;
  /** Emoji / icon character */
  icon: string;
  /**
   * When true the mode is not yet playable.
   * The button will be rendered in a disabled / "coming soon" state.
   */
  comingSoon?: boolean;
}

// ─── Runtime helpers ─────────────────────────────────────────────────────────

/** Canonical list of all categories available in the game. */
export const CATEGORIES: Category[] = [
  {
    id: "movie-ratings",
    label: "Movie Ratings",
    description: "Compare IMDb scores of popular films",
    icon: "🎬",
    gradient: "from-rose-500/20 to-orange-500/20",
  },
  {
    id: "game-playerbase",
    label: "Game Playerbase",
    description: "Guess which game has more active players",
    icon: "🎮",
    gradient: "from-violet-500/20 to-indigo-500/20",
  },
  {
    id: "game-ratings",
    label: "Game Ratings",
    description: "Compare Metacritic or Steam scores",
    icon: "⭐",
    gradient: "from-amber-500/20 to-yellow-400/20",
  },
  {
    id: "item-prices",
    label: "Item Prices (PHP)",
    description: "Which everyday item costs more in the Philippines?",
    icon: "🛒",
    gradient: "from-emerald-500/20 to-teal-500/20",
  },
];

/** Canonical list of all game modes. */
export const GAME_MODES: GameMode[] = [
  {
    id: "classic",
    label: "Classic Mode",
    description: "Survive as long as you can — no clock, just skill.",
    icon: "♾️",
  },
  {
    id: "time-attack",
    label: "Time Attack",
    description: "Race the clock. Every correct answer buys more time.",
    icon: "⏱️",
  },
  {
    id: "co-op",
    label: "Co-op Mode",
    description: "Team up with a friend and beat the board together.",
    icon: "🤝",
    comingSoon: true,
  },
];
