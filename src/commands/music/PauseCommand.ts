import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../../services/MusicPlaybackService";
import { ICommand } from "../interfaces/ICommand";

export class PauseCommand implements ICommand {
    public readonly name = "pause";
    public readonly description = "Pause playback";
    private readonly playbackService: MusicPlaybackService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public constructor(playbackService: MusicPlaybackService) {
        this.playbackService = playbackService;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const success = this.playbackService.pause(interaction.guildId);

        if (success) {
            await this.playbackService.syncPlayerPanel(interaction.guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("Unable to pause playback.");
    }
}
