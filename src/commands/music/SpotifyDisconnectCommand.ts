import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { SpotifyOAuthService } from "../../services/SpotifyOAuthService";
import { ICommand } from "../interfaces/ICommand";

export class SpotifyDisconnectCommand implements ICommand {
    public readonly name = "spotify-disconnect";
    public readonly description = "Unlink your Spotify account";
    private readonly spotifyService: SpotifyOAuthService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public constructor(spotifyService: SpotifyOAuthService) {
        this.spotifyService = spotifyService;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const deleted = await this.spotifyService.unlink(interaction.user.id);

        if (!deleted) {
            await interaction.reply({
                content: "No Spotify account is linked to your Discord user.",
                ephemeral: true
            });
            return;
        }

        await interaction.reply({
            content: "Spotify link removed.",
            ephemeral: true
        });
    }
}
