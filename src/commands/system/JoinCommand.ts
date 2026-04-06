import { joinVoiceChannel } from "@discordjs/voice";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces/ICommand";

export class JoinCommand implements ICommand {
    public readonly name = "join";
    public readonly description = "Join your current voice channel";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
            return;
        }

        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel || !voiceChannel.isVoiceBased()) {
            await interaction.reply({ content: "You must be in a voice channel first.", ephemeral: true });
            return;
        }

        joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        await interaction.reply(`I joined ${voiceChannel}. 🎧`);
    }
}
