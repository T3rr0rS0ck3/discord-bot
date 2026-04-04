export type SpotifyTokenResponse = {
    access_token: string;
    token_type: string;
    scope?: string;
    expires_in: number;
    refresh_token?: string;
};

export type SpotifyClientCredentialsTokenResponse = {
    access_token: string;
    token_type: string;
    expires_in: number;
};

export type SpotifyMeResponse = {
    id: string;
    display_name: string | null;
};

export type SpotifyTrackResponse = {
    name: string;
    duration_ms: number;
    preview_url: string | null;
    external_urls: { spotify: string };
    artists: Array<{ name: string }>;
    album: {
        images: Array<{ url: string }>;
    };
};

export type SpotifySearchTracksResponse = {
    tracks: {
        items: SpotifyTrackResponse[];
    };
};

export type SpotifyPlayableTrack = {
    sourceUrl: string;
    spotifyUrl: string;
    title: string;
    artists: string[];
    artworkUrl?: string;
};

export type SpotifyTrackMetadata = {
    spotifyUrl: string;
    title: string;
    artists: string[];
    durationSec: number;
    previewUrl: string | null;
    searchQuery: string;
    artworkUrl?: string;
};

export type PendingOAuthState = {
    discordUserId: string;
    expiresAt: number;
};

export type SpotifyTokenRecord = {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scope?: string;
    tokenType: string;
    spotifyUserId?: string;
    spotifyDisplayName?: string;
};

export type SpotifyTrackSuggestion = {
    id: string;
    name: string;
    artists: string;
    url: string;
};
