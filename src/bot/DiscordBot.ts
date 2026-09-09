import { Client, GatewayIntentBits, IntentsBitField, Partials } from "discord.js";
import type { DiscordBotOptions, DiscordRuntimeStatus } from "../types/Discord";
import { ICommand } from "../commands/interfaces/ICommand";
import { IBotModule } from "../modules/interfaces/IBotModule";

export class DiscordBot {
    private readonly client: Client;
    private readonly token: string;
    private readonly guildId?: string;
    private readonly buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    private readonly onReady?: (client: Client) => Promise<void> | void;
    private readonly onStatusChange?: (status: DiscordRuntimeStatus) => void;
    private status: DiscordRuntimeStatus = { state: "offline", message: "Bot is offline.", updatedAt: new Date().toISOString() };
    private readonly modules: IBotModule[] = [];
    private readonly commands = new Map<string, ICommand>();

    public constructor(options: DiscordBotOptions & { modules?: IBotModule[] }) {
        this.token = options.token;
        this.guildId = options.guildId;
        this.buttonHandler = options.buttonHandler;
        this.onReady = options.onReady;
        this.onStatusChange = options.onStatusChange;
        this.modules = options.modules ?? [];

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessageReactions,
                IntentsBitField.Flags.GuildVoiceStates,
                IntentsBitField.Flags.Guilds
            ],
            partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
        });

        for (const command of options.commands) {
            this.commands.set(command.data.name, command);
        }

        this.registerEvents();
    }

    public async start(): Promise<void> {
        this.setStatus("starting", "Connecting to Discord...");
        try {
            await this.client.login(this.token);
        } catch (error) {
            const code = error && typeof error === "object" && "code" in error
                ? String((error as { code?: unknown }).code)
                : "UnknownError";
            const message = code === "TokenInvalid"
                ? "Invalid Discord token. Update it in the admin UI and restart the bot."
                : `Discord login failed (${code}). Check the token and Discord connection.`;

            this.setStatus(code === "TokenInvalid" ? "token-invalid" : "error", message);
            console.warn(`[Discord] ${message} The admin UI remains available.`);
            this.client.destroy();
        }
    }

    public async stop(): Promise<void> {
        this.client.destroy();
        this.setStatus("offline", "Bot is offline.");
    }

    public getReadyClient(): Client | undefined {
        return this.client.isReady() ? this.client : undefined;
    }

    public getStatus(): DiscordRuntimeStatus {
        return this.status;
    }

    private setStatus(state: DiscordRuntimeStatus["state"], message: string): void {
        this.status = { state, message, updatedAt: new Date().toISOString() };
        this.onStatusChange?.(this.status);
    }

    private registerEvents(): void {
        this.client.on("error", (error) => {
            console.error("[Discord] Client error:", error);
        });

        this.client.once("clientReady", async (readyClient) => {
            this.setStatus("online", `Connected as ${readyClient.user.tag}.`);
            try {
                console.log(`Bot ist online als ${readyClient.user.tag}`);

                const commandData = [...this.commands.values()].map((command) => command.data.toJSON());

                if (this.guildId) {
                    await readyClient.application.commands.set(commandData, this.guildId);
                    console.log(`Slash commands registered for guild ${this.guildId}.`);

                    // Remove old global commands so Discord does not show duplicate old/new variants.
                    await readyClient.application.commands.set([]);
                    console.log("Old global slash commands removed.");

                    if (this.onReady) {
                        await this.onReady(readyClient);
                    }

                    return;
                }

                await readyClient.application.commands.set(commandData);
                console.log("Slash commands registered globally (can take up to 1 hour).");

                if (this.onReady) {
                    await this.onReady(readyClient);
                }
            } catch (error) {
                if (this.guildId) {
                    this.setStatus("guild-unreachable", `Discord is online, but guild ${this.guildId} is unreachable.`);
                } else {
                    this.setStatus("error", "Discord connected, but startup setup failed.");
                }
                console.error(
                    `[Discord] Startup setup failed (guild: ${this.guildId ?? "global"}). Check Guild ID and bot installation in the admin UI, then restart the bot. The admin UI remains available.`,
                    error
                );
            }
        });

        this.client.on("interactionCreate", async (interaction) => {
            if (interaction.isRoleSelectMenu()) {
                try {
                    for (const module of this.modules) {
                        if (await module.handleRoleSelectInteraction?.(interaction)) return;
                    }
                    await interaction.reply({ content: "Diese Rollenauswahl ist derzeit nicht aktiv.", ephemeral: true });
                } catch (error) {
                    console.error("Role select handling error:", error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "Die Rollenauswahl konnte nicht verarbeitet werden.", ephemeral: true });
                    }
                }
                return;
            }
            if (interaction.isButton() && this.buttonHandler) {
                try {
                    const handled = await this.buttonHandler(interaction.customId, interaction);
                    if (handled) {
                        return;
                    }
                }
                catch (error) {
                    console.error("Button handling error:", error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "Button action failed.", ephemeral: true });
                    }
                    return;
                }
            }

            if (interaction.isAutocomplete()) {
                const command = this.commands.get(interaction.commandName);
                if (!command?.executeAutocomplete) {
                    return;
                }

                try {
                    await command.executeAutocomplete(interaction);
                }
                catch (error) {
                    console.error("Command autocomplete error:", error);
                    if (!interaction.responded) {
                        await interaction.respond([]);
                    }
                }
                return;
            }

            if (!interaction.isChatInputCommand()) {
                return;
            }

            const command = this.commands.get(interaction.commandName);

            if (!command) {
                return;
            }

            try {
                await command.execute(interaction);
            }
            catch (error) {
                console.error("Command execution error:", error);

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: "An error occurred while executing the command.",
                        ephemeral: true
                    });
                    return;
                }

                await interaction.reply({
                    content: "An error occurred while executing the command.",
                    ephemeral: true
                });
            }
        });

        // Message Reaction Add Event
        this.client.on("messageReactionAdd", async (reaction, user) => {
            if (user.partial) {
                try {
                    await user.fetch();
                } catch (error) {
                    console.error("[Welcome] Failed to fetch user:", error);
                    return;
                }
            }

            // Ignore bot reactions
            if (user.bot) {
                return;
            }

            // Ensure reaction is fully fetched
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.error("[Welcome] Failed to fetch reaction:", error);
                    return;
                }
            }

            for (const module of this.modules) {
                if (!module.handleMessageReactionAdd) {
                    continue;
                }

                try {
                    const handled = await module.handleMessageReactionAdd(reaction as any, user as any);
                    if (handled) {
                        return;
                    }
                } catch (error) {
                    console.error(`[${module.name}] messageReactionAdd error:`, error);
                }
            }
        });

        // Message Reaction Remove Event
        this.client.on("messageReactionRemove", async (reaction, user) => {
            if (user.partial) {
                try {
                    await user.fetch();
                } catch (error) {
                    console.error("[Welcome] Failed to fetch user:", error);
                    return;
                }
            }

            // Ignore bot reactions
            if (user.bot) {
                return;
            }

            // Ensure reaction is fully fetched
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.error("[Welcome] Failed to fetch reaction:", error);
                    return;
                }
            }

            for (const module of this.modules) {
                if (!module.handleMessageReactionRemove) {
                    continue;
                }

                try {
                    const handled = await module.handleMessageReactionRemove(reaction as any, user as any);
                    if (handled) {
                        return;
                    }
                } catch (error) {
                    console.error(`[${module.name}] messageReactionRemove error:`, error);
                }
            }
        });
    }
}
