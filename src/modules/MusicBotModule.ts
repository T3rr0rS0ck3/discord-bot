import { Client } from "discord.js";
import type { MusicBotModuleOptions } from "../types/Discord";
import { ICommand } from "../commands/interfaces/ICommand";
import { MusicCommand } from "../commands/music/MusicCommand";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { RoleService } from "../services/RoleService";
import { SpotifyOAuthCallbackServer } from "../services/SpotifyOAuthCallbackServer";
import { SpotifyOAuthService } from "../services/SpotifyOAuthService";
import { IBotModule } from "./interfaces/IBotModule";

export class MusicBotModule implements IBotModule {
    public readonly name = "musicbot";
    private readonly guildId?: string;
    private readonly musicRoleName: string;
    private readonly spotifyService: SpotifyOAuthService;
    private readonly playbackService: MusicPlaybackService;
    private callbackServer?: SpotifyOAuthCallbackServer;

    public constructor(options: MusicBotModuleOptions) {
        this.guildId = options.guildId;
        this.musicRoleName = options.musicRoleName;
        this.spotifyService = new SpotifyOAuthService(options.spotifyService);
        this.playbackService = new MusicPlaybackService(this.spotifyService, {
            ...options.musicPlayback,
            allowedRoleNames: options.musicPlayback.allowedRoleNames ?? [this.musicRoleName]
        });
    }

    public getCommands(): ICommand[] {
        return [new MusicCommand(this.playbackService, this.spotifyService)];
    }

    public initialize(): void {
        if (!this.spotifyService.isConfigured()) {
            console.log("[SpotifyOAuth] Not configured. /music spotify-connect is disabled.");
            return;
        }

        const redirectUri = this.spotifyService.getRedirectUri();
        if (!redirectUri) {
            return;
        }

        this.callbackServer = new SpotifyOAuthCallbackServer(this.spotifyService, redirectUri);
        this.callbackServer.start();
        console.log(`[SpotifyOAuth] Configured (${this.spotifyService.getMaskedConfigFingerprint()}).`);
    }

    public async shutdown(): Promise<void> {
        if (!this.callbackServer) {
            return;
        }

        await this.callbackServer.stop();
        this.callbackServer = undefined;
    }

    public async onReady(client: Client): Promise<void> {
        if (!this.guildId) {
            return;
        }

        const role = await RoleService.ensureRole(client.guilds.cache.get(this.guildId) ?? await client.guilds.fetch(this.guildId), {
            name: this.musicRoleName,
            reason: "Automatically created role for music commands"
        });

        if (!role) {
            console.log(`[MusicRole] Role "${this.musicRoleName}" could not be provisioned.`);
            return;
        }
    }

    public async handleButtonInteraction(customId: string, interaction: import("discord.js").ButtonInteraction): Promise<boolean> {
        if (!customId.startsWith("music:")) {
            return false;
        }

        return await this.playbackService.handleButtonInteraction(interaction);
    }
}