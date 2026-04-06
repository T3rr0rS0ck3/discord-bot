import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { SpotifyOAuthService } from "../../services/SpotifyOAuthService";
import { ICommand } from "../interfaces/ICommand";

export class SpotifyConnectCommand implements ICommand {
    public readonly name = "spotify-connect";
    public readonly description = "Link your Spotify account via OAuth";
    private readonly spotifyService: SpotifyOAuthService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public constructor(spotifyService: SpotifyOAuthService) {
        this.spotifyService = spotifyService;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!this.spotifyService.isConfigured()) {
            await interaction.reply({
                content: "Spotify OAuth is not configured on this bot.",
                ephemeral: true
            });
            return;
        }

        const url = this.spotifyService.createAuthorizationUrl(interaction.user.id);

        await interaction.reply({
            content: `Open this link and approve access: ${url}`,
            ephemeral: true
        });
    }
}
