import dotenv from "dotenv";
import { DiscordBot } from "./bot/DiscordBot";
import { CommandFactory } from "./commands/CommandFactory";
import { SpotifyOAuthCallbackServer } from "./services/SpotifyOAuthCallbackServer";

export class Startup {
    public static Start(): void {
        dotenv.config();

        const token = process.env.DISCORD_TOKEN;
        const guildId = process.env.GUILD_ID;

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