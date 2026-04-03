import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type SpotifyTokenRecord = {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scope?: string;
    tokenType: string;
    spotifyUserId?: string;
    spotifyDisplayName?: string;
};

type SpotifyTokenMap = Record<string, SpotifyTokenRecord>;

export class SpotifyTokenStore {
    private readonly filePath: string;

    public constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async get(discordUserId: string): Promise<SpotifyTokenRecord | null> {
        const map = await this.readAll();
        return map[discordUserId] ?? null;
    }

    public async set(discordUserId: string, record: SpotifyTokenRecord): Promise<void> {
        const map = await this.readAll();
        map[discordUserId] = record;
        await this.writeAll(map);
    }

    public async delete(discordUserId: string): Promise<boolean> {
        const map = await this.readAll();

        if (!map[discordUserId]) {
            return false;
        }

        delete map[discordUserId];
        await this.writeAll(map);
        return true;
    }

    private async readAll(): Promise<SpotifyTokenMap> {
        try {
            const raw = await readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(raw) as SpotifyTokenMap;
            return parsed;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ENOENT")) {
                return {};
            }

            throw error;
        }
    }

    private async writeAll(map: SpotifyTokenMap): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(map, null, 2), "utf-8");
    }
}
