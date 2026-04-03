import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { ICommand } from "./interfaces/ICommand";

export class SkipCommand implements ICommand {
    public readonly name = "skip";
    public readonly description = "Überspringt den aktuellen Titel";
    private readonly playbackService: MusicPlaybackService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public constructor(playbackService: MusicPlaybackService) {
        this.playbackService = playbackService;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "Dieser Command geht nur auf einem Server.", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const success = await this.playbackService.skip(interaction.guildId);

        if (success) {
            await this.playbackService.syncPlayerPanel(interaction.guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("Kein Titel zum Skippen aktiv.");
    }
}
