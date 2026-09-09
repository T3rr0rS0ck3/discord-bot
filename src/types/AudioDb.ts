export type AudioDbTrackMetadata = {
    title: string;
    artists: string[];
    durationSec: number;
    artworkUrl?: string;
    searchQuery: string;
};

export type AudioDbTrack = {
    strTrack?: string;
    strArtist?: string;
    intDuration?: string | number;
    strTrackThumb?: string;
};

export type AudioDbTrackResponse = {
    track?: AudioDbTrack[] | null;
    search?: AudioDbTrack[] | null;
};