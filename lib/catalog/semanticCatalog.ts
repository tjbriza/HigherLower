/** Stable domains in the redesigned target catalog. */
export type SemanticDomainId =
  "movies-series" | "gaming" | "music" | "social-media";

/** Stable category identity; deliberately independent of provider names. */
export type SemanticCategoryId =
  | "movie-series-rating"
  | "release-date"
  | "gross-revenue"
  | "game-rating"
  | "player-count"
  | "game-release-date"
  | "number-of-albums"
  | "album-release-date"
  | "monthly-listeners"
  | "youtube-subscribers"
  | "twitch-followers";

export type PlayableModeId = "classic" | "time-attack";

export interface SemanticDomain {
  readonly id: SemanticDomainId;
  readonly label: string;
  readonly description: string;
}

export interface SemanticCategory {
  readonly id: SemanticCategoryId;
  readonly domainId: SemanticDomainId;
  readonly label: string;
  readonly description: string;
  /** Approved comparison meaning and user-facing metric explanation. */
  readonly metricDescription: string;
  /** Source/data-path contract; this does not determine semantic identity. */
  readonly sourceDescription: string;
  /** Candidate provider or path metadata, never part of the category ID. */
  readonly providerCandidate: string;
  /** Approved value/date display constraints; not normalized GameItem fields. */
  readonly displayFormat: string;
  readonly targetCatalog: true;
  /** Semantic compatibility only; does not imply production availability. */
  readonly compatibleModes: readonly PlayableModeId[];
}

export const SEMANTIC_DOMAINS = [
  {
    id: "movies-series",
    label: "Movies & Series",
    description: "Compare movies and television series.",
  },
  {
    id: "gaming",
    label: "Gaming",
    description: "Compare games and their metrics.",
  },
  {
    id: "music",
    label: "Music",
    description: "Compare artists and album metrics.",
  },
  {
    id: "social-media",
    label: "Social Media",
    description: "Compare creator audience metrics.",
  },
] as const satisfies readonly SemanticDomain[];

const CLASSIC_AND_TIME_ATTACK = [
  "classic",
  "time-attack",
] as const satisfies readonly PlayableModeId[];

export const SEMANTIC_CATEGORIES = [
  {
    id: "movie-series-rating",
    domainId: "movies-series",
    label: "Movie/Series Rating",
    description: "Compare audience ratings for movies and TV series.",
    metricDescription:
      "TMDB vote_average on a 0–10 scale for movies and TV series.",
    sourceDescription:
      "TMDB vote_average across movie and TV records; mixed-media runtime safety must be verified before release.",
    providerCandidate: "TMDB",
    displayFormat: "Rating on a 0–10 scale.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "release-date",
    domainId: "movies-series",
    label: "Release Date",
    description: "Compare the initial release date in each title's medium.",
    metricDescription:
      "Movie release_date or TV first_air_date; compare initial release in that medium.",
    sourceDescription: "TMDB movie release_date and TV first_air_date.",
    providerCandidate: "TMDB",
    displayFormat:
      "Preserve source precision; do not invent a month or day when the source date is partial.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "gross-revenue",
    domainId: "movies-series",
    label: "Gross Revenue",
    description:
      "Compare movie-only gross revenue; TV revenue is not approximated.",
    metricDescription: "Movie-only gross revenue, with no TV approximation.",
    sourceDescription:
      "TMDB movie revenue is a candidate only; the provider/data contract remains unresolved.",
    providerCandidate: "TMDB movie revenue",
    displayFormat:
      "Unresolved pending the provider/data contract; do not display until defined.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "game-rating",
    domainId: "gaming",
    label: "Game Rating",
    description:
      "Compare Steam user-review positive percentages, not critic scores.",
    metricDescription:
      "Steam positive-review percentage; disclose that this is a user-review metric, not a critic score.",
    sourceDescription:
      "Steam positive reviews divided by total reviews, expressed as a percentage; the displayed metric must identify it as Steam user reviews.",
    providerCandidate: "Steam user reviews",
    displayFormat: "Percentage from 0–100%; label as positive user reviews.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "player-count",
    domainId: "gaming",
    label: "Player Count",
    description: "Compare current concurrent players only.",
    metricDescription:
      "Current concurrent players; recent activity or peak is not equivalent.",
    sourceDescription:
      "Requires a suitable current-concurrency source; do not map SteamSpy recent-activity or peak values.",
    providerCandidate: "Unresolved current-concurrency data path",
    displayFormat: "Current concurrent-player count.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "game-release-date",
    domainId: "gaming",
    label: "Game Release Date",
    description: "Compare a game's first release date.",
    metricDescription: "IGDB first-release date.",
    sourceDescription: "IGDB first release date.",
    providerCandidate: "IGDB",
    displayFormat: "Date as supplied by the approved data path.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "number-of-albums",
    domainId: "music",
    label: "Number of Albums",
    description: "Compare the number of album release groups.",
    metricDescription:
      "Count MusicBrainz release groups whose primary type is Album.",
    sourceDescription:
      "MusicBrainz release groups filtered to primary type Album.",
    providerCandidate: "MusicBrainz",
    displayFormat: "Count of qualifying album release groups.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "album-release-date",
    domainId: "music",
    label: "Album Release Date",
    description: "Compare an album release group's first release date.",
    metricDescription:
      "MusicBrainz release-group first release date; preserve partial-date precision.",
    sourceDescription: "MusicBrainz release-group first release date.",
    providerCandidate: "MusicBrainz",
    displayFormat:
      "Preserve partial precision; do not invent a month or day when the source date is partial.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "monthly-listeners",
    domainId: "music",
    label: "Monthly Listeners",
    description:
      "Compare monthly listener counts from an approved commercial provider.",
    metricDescription:
      "Monthly listeners, subject to an approved commercial metric source.",
    sourceDescription:
      "An approved commercial-provider metric is required; access and provider terms are unresolved.",
    providerCandidate: "Approved commercial provider not selected",
    displayFormat:
      "Provider-specific semantics and formatting are pending approval.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "youtube-subscribers",
    domainId: "social-media",
    label: "YouTube Subscribers",
    description:
      "Compare subscriber counts for a curated pool of verified channels.",
    metricDescription:
      "YouTube Data API subscriberCount for curated verified channel IDs.",
    sourceDescription:
      "YouTube Data API subscriberCount, limited initially to curated verified channel IDs.",
    providerCandidate: "YouTube Data API",
    displayFormat: "Subscriber count; preserve the source integer value.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
  {
    id: "twitch-followers",
    domainId: "social-media",
    label: "Twitch Followers",
    description:
      "Compare Twitch follower counts when a legitimate scalable source exists.",
    metricDescription:
      "Twitch follower count from a legitimate scalable provider path.",
    sourceDescription:
      "A legitimate, scalable provider path has not been established.",
    providerCandidate: "No approved scalable provider path",
    displayFormat: "Follower count; source path and access remain unresolved.",
    targetCatalog: true,
    compatibleModes: CLASSIC_AND_TIME_ATTACK,
  },
] as const satisfies readonly SemanticCategory[];

/** PvP is product metadata only; it is never category-compatible gameplay. */
export const COMING_SOON_MODE_METADATA = {
  id: "pvp",
  label: "PvP",
  status: "coming-soon",
  selectable: false,
} as const;
