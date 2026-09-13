import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { ICommand } from "../interfaces/ICommand";

export class AchievementsCommand implements ICommand {
    public readonly name = "achievements";
    public readonly description = "Zeigt Achievement-Fortschritt und freigeschaltete Medaillen.";
    public readonly data = new SlashCommandBuilder()
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption(option => option.setName("user").setDescription("Oeffentliche Achievements eines Nutzers anzeigen"))
        .addStringOption(option => option
            .setName("filter")
            .setDescription("Achievements filtern")
            .addChoices(
                { name: "Alle", value: "all" },
                { name: "Erreicht", value: "unlocked" },
                { name: "In Arbeit", value: "progress" },
                { name: "Allgemein", value: "general" },
                { name: "Musik", value: "music" },
                { name: "Community", value: "community" },
                { name: "Abstimmungen", value: "voting" },
                { name: "Welcome", value: "welcome" },
                { name: "Twitch", value: "twitch" }
            ));

    public constructor(
        private readonly executeHandler: (interaction: ChatInputCommandInteraction) => Promise<void>
    ) {}

    public execute(interaction: ChatInputCommandInteraction): Promise<void> {
        return this.executeHandler(interaction);
    }
}