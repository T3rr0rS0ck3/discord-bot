import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ICommand } from "./interfaces/ICommand";
import { entersState, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";

export class PlayCommand implements ICommand {
    public readonly name = "play";
    public readonly description = "Spielt einen Sound oder eine Audio-URL in deinem Voice-Channel ab";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((option) =>
            option
                .setName("source")
                .setDescription("Lokaler Dateipfad oder direkte Audio-URL")
                .setRequired(true));

    public constructor() {
    }

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "Dieser Command geht nur auf einem Server.", ephemeral: true });
            return;
        }

        const channel = interaction.member.voice.channel;

        if (!channel || !channel.isVoiceBased()) {
            await interaction.reply({ content: "Du musst zuerst in einem Voice-Channel sein.", ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        const startedAt = Date.now();

        connection.on("stateChange", (oldState, newState) => {
            console.log(`[VoiceReady] State Change (+${Date.now() - startedAt}ms): ${oldState.status} -> ${newState.status}`);
        });

        connection.on("error", (error) => {
            console.error(`[VoiceReady] Fehler: ${error.message}`);
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
            await interaction.editReply(`Voice-Connection ist Ready in ${channel}. 🎧`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await interaction.editReply(`Voice-Connection wurde nicht Ready. Status: ${connection.state.status}. Fehler: ${message}`);
        }
        finally {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
        }
    }
}
