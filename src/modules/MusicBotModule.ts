import { Client, PermissionFlagsBits } from "discord.js";
import { ICommand } from "../commands/interfaces/ICommand";
import { MusicCommand } from "../commands/MusicCommand";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { SpotifyOAuthCallbackServer } from "../services/SpotifyOAuthCallbackServer";
import { SpotifyOAuthService } from "../services/SpotifyOAuthService";
import { IBotModule } from "./interfaces/IBotModule";

type MusicBotModuleOptions = {
    guildId?: string;
    musicRoleName: string;
};

export class MusicBotModule implements IBotModule {
    public readonly name = "musicbot";
    private readonly guildId?: string;
    private readonly musicRoleName: string;
    private readonly spotifyService: SpotifyOAuthService;
    private readonly playbackService: MusicPlaybackService;

    public constructor(options: MusicBotModuleOptions) {
        this.guildId = options.guildId;
        this.musicRoleName = options.musicRoleName;
        this.spotifyService = new SpotifyOAuthService();
        this.playbackService = new MusicPlaybackService(this.spotifyService);
    }

    public getCommands(): ICommand[] {
        return [new MusicCommand(this.playbackService, this.spotifyService)];
    }

    public initialize(): void {
        if (!this.spotifyService.isConfigured()) {
            console.log("[SpotifyOAuth] Nicht konfiguriert. /music spotify-connect ist deaktiviert.");
            return;
        }

        const redirectUri = this.spotifyService.getRedirectUri();
        if (!redirectUri) {
            return;
        }

        const callbackServer = new SpotifyOAuthCallbackServer(this.spotifyService, redirectUri);
        callbackServer.start();
        console.log(`[SpotifyOAuth] Konfiguriert (${this.spotifyService.getMaskedConfigFingerprint()}).`);
    }

    public async onReady(client: Client): Promise<void> {
        if (!this.guildId) {
            return;
        }

        const guild = await client.guilds.fetch(this.guildId);
        const me = guild.members.me ?? await guild.members.fetchMe();

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            console.log("[MusicRole] Der Bot hat keine Berechtigung, Rollen zu verwalten. Bitte Manage Roles vergeben.");
            return;
        }

        const existingRole = guild.roles.cache.find((role) => role.name === this.musicRoleName) ?? null;
        const role = existingRole ?? await guild.roles.create({
            name: this.musicRoleName,
            mentionable: false,
            hoist: false,
            reason: "Automatisch angelegte Rolle fuer Musikbefehle"
        });

        this.playbackService.setAllowedRoleIds([role.id]);
        console.log(`[MusicRole] Rolle bereit: ${role.name} (${role.id})`);
    }

    public async handleButtonInteraction(customId: string, interaction: import("discord.js").ButtonInteraction): Promise<boolean> {
        if (!customId.startsWith("music:")) {
            return false;
        }

        return await this.playbackService.handleButtonInteraction(interaction);
    }
}