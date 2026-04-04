import { joinVoiceChannel } from "@discordjs/voice";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces/ICommand";

export class JoinCommand implements ICommand {
    public readonly name = "join";
    public readonly description = "Joint deinem aktuellen Voice-Channel";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "Dieser Command geht nur auf einem Server.", ephemeral: true });
            return;
        }

        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel || !voiceChannel.isVoiceBased()) {
            await interaction.reply({ content: "Du musst zuerst in einem Voice-Channel sein.", ephemeral: true });
            return;
        }

        joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        await interaction.reply(`Ich bin ${voiceChannel} beigetreten. 🎧`);
    }
}
