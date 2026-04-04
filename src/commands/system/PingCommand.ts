import { SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces/ICommand";

export class PingCommand implements ICommand {
    public readonly name = "ping";
    public readonly description = "Antwortet mit Pong!";

    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description);

    public async execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void> {
        await interaction.reply("Pong! 🏓");
    }
}
