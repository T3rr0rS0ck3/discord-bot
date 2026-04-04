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
            }))
        );
    }

    public getCommands(): ICommand[] {
        return [];
    }

    public async initialize(): Promise<void> {
        if (!this.welcomeChannelId) {
            console.log("[Welcome] Kein Welcome-Channel konfiguriert. Überspringe Initialize.");
            return;
        }
        console.log(`[Welcome] Initialisiert (Channel: ${this.welcomeChannelId})`);
    }

    public async onReady(client: Client): Promise<void> {
        await this.syncWelcomeSetup(client);
    }

    public async applyRuntimeConfig(
        config: { welcomeChannelId?: string; welcomeRoles?: WelcomeRoleOption[] },
        client?: Client
    ): Promise<void> {
        this.welcomeChannelId = config.welcomeChannelId;

        if (config.welcomeRoles) {
            this.assignmentService = new WelcomeRoleAssignmentService(
                config.welcomeRoles.map((role) => ({
                    name: role.name,
                    emoji: role.emoji,
                    description: role.description
                }))
            );
        }

        console.log("[Welcome] Runtime-Konfiguration aktualisiert.");

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
                reason: "Welcome-Rolle automatisch erstellt"
            }));
            await RoleService.ensureRoles(guild, roleConfigs);

            const channel = await guild.channels.fetch(this.welcomeChannelId);

            if (!channel || !channel.isTextBased() || channel.isDMBased()) {
                console.error("[Welcome] Welcome-Channel ist nicht text-basiert.");
                return;
            }

            const textChannel = channel as TextChannel;

            // Fetch letzte 100 Messages um zu schauen ob Welcome-Message schon existiert
            const messages = await textChannel.messages.fetch({ limit: 100 });
            const existingWelcome = messages.find(
                (m) => m.author.id === client.user?.id && m.content.includes("Willkommen")
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
                    console.error("[Welcome] ✗ Fehler beim Entfernen alter Reactions:", error);
                }
                console.log("[Welcome] Welcome-Message aktualisiert.");
            }

            // Pin die Welcome-Nachricht
            try {
                await message.pin();
                console.log("[Welcome] ✓ Welcome-Message gepinnt.");
            } catch (error) {
                console.error("[Welcome] ✗ Fehler beim Pinnen der Nachricht:", error);
            }

            // Add reactions
            const emojis = this.assignmentService.getRoleEmojis();
            for (const emoji of emojis) {
                try {
                    await message.react(emoji);
                } catch (error) {
                    console.error(`[Welcome] Fehler beim Hinzufügen von Reaction ${emoji}:`, error);
                }
            }

            // Set channel permissions: nur Reactions erlaubt, keine Nachrichten
            try {
                // @everyone darf nicht schreiben
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

                // Bot braucht Permissions zum Managen und Reagieren
                const botId = client.user?.id;
                if (botId) {
                    await textChannel.permissionOverwrites.edit(botId, {
                        SendMessages: true,
                        ManageMessages: true,
                        AddReactions: true
                    });
                }

                console.log("[Welcome] ✓ Channel-Permissions gesetzt: nur Reactions erlaubt.");
            } catch (error) {
                console.error("[Welcome] ✗ Fehler beim Setzen der Permissions:", error);
            }

            console.log("[Welcome] Welcome-Message mit Reactions gesendet.");
        } catch (error) {
            console.error("[Welcome] Fehler beim Senden der Welcome-Message:", error);
        }
    }

    public async handleMessageReactionAdd(
        reaction: MessageReaction,
        user: User
    ): Promise<boolean> {
        // Check if this is a welcome message reaction
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
            console.error(`[Welcome] Fehler bei Rollenvergabe für "${emoji}":`, error);
            return false;
        }
    }

    public async handleMessageReactionRemove(
        reaction: MessageReaction,
        user: User
    ): Promise<boolean> {
        // Check if this is a welcome message reaction
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
            console.error(`[Welcome] Fehler beim Entfernen der Rolle für "${emoji}":`, error);
            return false;
        }
    }

    private isWelcomeReaction(reaction: MessageReaction): boolean {
        // Check if reaction is in the welcome channel
        if (!this.welcomeChannelId) {
            return false;
        }

        if (reaction.message.channelId !== this.welcomeChannelId) {
            return false;
        }

        // Check if emoji is one of our welcome emojis
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
