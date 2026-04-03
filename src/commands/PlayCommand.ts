import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { ICommand } from "./interfaces/ICommand";

export class PlayCommand implements ICommand {
    public readonly name = "play";
    public readonly description = "Spielt MP3-URLs, Spotify (Link/Suche) und YouTube-Links im Voice-Channel ab";
    private readonly playbackService: MusicPlaybackService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((option) =>
            option
                .setName("source")
                .setDescription("MP3-URL, Spotify Track-URL oder Suchtext (Titel/Interpret)")
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
