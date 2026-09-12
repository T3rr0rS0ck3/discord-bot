import { Client } from "discord.js";
import type { MusicBotModuleOptions } from "../types/Discord";
import { ICommand } from "../commands/interfaces/ICommand";
import { MusicCommand } from "../commands/music/MusicCommand";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { RoleService } from "../services/RoleService";
import { TheAudioDbService } from "../services/TheAudioDbService";
import { IBotModule } from "./interfaces/IBotModule";

export class MusicBotModule implements IBotModule {
    public readonly name = "musicbot";
    private readonly guildIds: string[];
    private readonly musicRoleName: string;
    private readonly audioDbService: TheAudioDbService;
    private readonly playbackService: MusicPlaybackService;

    public constructor(options: MusicBotModuleOptions) {
        this.guildIds = options.guildIds?.length
            ? [...new Set(options.guildIds)]
            : options.guildId ? [options.guildId] : [];
        this.musicRoleName = options.musicRoleName;
        this.audioDbService = new TheAudioDbService({
            apiKey: options.musicPlayback.audioDbApiKey,
            apiVersion: options.musicPlayback.audioDbApiVersion
        });
        this.playbackService = new MusicPlaybackService(this.audioDbService, {
            ...options.musicPlayback,
            allowedRoleNames: options.musicPlayback.allowedRoleNames ?? [this.musicRoleName]
        });
    }

    public getCommands(): ICommand[] {
        return [new MusicCommand(this.playbackService, this.audioDbService)];
    }

    public initialize(): void {
        console.log("[TheAudioDB] Metadata search enabled. YouTube remains the playback source.");
    }

    public async shutdown(): Promise<void> {
        this.playbackService.shutdown();
    }

    public async onReady(client: Client): Promise<void> {
        for (const guildId of this.guildIds) {
            const role = await RoleService.ensureRole(client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId), {
                name: this.musicRoleName,
                reason: "Automatically created role for music commands"
            });

            if (!role) {
                console.log(`[MusicRole] Role "${this.musicRoleName}" could not be provisioned in guild ${guildId}.`);
            }
        }
    }

    public async handleButtonInteraction(customId: string, interaction: import("discord.js").ButtonInteraction): Promise<boolean> {
        if (!customId.startsWith("music:")) {
            return false;
        }
        if (this.guildIds.length > 0 && (!interaction.guildId || !this.guildIds.includes(interaction.guildId))) return false;

        return await this.playbackService.handleButtonInteraction(interaction);
    }

    public async handleStringSelectInteraction(customId: string, interaction: import("discord.js").StringSelectMenuInteraction): Promise<boolean> {
        if (!customId.startsWith("music:")) return false;
        if (this.guildIds.length > 0 && (!interaction.guildId || !this.guildIds.includes(interaction.guildId))) return false;
        return this.playbackService.handleStringSelectInteraction(interaction);
    }
}
