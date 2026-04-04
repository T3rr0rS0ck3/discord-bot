import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type {
    SpotifyTokenResponse,
    SpotifyClientCredentialsTokenResponse,
    SpotifyMeResponse,
    SpotifyTrackResponse,
    SpotifySearchTracksResponse,
    SpotifyPlayableTrack,
    SpotifyTrackMetadata,
    PendingOAuthState,
    SpotifyTokenRecord
} from "../types/Spotify";
import { SpotifyTokenStore } from "./SpotifyTokenStore";

type SpotifyOAuthServiceOptions = {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
};

export class SpotifyOAuthService {
    private readonly clientId?: string;
    private readonly clientSecret?: string;
    private readonly redirectUri?: string;
    private readonly stateTtlMs = 10 * 60 * 1000;
    private readonly pendingStates = new Map<string, PendingOAuthState>();
    private readonly tokenStore: SpotifyTokenStore;
    private appAccessTokenCache?: { accessToken: string; expiresAt: number };

    public constructor(options: SpotifyOAuthServiceOptions) {
        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.redirectUri = options.redirectUri;
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
            artists: track.artists.map((artist) => artist.name),
            artworkUrl: track.album.images[0]?.url
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
            artists: track.artists.map((artist) => artist.name),
            artworkUrl: track.album.images[0]?.url
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

    public async searchTrackSuggestions(query: string, limit = 10): Promise<Array<{ label: string; value: string }>> {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            return [];
        }

        if (!this.clientId || !this.clientSecret) {
            return [];
        }

        let accessToken: string;
        try {
            accessToken = await this.getAppAccessToken();
        }
        catch {
            return [];
        }

        const url = new URL("https://api.spotify.com/v1/search");
        url.searchParams.set("q", trimmedQuery);
        url.searchParams.set("type", "track");
        url.searchParams.set("limit", String(Math.max(1, Math.min(25, limit))));

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            return [];
        }

        const body = await response.json() as SpotifySearchTracksResponse;
        const seen = new Set<string>();

        return body.tracks.items
            .filter((item) => {
                const key = item.external_urls.spotify;
                if (seen.has(key)) {
                    return false;
                }

                seen.add(key);
                return true;
            })
            .map((item) => {
                const artists = item.artists.map((artist) => artist.name).join(", ");
                const label = this.limitChoiceText(`${item.name} - ${artists}`, 100);
                const value = this.limitChoiceText(item.external_urls.spotify, 100);
                return { label, value };
            })
            .slice(0, 25);
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

    private async getAppAccessToken(): Promise<string> {
        const cached = this.appAccessTokenCache;
        if (cached && cached.expiresAt > Date.now() + 30_000) {
            return cached.accessToken;
        }

        const response = await this.fetchClientCredentialsToken();
        this.appAccessTokenCache = {
            accessToken: response.access_token,
            expiresAt: Date.now() + response.expires_in * 1000
        };

        return response.access_token;
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

    private async fetchClientCredentialsToken(): Promise<SpotifyClientCredentialsTokenResponse> {
        const body = new URLSearchParams({
            grant_type: "client_credentials"
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
            throw new Error(`Spotify Client-Credentials fehlgeschlagen (${response.status}): ${errorBody}`);
        }

        return await response.json() as SpotifyClientCredentialsTokenResponse;
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
        const items = allowNoPreview
            ? body.tracks.items
            : body.tracks.items.filter((item) => item.preview_url !== null);

        if (items.length === 0) {
            return null;
        }

        const ranked = items
            .map((item) => ({ item, score: this.scoreSearchTrack(item, query) }))
            .sort((a, b) => b.score - a.score);

        return ranked[0]?.item ?? null;
    }

    private scoreSearchTrack(track: SpotifyTrackResponse, query: string): number {
        const normalizedTrackTitle = this.normalizeText(track.name);
        const trackArtists = track.artists.map((artist) => artist.name);
        const normalizedArtists = trackArtists.map((artist) => this.normalizeText(artist));
        const normalizedArtistJoined = normalizedArtists.join(" ");
        const normalizedQuery = this.normalizeText(query);
        let score = 0;

        const pair = this.parseQueryPair(query);
        if (pair) {
            const left = this.normalizeText(pair.left);
            const right = this.normalizeText(pair.right);

            const titleHasLeft = normalizedTrackTitle.includes(left);
            const titleHasRight = normalizedTrackTitle.includes(right);
            const artistHasLeft = normalizedArtistJoined.includes(left);
            const artistHasRight = normalizedArtistJoined.includes(right);

            const orientationA = titleHasLeft && artistHasRight;
            const orientationB = titleHasRight && artistHasLeft;

            if (orientationA || orientationB) {
                score += 220;
            }
            else {
                // Require both parts at least somewhere in title+artists for hyphen/by queries.
                if ((titleHasLeft || artistHasLeft) && (titleHasRight || artistHasRight)) {
                    score += 80;
                }
                else {
                    score -= 120;
                }
            }
        }

        if (normalizedTrackTitle === normalizedQuery) {
            score += 120;
        }
        else if (normalizedTrackTitle.includes(normalizedQuery)) {
            score += 70;
        }

        const queryTokens = this.getQueryTokens(query);
        const titleTokenMatches = queryTokens.filter((token) => normalizedTrackTitle.includes(token)).length;
        const artistTokenMatches = queryTokens.filter((token) => normalizedArtistJoined.includes(token)).length;

        score += titleTokenMatches * 22;
        score += artistTokenMatches * 18;

        if (track.preview_url) {
            score += 5;
        }

        return score;
    }

    private parseQueryPair(query: string): { left: string; right: string } | null {
        const trimmed = query.trim();
        if (!trimmed) {
            return null;
        }

        const separators = [" - ", " – ", " — ", " by "];
        const lowerTrimmed = trimmed.toLowerCase();

        for (const separator of separators) {
            const lowerSeparator = separator.toLowerCase();
            const index = lowerTrimmed.indexOf(lowerSeparator);
            if (index <= 0) {
                continue;
            }

            const left = trimmed.slice(0, index).trim();
            const right = trimmed.slice(index + separator.length).trim();
            if (!left || !right) {
                continue;
            }

            return { left, right };
        }

        return null;
    }

    private getQueryTokens(query: string): string[] {
        return this.normalizeText(query)
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && token !== "official" && token !== "offiziell");
    }

    private normalizeText(value: string): string {
        return value
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private toTrackMetadata(track: SpotifyTrackResponse): SpotifyTrackMetadata {
        const artists = track.artists.map((artist) => artist.name);
        return {
            spotifyUrl: track.external_urls.spotify,
            title: track.name,
            artists,
            durationSec: Math.floor(track.duration_ms / 1000),
            previewUrl: track.preview_url,
            searchQuery: `${track.name} ${artists.join(" ")}`,
            artworkUrl: track.album.images[0]?.url
        };
    }

    private makeBasicAuthHeader(): string {
        const payload = `${this.clientId!}:${this.clientSecret!}`;
        return `Basic ${Buffer.from(payload, "utf-8").toString("base64")}`;
    }

    private limitChoiceText(value: string, maxLength: number): string {
        if (value.length <= maxLength) {
            return value;
        }

        return `${value.slice(0, maxLength - 1)}…`;
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
