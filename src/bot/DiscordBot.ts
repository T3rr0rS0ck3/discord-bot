import { Client, GatewayIntentBits, IntentsBitField } from "discord.js";
import { ICommand } from "../commands/interfaces/ICommand";

type DiscordBotOptions = {
    token: string;
    guildId?: string;
    commands: ICommand[];
    buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    onReady?: (client: Client) => Promise<void> | void;
};

export class DiscordBot {
    private readonly client: Client;
    private readonly token: string;
    private readonly guildId?: string;
    private readonly buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    private readonly onReady?: (client: Client) => Promise<void> | void;
    private readonly commands = new Map<string, ICommand>();

    public constructor(options: DiscordBotOptions) {
        this.token = options.token;
        this.guildId = options.guildId;
        this.buttonHandler = options.buttonHandler;
        this.onReady = options.onReady;

        this.client = new Client({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, IntentsBitField.Flags.GuildVoiceStates, IntentsBitField.Flags.Guilds]
        });

        for (const command of options.commands) {
            this.commands.set(command.data.name, command);
        }

        this.registerEvents();
    }

    public async start(): Promise<void> {
        await this.client.login(this.token);
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
    }
}
