import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";

export interface ICommand {
    targetGuildId?: string;
    achievementModuleName?: string;
    name: string;
    description: string;
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
    executeAutocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
