import type { DiscordRuntimeStatus } from "../types/Discord";

export class RuntimeStatusStore {
    private status: DiscordRuntimeStatus = {
        state: "offline",
        message: "Bot is offline.",
        updatedAt: new Date().toISOString()
    };

    public set(status: DiscordRuntimeStatus): void {
        this.status = status;
    }

    public get(): DiscordRuntimeStatus {
        return this.status;
    }
}