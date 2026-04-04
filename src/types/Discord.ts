import type { Client } from "discord.js";
import type { ICommand } from "../commands/interfaces/ICommand";

export type DiscordBotOptions = {
    token: string;
    guildId?: string;
    commands: ICommand[];
    buttonHandler?: (customId: string, interaction: import("discord.js").ButtonInteraction) => Promise<boolean>;
    onReady?: (client: Client) => Promise<void> | void;
};

export type BotModuleFactoryOptions = {
    guildId?: string;
    musicRoleName: string;
};

export type MusicBotModuleOptions = {
    guildId?: string;
    musicRoleName: string;
};
