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
    public readonly description = "System commands and moderation";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ping")
                .setDescription("Reply with Pong!"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("join")
                .setDescription("Join your current voice channel"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("clear")
                .setDescription("Delete all messages in the current channel"));

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
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
                await cachedInteraction.reply({ content: "Unknown subcommand.", ephemeral: true });
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

    private async handleClear(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || !("messages" in channel)) {
            await interaction.reply({ content: "This channel does not support message deletion.", ephemeral: true });
            return;
        }

        const memberPerms = interaction.memberPermissions;
        if (!memberPerms?.has(PermissionFlagsBits.ManageMessages)) {
            await interaction.reply({ content: "You need the 'Manage Messages' permission.", ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember) {
            await interaction.reply({ content: "Unable to resolve bot member.", ephemeral: true });
            return;
        }

        if (!("permissionsFor" in channel) || typeof channel.permissionsFor !== "function") {
            await interaction.reply({ content: "This channel does not support permission checks.", ephemeral: true });
            return;
        }

        const botPerms = channel.permissionsFor(botMember);
        if (!botPerms?.has(PermissionFlagsBits.ManageMessages) || !botPerms.has(PermissionFlagsBits.ReadMessageHistory)) {
            await interaction.reply({
                content: "I am missing channel permissions (Manage Messages + Read Message History).",
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

        await interaction.editReply(`Done. Deleted ${deletedCount} messages from the current channel.`);
    }
}
