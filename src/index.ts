import dotenv from "dotenv";
import { DiscordBot } from "./bot/DiscordBot";
import { CommandFactory } from "./commands/CommandFactory";
import { SpotifyOAuthCallbackServer } from "./services/SpotifyOAuthCallbackServer";
import { PermissionFlagsBits } from "discord.js";

export class Startup {
    public static Start(): void {
        dotenv.config();

        const token = process.env.DISCORD_TOKEN;
        const guildId = process.env.GUILD_ID;
        const musicRoleName = process.env.MUSIC_ROLE_NAME ?? "Music Bot";

        if (!token) {
            throw new Error("DISCORD_TOKEN fehlt. Bitte in .env setzen.");
        }

        const commands = CommandFactory.Create();
        const spotifyService = CommandFactory.GetSpotifyService();
        const playbackService = CommandFactory.GetPlaybackService();

        if (spotifyService.isConfigured()) {
            const redirectUri = spotifyService.getRedirectUri();
            if (redirectUri) {
                const callbackServer = new SpotifyOAuthCallbackServer(spotifyService, redirectUri);
                callbackServer.start();
                console.log(`[SpotifyOAuth] Konfiguriert (${spotifyService.getMaskedConfigFingerprint()}).`);
            }
        }
        else {
            console.log("[SpotifyOAuth] Nicht konfiguriert. /spotify-connect ist deaktiviert.");
        }

        const bot = new DiscordBot({
            token,
            guildId,
            commands: commands,
            onReady: async (client) => {
                if (!guildId) {
                    return;
                }

                const guild = await client.guilds.fetch(guildId);
                const me = guild.members.me ?? await guild.members.fetchMe();

                if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    console.log("[MusicRole] Der Bot hat keine Berechtigung, Rollen zu verwalten. Bitte Manage Roles vergeben.");
                    return;
                }

                const existingRole = guild.roles.cache.find((role) => role.name === musicRoleName) ?? null;
                const role = existingRole ?? await guild.roles.create({
                    name: musicRoleName,
                    mentionable: false,
                    hoist: false,
                    reason: "Automatisch angelegte Rolle für Musikbefehle"
                });

                playbackService.setAllowedRoleIds([role.id]);
                console.log(`[MusicRole] Rolle bereit: ${role.name} (${role.id})`);
            },
            buttonHandler: async (customId, interaction) => {
                if (!customId.startsWith("music:")) {
                    return false;
                }

                return await playbackService.handleButtonInteraction(interaction);
            }
        });

        void bot.start();
    }
}

Startup.Start();