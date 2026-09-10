import { Client, TextChannel, MessageReaction, User } from "discord.js";
import type { WelcomeModuleOptions, WelcomeRoleOption } from "../types/Discord";
import { ICommand } from "../commands/interfaces/ICommand";
import { RoleService } from "../services/RoleService";
import { WelcomeRoleAssignmentService } from "../services/WelcomeRoleAssignmentService";
import { IBotModule } from "./interfaces/IBotModule";

export class WelcomeModule implements IBotModule {
    public readonly name = "welcome";
    private readonly guildId?: string;
    private welcomeChannelId?: string;
    private assignmentService: WelcomeRoleAssignmentService;

    public constructor(options: WelcomeModuleOptions) {
        this.guildId = options.guildId;
        this.welcomeChannelId = options.welcomeChannelId;
        this.assignmentService = new WelcomeRoleAssignmentService(
            options.roles.map((r) => ({
                name: r.name,
                emoji: r.emoji,
                description: r.description
            })), {
                title: options.welcomeTitle,
                reactionPrompt: options.welcomeReactionPrompt,
                reactionInstructions: options.welcomeReactionInstructions
            }
        );
    }

    public getCommands(): ICommand[] {
        return [];
    }

    public async initialize(): Promise<void> {
        if (!this.welcomeChannelId) {
            console.log("[Welcome] No welcome channel configured. Skipping initialization.");
            return;
        }
        console.log(`[Welcome] Initialized (channel: ${this.welcomeChannelId})`);
    }

    public async onReady(client: Client): Promise<void> {
        await this.syncWelcomeSetup(client);
    }

    public async applyRuntimeConfig(
        config: {
            welcomeChannelId?: string;
            welcomeTitle?: string;
            welcomeReactionPrompt?: string;
            welcomeReactionInstructions?: string;
            welcomeRoles?: WelcomeRoleOption[];
        },
        client?: Client
    ): Promise<void> {
        this.welcomeChannelId = config.welcomeChannelId;

        if (config.welcomeRoles || config.welcomeTitle || config.welcomeReactionPrompt || config.welcomeReactionInstructions) {
            this.assignmentService = new WelcomeRoleAssignmentService(
                (config.welcomeRoles ?? this.assignmentService.getRoleConfigs()).map((role) => ({
                    name: role.name,
                    emoji: role.emoji,
                    description: role.description
                })), {
                    title: config.welcomeTitle,
                    reactionPrompt: config.welcomeReactionPrompt,
                    reactionInstructions: config.welcomeReactionInstructions
                }
            );
        }

        console.log("[Welcome] Runtime configuration updated.");

        if (client) {
            await this.syncWelcomeSetup(client);
        }
    }

    private async syncWelcomeSetup(client: Client): Promise<void> {
        if (!this.guildId || !this.welcomeChannelId) {
            return;
        }

        try {
            const guild = await client.guilds.fetch(this.guildId);

            const roleConfigs = this.assignmentService.getRoleConfigs().map((role) => ({
                name: role.name,
                mentionable: false,
                hoist: false,
                reason: "Welcome role auto-created"
            }));
            await RoleService.ensureRoles(guild, roleConfigs);

            const channel = await guild.channels.fetch(this.welcomeChannelId);

            if (!channel || !channel.isTextBased() || channel.isDMBased()) {
                console.error("[Welcome] Welcome channel is not text-based.");
                return;
            }

            const textChannel = channel as TextChannel;

            // Fetch the last 100 messages to detect an existing welcome message.
            const messages = await textChannel.messages.fetch({ limit: 100 });
            const existingWelcome = messages.find(
                (m) => m.author.id === client.user?.id && (m.pinned || m.content.includes("Welcome"))
            );

            const message = existingWelcome ?? await textChannel.send({
                content: this.assignmentService.getWelcomeMessage()
            });

            if (existingWelcome) {
                await message.edit({
                    content: this.assignmentService.getWelcomeMessage()
                });
                try {
                    await message.reactions.removeAll();
                } catch (error) {
                    console.error("[Welcome] Failed to remove old reactions:", error);
                }
                console.log("[Welcome] Welcome message updated.");
            }

            // Pin the welcome message.
            try {
                await message.pin();
                console.log("[Welcome] Welcome message pinned.");
            } catch (error) {
                console.error("[Welcome] Failed to pin welcome message:", error);
            }

            // Add reactions.
            const emojis = this.assignmentService.getRoleEmojis();
            for (const emoji of emojis) {
                try {
                    await message.react(emoji);
                } catch (error) {
                    console.error(`[Welcome] Failed to add reaction ${emoji}:`, error);
                }
            }

            // Set channel permissions: reactions only, no regular messages.
            try {
                // Prevent @everyone from sending messages.
                await textChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false,
                    EmbedLinks: false,
                    AttachFiles: false,
                    AddReactions: true,
                    ViewChannel: true
                });

                // Ensure bot can manage and react.
                const botId = client.user?.id;
                if (botId) {
                    await textChannel.permissionOverwrites.edit(botId, {
                        SendMessages: true,
                        ManageMessages: true,
                        AddReactions: true
                    });
                }

                console.log("[Welcome] Channel permissions updated: reactions only.");
            } catch (error) {
                console.error("[Welcome] Failed to update channel permissions:", error);
            }

            console.log("[Welcome] Welcome message sent with reactions.");
        } catch (error) {
            console.error("[Welcome] Failed to send welcome message:", error);
        }
    }

    public async handleMessageReactionAdd(
        reaction: MessageReaction,
        user: User
    ): Promise<boolean> {
        // Check if this is a welcome message reaction.
        if (!this.isWelcomeReaction(reaction)) {
            return false;
        }

        const guild = reaction.message.guild;
        if (!guild) {
            return false;
        }

        const member = await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
        if (!member) {
            return false;
        }

        const emoji = this.getReactionEmojiKey(reaction);
        if (!emoji) {
            return false;
        }

        try {
            await this.assignmentService.assignRoleByReaction(guild, member, emoji);
            return true;
        } catch (error) {
            console.error(`[Welcome] Failed role assignment for "${emoji}":`, error);
            return false;
        }
    }

    public async handleMessageReactionRemove(
        reaction: MessageReaction,
        user: User
    ): Promise<boolean> {
        // Check if this is a welcome message reaction.
        if (!this.isWelcomeReaction(reaction)) {
            return false;
        }

        const guild = reaction.message.guild;
        if (!guild) {
            return false;
        }

        const member = await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
        if (!member) {
            return false;
        }

        const emoji = this.getReactionEmojiKey(reaction);
        if (!emoji) {
            return false;
        }

        try {
            await this.assignmentService.removeRoleByReaction(guild, member, emoji);
            return true;
        } catch (error) {
            console.error(`[Welcome] Failed to remove role for "${emoji}":`, error);
            return false;
        }
    }

    private isWelcomeReaction(reaction: MessageReaction): boolean {
        // Check if reaction is in the welcome channel.
        if (!this.welcomeChannelId) {
            return false;
        }

        if (reaction.message.channelId !== this.welcomeChannelId) {
            return false;
        }

        // Check if emoji is one of our welcome emojis.
        const emoji = this.getReactionEmojiKey(reaction);
        if (!emoji) {
            return false;
        }

        return this.assignmentService.isValidEmoji(emoji);
    }

    private getReactionEmojiKey(reaction: MessageReaction): string | undefined {
        return reaction.emoji.id ? reaction.emoji.toString() : reaction.emoji.name ?? undefined;
    }
}
