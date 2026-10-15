/**
 * Curated provider pools (Decisions C and D).
 *
 * These are static, manually verified identifier lists — data, not secrets.
 * These lists are bootstrap inputs to catalog generation, not runtime
 * authorities for categories that use generated catalogs.
 *
 * - MusicBrainz: `{ mbid, name }` artist MBIDs for `number-of-albums` and
 *   `album-release-date`.
 * - YouTube: `{ channelId, name }` seed IDs for the generated
 *   `youtube-subscribers` identity catalog.
 *
 * Membership may evolve over time; the seeds stay intentionally small and are
 * not expanded into a large permanent catalog.
 * Every identifier below was verified against the live provider on 2026-10-12
 * (MusicBrainz artist search; YouTube channel page resolution).
 */

export interface CuratedArtist {
  /** MusicBrainz artist MBID. */
  readonly mbid: string;
  /** Human-readable artist name (for diagnostics only). */
  readonly name: string;
}

export interface CuratedChannel {
  /** YouTube channel ID. */
  readonly channelId: string;
  /** Human-readable channel name (for diagnostics only). */
  readonly name: string;
}

/**
 * Curated MusicBrainz artist MBIDs. Chosen for well-known artists with a
 * substantial, diverse album catalogue so `number-of-albums` has value spread.
 */
export const CURATED_ARTISTS: readonly CuratedArtist[] = [
  { mbid: "83d91898-7763-47d7-b03b-b92132375c47", name: "Pink Floyd" },
  { mbid: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d", name: "The Beatles" },
  { mbid: "5b11f4ce-a62d-471e-81fc-a69a8278c7da", name: "Nirvana" },
  { mbid: "cc197bad-dc9c-440d-a5b5-d52ba2e14234", name: "Coldplay" },
  { mbid: "65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", name: "Metallica" },
  { mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711", name: "Radiohead" },
  { mbid: "0383dadf-2a4e-4d10-a46a-e9e041da8eb3", name: "Queen" },
  { mbid: "f27ec8db-af05-4f36-916e-3d57f91ecf5e", name: "Michael Jackson" },
  { mbid: "72c536dc-7137-4477-a521-567eeb840fa8", name: "Bob Dylan" },
  { mbid: "b071f9fa-14b0-4217-8e97-eb41da73f598", name: "The Rolling Stones" },
  { mbid: "8bfac288-ccc5-448d-9573-c33ea2aa5c30", name: "Red Hot Chili Peppers" },
  { mbid: "a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432", name: "U2" },
  { mbid: "79239441-bfd5-4981-a70c-55c3f15c1287", name: "Madonna" },
  { mbid: "678d88b2-87b0-403b-b63d-5da7465aecc3", name: "Led Zeppelin" },
  { mbid: "cc2c9c3c-b7bc-4b8b-84d8-4fbd8779e493", name: "Adele" },
  { mbid: "b95ce3ff-3d05-4e87-9e01-c97b66af13d4", name: "Eminem" },
  { mbid: "20244d07-534f-4eff-b4d4-930878889970", name: "Taylor Swift" },
];

/**
 * Curated YouTube channel IDs. Chosen for well-known channels with public
 * (non-hidden) subscriber counts and a wide spread of values.
 */
export const CURATED_CHANNELS: readonly CuratedChannel[] = [
  { channelId: "UCX6OQ3DkcsbYNE6H8uQQuVA", name: "MrBeast" },
  { channelId: "UCq-Fj5jknLsUf-MWSy4_brA", name: "T-Series" },
  { channelId: "UCbCmjCuTUZos6Inko4u57UQ", name: "Cocomelon" },
  { channelId: "UCpEhnqL0y41EpW2TvWAHD7Q", name: "SET India" },
  { channelId: "UCJ5v_MCY6GNUBTO8-D3XoAg", name: "WWE" },
  { channelId: "UC-lHJZR3Gqxm24_Vd_AJ5Yw", name: "PewDiePie" },
  { channelId: "UC295-Dw_tDNtZXFeAPAW6Aw", name: "5-Minute Crafts" },
  { channelId: "UCFFbwnve3yF62-tVXkTyHqg", name: "Zee Music Company" },
  { channelId: "UC0C-w0YjGpqDXGB8IHb662A", name: "Ed Sheeran" },
  { channelId: "UC3IZKseVpdzPSBaWxBxundA", name: "HYBE LABELS" },
  { channelId: "UCBnZ16ahKA2DZ_T5W0FPUXg", name: "ChuChu TV" },
  { channelId: "UCpB959t8iPrxQWj7G6n0ctQ", name: "SSSniperWolf" },
  { channelId: "UCsXVk37bltHxD1rDPwtNM8Q", name: "Kurzgesagt" },
];
