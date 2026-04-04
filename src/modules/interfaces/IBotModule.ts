import { ButtonInteraction, Client } from "discord.js";
import { ICommand } from "../../commands/interfaces/ICommand";

export interface IBotModule {
    name: string;
    getCommands(): ICommand[];
    initialize?(): Promise<void> | void;
    onReady?(client: Client): Promise<void> | void;
    handleButtonInteraction?(customId: string, interaction: ButtonInteraction): Promise<boolean>;
}