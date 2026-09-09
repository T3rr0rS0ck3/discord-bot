/**
 * Centralized export of all domain types
 * Import from this index for cleaner imports across the codebase
 */

// YouTube Search Types
export type {
    YouTubeCandidate,
    YouTubeSearchConfig,
    YouTubeResolvedResult,
    YouTubeSearchOptions,
    YouTubeScoreEntry,
    ParsedArtistTitle
} from "./YouTube";

// Music Playback Types
export type {
    ResolvedSource,
    QueueTrack,
    GuildPlayerState,
    PlaybackControlOptions
} from "./Music";

// Spotify Types
export type {
    SpotifyTokenResponse,
    SpotifyClientCredentialsTokenResponse,
    SpotifyMeResponse,
    SpotifyTrackResponse,
    SpotifySearchTracksResponse,
    SpotifyPlayableTrack,
    SpotifyTrackMetadata,
    PendingOAuthState,
    SpotifyTokenRecord,
    SpotifyTrackSuggestion
} from "./Spotify";
export type { AudioDbTrackMetadata, AudioDbTrack, AudioDbTrackResponse } from "./AudioDb";

// Discord Bot Types
export type {
    DiscordBotOptions,
    BotModuleFactoryOptions,
    MusicBotModuleOptions
} from "./Discord";
