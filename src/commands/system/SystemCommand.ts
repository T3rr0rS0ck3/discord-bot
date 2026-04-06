import { joinVoiceChannel } from "@discordjs/voice";
import {
    CacheType,
    ChatInputCommandInteraction,
    GuildMember,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextBasedChannel
} from "discord.js";
import { ICommand } from "../interfaces/ICommand";

export class SystemCommand implements ICommand {
    public readonly name = "system";
    public readonly description = "System-Befehle und Moderation";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ping")
                .setDescription("Antwortet mit Pong!"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("join")
                .setDescription("Joint deinem aktuellen Voice-Channel"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("clear")
                .setDescription("Loescht alle Nachrichten im aktuellen Channel"));

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "Dieser Command geht nur auf einem Server.", ephemeral: true });
            return;
        }

        const cachedInteraction = interaction as ChatInputCommandInteraction<"cached">;

        const subcommand = cachedInteraction.options.getSubcommand(true);

        switch (subcommand) {
            case "ping":
                await this.handlePing(cachedInteraction);
                return;
            case "join":
                await this.handleJoin(cachedInteraction);
                return;
            case "clear":
                await this.handleClear(cachedInteraction);
                return;
            default:
                await cachedInteraction.reply({ content: "Unbekannter Subcommand.", ephemeral: true });
        }
    }

    private async handlePing(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        await interaction.reply("Pong! 🏓");
    }

    private async handleJoin(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const member = interaction.member instanceof GuildMember
            ? interaction.member
            : await interaction.guild.members.fetch(interaction.user.id);

        const voiceChannel = member.voice.channel;

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

    private async handleClear(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || !("messages" in channel)) {
            await interaction.reply({ content: "Dieser Channel unterstuetzt keine Nachrichten-Loeschung.", ephemeral: true });
            return;
        }

        const memberPerms = interaction.memberPermissions;
        if (!memberPerms?.has(PermissionFlagsBits.ManageMessages)) {
            await interaction.reply({ content: "Du brauchst die Berechtigung 'Manage Messages'.", ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember) {
            await interaction.reply({ content: "Bot-Mitglied konnte nicht aufgeloest werden.", ephemeral: true });
            return;
        }

        if (!("permissionsFor" in channel) || typeof channel.permissionsFor !== "function") {
            await interaction.reply({ content: "Dieser Channel unterstuetzt keine Rechtepruefung.", ephemeral: true });
            return;
        }

        const botPerms = channel.permissionsFor(botMember);
        if (!botPerms?.has(PermissionFlagsBits.ManageMessages) || !botPerms.has(PermissionFlagsBits.ReadMessageHistory)) {
            await interaction.reply({
                content: "Mir fehlen Rechte im Channel (Manage Messages + Read Message History).",
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const textChannel = channel as TextBasedChannel;
        let deletedCount = 0;
        let lastMessageId: string | undefined;

        while (true) {
            const batch = await textChannel.messages.fetch({ limit: 100, before: lastMessageId });
            if (batch.size === 0) {
                break;
            }

            for (const message of batch.values()) {
                try {
                    await message.delete();
                    deletedCount += 1;
                } catch {
                    // Ignore single-message delete failures to keep the cleanup running.
                }
            }

            lastMessageId = batch.last()?.id;
        }

        await interaction.editReply(`Fertig. ${deletedCount} Nachrichten wurden im aktuellen Channel geloescht.`);
    }
}
