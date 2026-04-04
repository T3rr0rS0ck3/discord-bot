import type { SpotifyTrackMetadata } from "./Spotify";

export type YouTubeCandidate = {
    url: string;
    title: string;
    durationInSec?: number;
    channelName: string;
    channelVerified: boolean;
    thumbnailUrl?: string;
};

export type YouTubeSearchConfig = {
    searchLimit: number;
    debugEnabled: boolean;
    logger?: (message: string) => void;
};

export type YouTubeResolvedResult = {
    url: string;
    title: string;
    thumbnailUrl?: string;
};

export type YouTubeSearchOptions = {
    query: string;
    expected?: SpotifyTrackMetadata;
    queryHint?: string;
};

export type YouTubeScoreEntry = {
    candidate: YouTubeCandidate;
    searchOrder: number;
    strictMatch: boolean;
    score: number;
    combinedScore: number;
};

export type ParsedArtistTitle = {
    artist?: string;
    title?: string;
};
