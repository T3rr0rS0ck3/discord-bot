import { Client, GatewayIntentBits, IntentsBitField, Partials } from "discord.js";
import type { DiscordBotOptions } from "../types/Discord";
import { ICommand } from "../commands/interfaces/ICommand";
import { IBotModule } from "../modules/interfaces/IBotModule";

export class DiscordBot {
    private readonly client: Client;
    private readonly token: string;
    private readonly guildId?: string;
    private readonly buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    private readonly onReady?: (client: Client) => Promise<void> | void;
    private readonly modules: IBotModule[] = [];
    private readonly commands = new Map<string, ICommand>();

    public constructor(options: DiscordBotOptions & { modules?: IBotModule[] }) {
        this.token = options.token;
        this.guildId = options.guildId;
        this.buttonHandler = options.buttonHandler;
        this.onReady = options.onReady;
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
        await this.client.login(this.token);
    }

    public async stop(): Promise<void> {
        this.client.destroy();
    }

    public getReadyClient(): Client | undefined {
        return this.client.isReady() ? this.client : undefined;
    }

    private registerEvents(): void {
        this.client.once("clientReady", async (readyClient) => {
            console.log(`Bot ist online als ${readyClient.user.tag}`);

            const commandData = [...this.commands.values()].map((command) => command.data.toJSON());

            if (this.guildId) {
                await readyClient.application.commands.set(commandData, this.guildId);
                console.log(`Slash-Commands für Guild ${this.guildId} registriert.`);

                // Remove old global commands so Discord does not show duplicate old/new variants.
                await readyClient.application.commands.set([]);
                console.log("Alte globale Slash-Commands entfernt.");

                if (this.onReady) {
                    await this.onReady(readyClient);
                }

                return;
            }

            await readyClient.application.commands.set(commandData);
            console.log("Slash-Commands global registriert (kann bis zu 1h dauern).");

            if (this.onReady) {
                await this.onReady(readyClient);
            }
        });

        this.client.on("interactionCreate", async (interaction) => {
            if (interaction.isButton() && this.buttonHandler) {
                try {
                    const handled = await this.buttonHandler(interaction.customId, interaction);
                    if (handled) {
                        return;
                    }
                }
                catch (error) {
                    console.error("Fehler bei Button-Handling:", error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "Button-Aktion fehlgeschlagen.", ephemeral: true });
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
                    console.error("Fehler bei Command-Autocomplete:", error);
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
                console.error("Fehler bei Command-Ausführung:", error);

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: "Beim Ausführen ist ein Fehler aufgetreten.",
                        ephemeral: true
                    });
                    return;
                }

                await interaction.reply({
                    content: "Beim Ausführen ist ein Fehler aufgetreten.",
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
                    console.error("[Welcome] Fehler beim Fetch von User:", error);
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
                    console.error("[Welcome] Fehler beim Fetch von Reaction:", error);
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
                    console.error(`[${module.name}] Fehler bei messageReactionAdd:`, error);
                }
            }
        });

        // Message Reaction Remove Event
        this.client.on("messageReactionRemove", async (reaction, user) => {
            if (user.partial) {
                try {
                    await user.fetch();
                } catch (error) {
                    console.error("[Welcome] Fehler beim Fetch von User:", error);
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
                    console.error("[Welcome] Fehler beim Fetch von Reaction:", error);
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
                    console.error(`[${module.name}] Fehler bei messageReactionRemove:`, error);
                }
            }
        });
    }
}
