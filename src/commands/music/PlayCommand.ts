import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../../services/MusicPlaybackService";
import { ICommand } from "../interfaces/ICommand";

export class PlayCommand implements ICommand {
    public readonly name = "play";
    public readonly description = "Play MP3 URLs, Spotify (link/search), and YouTube links in voice channels";
    private readonly playbackService: MusicPlaybackService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((option) =>
            option
                .setName("source")
                .setDescription("MP3 URL, Spotify track URL, or search text (title/artist)")
                .setRequired(true));

    public constructor(playbackService: MusicPlaybackService) {
        this.playbackService = playbackService;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const sourceInput = interaction.options.getString("source", true).trim();
        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await this.playbackService.enqueue(interaction, sourceInput);
            await interaction.editReply(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await interaction.editReply(message);
        }
    }
}
