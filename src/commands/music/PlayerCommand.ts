import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../../services/MusicPlaybackService";
import { ICommand } from "../interfaces/ICommand";

export class PlayerCommand implements ICommand {
    public readonly name = "player";
    public readonly description = "Show the player with controls in chat";
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

        const ui = this.playbackService.buildPlayerUI(interaction.guildId);
        await interaction.reply({ ...ui, ephemeral: false });

        const message = await interaction.fetchReply();
        await this.playbackService.registerControllerMessage(interaction.guildId, interaction.channelId, message.id);
    }
}
