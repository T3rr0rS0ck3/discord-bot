import {
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextBasedChannel
} from "discord.js";
import { ICommand } from "../interfaces/ICommand";

export class ClearCommand implements ICommand {
    public readonly name = "clear";
    public readonly description = "Delete all messages in the current channel";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false);

    public async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inCachedGuild()) {
            await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
            return;
        }

        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || !("messages" in channel)) {
            await interaction.reply({ content: "This channel does not support message deletion.", ephemeral: true });
            return;
        }

        const memberPerms = interaction.member.permissions;
        if (!memberPerms.has(PermissionFlagsBits.ManageMessages)) {
            await interaction.reply({ content: "You need the 'Manage Messages' permission.", ephemeral: true });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember) {
            await interaction.reply({ content: "Unable to resolve bot member.", ephemeral: true });
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
