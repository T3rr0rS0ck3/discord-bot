import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicPlaybackService } from "../services/MusicPlaybackService";
import { ICommand } from "./interfaces/ICommand";

export class QueueCommand implements ICommand {
    public readonly name = "queue";
    public readonly description = "Zeigt die aktuelle Wiedergabe-Queue";
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

        const snapshot = this.playbackService.getQueueSnapshot(interaction.guildId);
        if (!snapshot || !snapshot.current) {
            await interaction.reply({ content: "Aktuell läuft nichts.", ephemeral: true });
            return;
        }

        const queuePreview = snapshot.queue.length > 0
            ? snapshot.queue.slice(0, 10).map((item, index) => `${index + 1}. ${item.sourceLabel}`).join("\n")
            : "Queue ist leer.";

        await interaction.reply({
            content: `Jetzt: ${snapshot.current.sourceLabel}\nStatus: ${snapshot.paused ? "Pausiert" : "Spielt"}\nLautstärke: ${snapshot.volumePercent}%\n\n${queuePreview}`,
            ephemeral: true
        });
    }
}
