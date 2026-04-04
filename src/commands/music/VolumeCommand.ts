import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../../services/MusicPlaybackService";
import { ICommand } from "../interfaces/ICommand";

export class VolumeCommand implements ICommand {
    public readonly name = "volume";
    public readonly description = "Stellt die Lautstärke ein (0-100%)";
    private readonly playbackService: MusicPlaybackService;

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addIntegerOption((option) =>
            option
                .setName("percent")
                .setDescription("Lautstärke in Prozent (0 bis 100)")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100));

    public constructor(playbackService: MusicPlaybackService) {
        this.playbackService = playbackService;
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "Dieser Command geht nur auf einem Server.", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const percent = interaction.options.getInteger("percent", true);
        const applied = this.playbackService.setVolume(interaction.guildId, percent);

        if (applied !== null) {
            await this.playbackService.syncPlayerPanel(interaction.guildId);
            await interaction.deleteReply();
            return;
        }

        await interaction.editReply("Kein aktiver Player vorhanden.");
    }
}
