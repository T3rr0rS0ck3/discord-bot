type TwitchUser = {
    id: string;
    login: string;
};

type TwitchFollower = {
    user_id: string;
    user_login: string;
};

type TwitchSubscriber = {
    user_id: string;
    user_login: string;
};

export type TwitchOAuthTokenState = {
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
};

export type TwitchRoleServiceOptions = {
    broadcasterName?: string;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    onTokensUpdated?: (tokens: TwitchOAuthTokenState) => Promise<void> | void;
};

export class TwitchRoleService {
    private broadcasterName?: string;
    private clientId?: string;
    private clientSecret?: string;
    private accessToken?: string;
    private refreshToken?: string;
    private accessTokenExpiresAt?: number;
    private readonly onTokensUpdated?: (tokens: TwitchOAuthTokenState) => Promise<void> | void;
    private broadcasterId?: string | null;

    public constructor(options: TwitchRoleServiceOptions) {
        this.broadcasterName = options.broadcasterName;
        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.accessToken = options.accessToken;
        this.refreshToken = options.refreshToken;
        this.accessTokenExpiresAt = options.accessTokenExpiresAt;
        this.onTokensUpdated = options.onTokensUpdated;
    }

    public updateConfig(options: Partial<TwitchRoleServiceOptions>): void {
        if (options.broadcasterName !== undefined) {
            if (options.broadcasterName !== this.broadcasterName) {
                this.broadcasterId = undefined;
            }
            this.broadcasterName = options.broadcasterName;
        }

        if (options.clientId !== undefined) {
            this.clientId = options.clientId;
        }

        if (options.clientSecret !== undefined) {
            this.clientSecret = options.clientSecret;
        }

        if (options.accessToken !== undefined) {
            this.accessToken = options.accessToken;
        }

        if (options.refreshToken !== undefined) {
            this.refreshToken = options.refreshToken;
        }

        if (options.accessTokenExpiresAt !== undefined) {
            this.accessTokenExpiresAt = options.accessTokenExpiresAt;
        }
    }

    public isConfigured(): boolean {
        return Boolean(this.broadcasterName && this.clientId && this.accessToken);
    }

    private async getValidAccessToken(): Promise<string | null> {
        if (!this.accessToken) {
            return null;
        }

        if (
            this.accessTokenExpiresAt !== undefined &&
            Date.now() >= this.accessTokenExpiresAt - 60_000 &&
            this.refreshToken &&
            this.clientId &&
            this.clientSecret
        ) {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                console.error("[TwitchRole] Failed to refresh access token:", error);
            }
        }

        return this.accessToken;
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken || !this.clientId || !this.clientSecret) {
            return;
        }

        const body = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: "refresh_token",
            refresh_token: this.refreshToken
        });

        const response = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        });

        if (!response.ok) {
            throw new Error(`Twitch token refresh failed with HTTP ${response.status}`);
        }

        const payload = (await response.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
        };

        if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
            throw new Error("Twitch token refresh returned incomplete data.");
        }

        this.accessToken = payload.access_token;
        this.refreshToken = payload.refresh_token;
        this.accessTokenExpiresAt = Date.now() + payload.expires_in * 1000;

        if (this.onTokensUpdated) {
            await this.onTokensUpdated({
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                accessTokenExpiresAt: this.accessTokenExpiresAt
            });
        }
    }

    private async buildAuthHeaders(): Promise<Record<string, string> | null> {
        const accessToken = await this.getValidAccessToken();
        if (!accessToken || !this.clientId) {
            return null;
        }

        return {
            "Client-ID": this.clientId,
            Authorization: `Bearer ${accessToken}`
        };
    }

    private async fetchWithAuth(url: string): Promise<Response | null> {
        const headers = await this.buildAuthHeaders();
        if (!headers) {
            return null;
        }

        let response = await fetch(url, { headers });
        if (response.status !== 401) {
            return response;
        }

        if (!this.refreshToken || !this.clientId || !this.clientSecret) {
            return response;
        }

        try {
            await this.refreshAccessToken();
        } catch (error) {
            console.error("[TwitchRole] Token refresh after 401 failed:", error);
            return response;
        }

        const refreshedHeaders = await this.buildAuthHeaders();
        if (!refreshedHeaders) {
            return response;
        }

        response = await fetch(url, { headers: refreshedHeaders });
        return response;
    }

    private async getBroadcasterIdByName(name: string): Promise<string | null> {
        try {
            const response = await this.fetchWithAuth(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(name)}`);
            if (!response) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Twitch API error: ${response.status}`);
            }

            const body = (await response.json()) as { data: TwitchUser[] };
            if (body.data.length === 0) {
                return null;
            }

            return body.data[0].id;
        } catch (error) {
            console.error("[TwitchRole] Failed to get broadcaster ID:", error);
            throw error;
        }
    }

    public async getFollowerNames(): Promise<Set<string>> {
        const users = await this.getFollowers();
        return new Set(users.map(user => user.user_login.toLowerCase()));
    }

    public async getFollowerUserIds(): Promise<Set<string>> {
        return new Set((await this.getFollowers()).map(user => user.user_id));
    }

    private async getFollowers(): Promise<TwitchFollower[]> {
        if (!this.isConfigured()) {
            throw new Error("Twitch follower synchronization is not configured.");
        }

        if (!this.broadcasterId && this.broadcasterName) {
            try {
                this.broadcasterId = await this.getBroadcasterIdByName(this.broadcasterName);
                if (!this.broadcasterId) {
                    throw new Error(`Twitch broadcaster "${this.broadcasterName}" was not found.`);
                }
            } catch (error) {
                console.error("[TwitchRole] Failed to resolve broadcaster ID:", error);
                throw error;
            }
        }

        if (!this.broadcasterId) {
            throw new Error("Twitch broadcaster ID is unavailable.");
        }

        const followers: TwitchFollower[] = [];
        let after: string | undefined;

        try {
            // Paginate through followers (100 per page)
            for (let i = 0; i < 10; i++) {
                let url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${this.broadcasterId}&first=100`;
                if (after) {
                    url += `&after=${after}`;
                }

                const response = await this.fetchWithAuth(url);
                if (!response) {
                    throw new Error("Twitch follower authorization is unavailable.");
                }

                if (!response.ok) {
                    throw new Error(`Twitch API error: ${response.status}`);
                }

                const body = (await response.json()) as { data: TwitchFollower[]; pagination?: { cursor: string } };
                followers.push(...body.data);

                if (!body.pagination?.cursor) {
                    break;
                }
                after = body.pagination.cursor;
            }
        } catch (error) {
            console.error("[TwitchRole] Failed to get followers:", error);
            throw error;
        }

        return followers;
    }

    public async getSubscriberNames(): Promise<Set<string>> {
        const users = await this.getSubscribers();
        return new Set(users.map(user => user.user_login.toLowerCase()));
    }

    public async getSubscriberUserIds(): Promise<Set<string>> {
        return new Set((await this.getSubscribers()).map(user => user.user_id));
    }

    private async getSubscribers(): Promise<TwitchSubscriber[]> {
        if (!this.isConfigured()) {
            throw new Error("Twitch subscriber synchronization is not configured.");
        }

        if (!this.broadcasterId && this.broadcasterName) {
            try {
                this.broadcasterId = await this.getBroadcasterIdByName(this.broadcasterName);
                if (!this.broadcasterId) {
                    throw new Error(`Twitch broadcaster "${this.broadcasterName}" was not found.`);
                }
            } catch (error) {
                console.error("[TwitchRole] Failed to resolve broadcaster ID:", error);
                throw error;
            }
        }

        if (!this.broadcasterId) {
            throw new Error("Twitch broadcaster ID is unavailable.");
        }

        const subscribers: TwitchSubscriber[] = [];
        let after: string | undefined;

        try {
            // Paginate through subscribers (100 per page)
            for (let i = 0; i < 10; i++) {
                let url = `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${this.broadcasterId}&first=100`;
                if (after) {
                    url += `&after=${after}`;
                }

                const response = await this.fetchWithAuth(url);
                if (!response) {
                    throw new Error("Twitch subscriber authorization is unavailable.");
                }

                if (!response.ok) {
                    throw new Error(`Twitch API error: ${response.status}`);
                }

                const body = (await response.json()) as { data: TwitchSubscriber[]; pagination?: { cursor: string } };
                subscribers.push(...body.data);

                if (!body.pagination?.cursor) {
                    break;
                }
                after = body.pagination.cursor;
            }
        } catch (error) {
            console.error("[TwitchRole] Failed to get subscribers:", error);
            throw error;
        }

        return subscribers;
    }
}
