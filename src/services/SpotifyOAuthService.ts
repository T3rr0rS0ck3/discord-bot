import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { SpotifyTokenRecord, SpotifyTokenStore } from "./SpotifyTokenStore";

type SpotifyTokenResponse = {
    access_token: string;
    token_type: string;
    scope?: string;
    expires_in: number;
    refresh_token?: string;
};

type SpotifyMeResponse = {
    id: string;
    display_name: string | null;
};

type SpotifyTrackResponse = {
    name: string;
    duration_ms: number;
    preview_url: string | null;
    external_urls: { spotify: string };
    artists: Array<{ name: string }>;
};

type SpotifySearchTracksResponse = {
    tracks: {
        items: SpotifyTrackResponse[];
    };
};

type PendingState = {
    discordUserId: string;
    expiresAt: number;
};

export type SpotifyPlayableTrack = {
    sourceUrl: string;
    spotifyUrl: string;
    title: string;
    artists: string[];
};

export type SpotifyTrackMetadata = {
    spotifyUrl: string;
    title: string;
    artists: string[];
    durationSec: number;
    previewUrl: string | null;
    searchQuery: string;
};

export class SpotifyOAuthService {
    private readonly clientId?: string;
    private readonly clientSecret?: string;
    private readonly redirectUri?: string;
    private readonly stateTtlMs = 10 * 60 * 1000;
    private readonly pendingStates = new Map<string, PendingState>();
    private readonly tokenStore: SpotifyTokenStore;

    public constructor() {
        this.clientId = process.env.SPOTIFY_CLIENT_ID;
        this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        this.redirectUri = process.env.SPOTIFY_REDIRECT_URI;
        this.tokenStore = new SpotifyTokenStore(resolve(process.cwd(), "data/spotify-tokens.json"));
    }

    public isConfigured(): boolean {
        return Boolean(this.clientId && this.clientSecret && this.redirectUri);
    }

    public getRedirectUri(): string | undefined {
        return this.redirectUri;
    }

    public createAuthorizationUrl(discordUserId: string): string {
        this.ensureConfigured();

        const state = randomBytes(24).toString("base64url");
        this.pendingStates.set(state, {
            discordUserId,
            expiresAt: Date.now() + this.stateTtlMs
        });

        const scope = [
            "user-read-private",
            "user-read-email"
        ].join(" ");

        const authUrl = new URL("https://accounts.spotify.com/authorize");
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", this.clientId!);
        authUrl.searchParams.set("redirect_uri", this.redirectUri!);
        authUrl.searchParams.set("scope", scope);
        authUrl.searchParams.set("state", state);

        return authUrl.toString();
    }

    public async unlink(discordUserId: string): Promise<boolean> {
        return this.tokenStore.delete(discordUserId);
    }

    public async handleOAuthCallback(code: string, state: string): Promise<{ discordUserId: string; spotifyUserId: string; displayName: string }> {
        this.ensureConfigured();
        this.cleanupPendingStates();

        const pending = this.pendingStates.get(state);

        if (!pending || pending.expiresAt < Date.now()) {
            throw new Error("Ungültiger oder abgelaufener OAuth-State.");
        }

        this.pendingStates.delete(state);

        const token = await this.exchangeAuthorizationCode(code);
        const me = await this.fetchSpotifyProfile(token.access_token);

        const record: SpotifyTokenRecord = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: Date.now() + token.expires_in * 1000,
            scope: token.scope,
            tokenType: token.token_type,
            spotifyUserId: me.id,
            spotifyDisplayName: me.display_name ?? me.id
        };

        await this.tokenStore.set(pending.discordUserId, record);

        return {
            discordUserId: pending.discordUserId,
            spotifyUserId: me.id,
            displayName: me.display_name ?? me.id
        };
    }

    public async resolvePlayableTrack(discordUserId: string, input: string): Promise<SpotifyPlayableTrack | null> {
        const trackId = this.extractTrackId(input);
        if (!trackId) {
            return null;
        }

        const accessToken = await this.getValidAccessToken(discordUserId);
        if (!accessToken) {
            throw new Error("Kein verknüpfter Spotify-Account. Nutze zuerst /spotify-connect.");
        }

        const track = await this.fetchTrack(accessToken, trackId);

        if (!track.preview_url) {
            throw new Error("Für diesen Track stellt Spotify keine preview_url bereit.");
        }

        return {
            sourceUrl: track.preview_url,
            spotifyUrl: track.external_urls.spotify,
            title: track.name,
            artists: track.artists.map((artist) => artist.name)
        };
    }

    public async searchPlayableTrack(discordUserId: string, query: string): Promise<SpotifyPlayableTrack> {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            throw new Error("Leere Suchanfrage.");
        }

        const accessToken = await this.getValidAccessToken(discordUserId);
        if (!accessToken) {
            throw new Error("Kein verknüpfter Spotify-Account. Nutze zuerst /spotify-connect.");
        }

        const track = await this.searchTrack(accessToken, trimmedQuery);
        if (!track) {
            throw new Error("Keine passenden Spotify-Treffer mit preview_url gefunden.");
        }

        return {
            sourceUrl: track.preview_url!,
            spotifyUrl: track.external_urls.spotify,
            title: track.name,
            artists: track.artists.map((artist) => artist.name)
        };
    }

    public async resolveTrackMetadata(discordUserId: string, input: string): Promise<SpotifyTrackMetadata | null> {
        const trackId = this.extractTrackId(input);
        if (!trackId) {
            return null;
        }

        const accessToken = await this.getValidAccessToken(discordUserId);
        if (!accessToken) {
            throw new Error("Kein verknüpfter Spotify-Account. Nutze zuerst /spotify-connect.");
        }

        const track = await this.fetchTrack(accessToken, trackId);
        return this.toTrackMetadata(track);
    }

    public async searchTrackMetadata(discordUserId: string, query: string): Promise<SpotifyTrackMetadata | null> {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return null;
        }

        const accessToken = await this.getValidAccessToken(discordUserId);
        if (!accessToken) {
            throw new Error("Kein verknüpfter Spotify-Account. Nutze zuerst /spotify-connect.");
        }

        const track = await this.searchTrack(accessToken, trimmedQuery, true);
        if (!track) {
            return null;
        }

        return this.toTrackMetadata(track);
    }

    public isSpotifyTrackUrl(input: string): boolean {
        return this.extractTrackId(input) !== null;
    }

    private async getValidAccessToken(discordUserId: string): Promise<string | null> {
        const record = await this.tokenStore.get(discordUserId);

        if (!record) {
            return null;
        }

        if (record.expiresAt > Date.now() + 30_000) {
            return record.accessToken;
        }

        if (!record.refreshToken) {
            return null;
        }

        const refreshed = await this.refreshToken(record.refreshToken);

        const updatedRecord: SpotifyTokenRecord = {
            ...record,
            accessToken: refreshed.access_token,
            expiresAt: Date.now() + refreshed.expires_in * 1000,
            tokenType: refreshed.token_type,
            scope: refreshed.scope ?? record.scope,
            refreshToken: refreshed.refresh_token ?? record.refreshToken
        };

        await this.tokenStore.set(discordUserId, updatedRecord);
        return updatedRecord.accessToken;
    }

    private extractTrackId(input: string): string | null {
        try {
            if (input.startsWith("spotify:track:")) {
                const parts = input.split(":");
                return parts.length === 3 ? parts[2] : null;
            }

            const parsed = new URL(input);

            if (!parsed.hostname.includes("spotify.com")) {
                return null;
            }

            const segments = parsed.pathname.split("/").filter(Boolean);
            if (segments.length < 2 || segments[0] !== "track") {
                return null;
            }

            return segments[1];
        }
        catch {
            return null;
        }
    }

    private async exchangeAuthorizationCode(code: string): Promise<SpotifyTokenResponse> {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: this.redirectUri!
        });

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: this.makeBasicAuthHeader(),
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Spotify Token-Exchange fehlgeschlagen (${response.status}): ${errorBody}`);
        }

        return await response.json() as SpotifyTokenResponse;
    }

    private async refreshToken(refreshToken: string): Promise<SpotifyTokenResponse> {
        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken
        });

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: this.makeBasicAuthHeader(),
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Spotify Token-Refresh fehlgeschlagen (${response.status}): ${errorBody}`);
        }

        return await response.json() as SpotifyTokenResponse;
    }

    private async fetchSpotifyProfile(accessToken: string): Promise<SpotifyMeResponse> {
        const response = await fetch("https://api.spotify.com/v1/me", {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Spotify /me fehlgeschlagen (${response.status}): ${errorBody}`);
        }

        return await response.json() as SpotifyMeResponse;
    }

    private async fetchTrack(accessToken: string, trackId: string): Promise<SpotifyTrackResponse> {
        const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Spotify Track-Lookup fehlgeschlagen (${response.status}): ${errorBody}`);
        }

        return await response.json() as SpotifyTrackResponse;
    }

    private async searchTrack(accessToken: string, query: string, allowNoPreview = false): Promise<SpotifyTrackResponse | null> {
        const url = new URL("https://api.spotify.com/v1/search");
        url.searchParams.set("q", query);
        url.searchParams.set("type", "track");
        url.searchParams.set("limit", "10");

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Spotify Suche fehlgeschlagen (${response.status}): ${errorBody}`);
        }

        const body = await response.json() as SpotifySearchTracksResponse;

        if (allowNoPreview) {
            return body.tracks.items[0] ?? null;
        }

        return body.tracks.items.find((item) => item.preview_url !== null) ?? null;
    }

    private toTrackMetadata(track: SpotifyTrackResponse): SpotifyTrackMetadata {
        const artists = track.artists.map((artist) => artist.name);
        return {
            spotifyUrl: track.external_urls.spotify,
            title: track.name,
            artists,
            durationSec: Math.floor(track.duration_ms / 1000),
            previewUrl: track.preview_url,
            searchQuery: `${track.name} ${artists.join(" ")}`
        };
    }

    private makeBasicAuthHeader(): string {
        const payload = `${this.clientId!}:${this.clientSecret!}`;
        return `Basic ${Buffer.from(payload, "utf-8").toString("base64")}`;
    }

    private cleanupPendingStates(): void {
        for (const [state, value] of this.pendingStates.entries()) {
            if (value.expiresAt < Date.now()) {
                this.pendingStates.delete(state);
            }
        }
    }

    private ensureConfigured(): void {
        if (!this.isConfigured()) {
            throw new Error("Spotify OAuth ist nicht konfiguriert. Setze SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET und SPOTIFY_REDIRECT_URI.");
        }
    }

    public getMaskedConfigFingerprint(): string {
        const joined = `${this.clientId ?? ""}|${this.redirectUri ?? ""}`;
        return createHash("sha256").update(joined).digest("hex").slice(0, 8);
    }
}
