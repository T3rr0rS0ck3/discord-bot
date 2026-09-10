import type { AudioDbTrack, AudioDbTrackMetadata, AudioDbTrackResponse } from "../types/AudioDb";
import { ExternalHttpError, ExternalRequestExecutor } from "./ExternalRequestExecutor";

type TheAudioDbServiceOptions = {
    apiKey?: string;
    apiVersion?: "v1" | "v2";
};

export class TheAudioDbService {
    private readonly apiKey: string;
    private readonly apiVersion: "v1" | "v2";

    public constructor(options: TheAudioDbServiceOptions = {}) {
        this.apiVersion = options.apiVersion === "v2" ? "v2" : "v1";
        this.apiKey = options.apiKey?.trim() || process.env.AUDIODB_API_KEY?.trim() || "123";
    }

    public async searchTrackMetadata(query: string): Promise<AudioDbTrackMetadata | null> {
        const trimmed = query.trim();
        if (!trimmed) return null;

        for (const { artist, title } of this.buildQueryVariants(trimmed)) {
            const request = this.apiVersion === "v2"
                ? this.createV2SearchRequest(`${artist} ${title}`)
                : this.createV1SearchRequest(artist, title);
            let response: Response;
            try {
                response = await ExternalRequestExecutor.execute(async (signal) => {
                    const result = await fetch(request.url, { headers: request.headers, signal });
                    if (!result.ok) {
                        throw new ExternalHttpError(
                            result.status,
                            ExternalRequestExecutor.parseRetryAfter(result.headers.get("retry-after"))
                        );
                    }
                    return result;
                }, {
                    serviceName: "TheAudioDB",
                    timeoutMs: 8_000,
                    maxAttempts: 3,
                    baseDelayMs: 500,
                    logger: (message) => console.warn(message)
                });
            } catch (error) {
                console.warn(`[TheAudioDB] Search request failed: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }

            const body = await response.json() as AudioDbTrackResponse;
            const track = (this.apiVersion === "v2" ? body.search?.[0] : body.track?.[0]);
            const metadata = track ? this.toMetadata(track, trimmed) : null;
            if (metadata) return metadata;
        }

        return null;
    }

    private createV1SearchRequest(artist: string, title: string): { url: URL; headers?: HeadersInit } {
        const url = new URL(`https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(this.apiKey)}/searchtrack.php`);
        url.searchParams.set("s", artist);
        url.searchParams.set("t", title);
        return { url };
    }

    private createV2SearchRequest(query: string): { url: URL; headers: HeadersInit } {
        const url = new URL(`https://www.theaudiodb.com/api/v2/json/search/track/${encodeURIComponent(query)}`);
        return { url, headers: { "X-API-KEY": this.apiKey } };
    }

    public async searchTrackSuggestions(query: string, limit = 10): Promise<Array<{ label: string; value: string }>> {
        const metadata = await this.searchTrackMetadata(query);
        if (!metadata) return [];

        return [{
            label: this.limitText(`${metadata.title} - ${metadata.artists.join(", ")}`, 100),
            value: `${metadata.artists[0]} - ${metadata.title}`.slice(0, 100)
        }].slice(0, Math.max(1, Math.min(25, limit)));
    }

    private toMetadata(track: AudioDbTrack, searchQuery: string): AudioDbTrackMetadata | null {
        const title = track.strTrack?.trim();
        const artist = track.strArtist?.trim();
        if (!title || !artist) return null;

        const durationMs = Number(track.intDuration ?? 0);
        return {
            title,
            artists: artist.split(",").map(value => value.trim()).filter(Boolean),
            durationSec: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : 0,
            artworkUrl: track.strTrackThumb?.trim() || undefined,
            searchQuery
        };
    }

    private buildQueryVariants(query: string): Array<{ artist: string; title: string }> {
        const separator = query.match(/\s+-\s+|\s+by\s+/i);
        if (separator && separator.index !== undefined) {
            return [{
                artist: query.slice(0, separator.index).trim(),
                title: query.slice(separator.index + separator[0].length).trim()
            }];
        }

        const words = query.split(/\s+/).filter(Boolean);
        const variants: Array<{ artist: string; title: string }> = [];
        for (let splitAt = 1; splitAt < words.length; splitAt += 1) {
            variants.push({
                artist: words.slice(0, splitAt).join(" "),
                title: words.slice(splitAt).join(" ")
            });
        }
        variants.push({ artist: query, title: query });
        return variants;
    }

    private limitText(value: string, maxLength: number): string {
        return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
    }
}