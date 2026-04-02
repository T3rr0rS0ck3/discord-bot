import { Client, GatewayIntentBits, IntentsBitField } from "discord.js";
import { ICommand } from "../commands/interfaces/ICommand";

type DiscordBotOptions = {
    token: string;
    guildId?: string;
    commands: ICommand[];
};

export class DiscordBot {
    private readonly client: Client;
    private readonly token: string;
    private readonly guildId?: string;
    private readonly commands = new Map<string, ICommand>();

    public constructor(options: DiscordBotOptions) {
        this.token = options.token;
        this.guildId = options.guildId;

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
                return;
            }

            await readyClient.application.commands.set(commandData);
            console.log("Slash-Commands global registriert (kann bis zu 1h dauern).");
        });

        this.client.on("interactionCreate", async (interaction) => {
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
