import { ButtonInteraction, Client, MessageReaction, User } from "discord.js";
import { ICommand } from "../../commands/interfaces/ICommand";

export interface IBotModule {
    name: string;
    getCommands(): ICommand[];
    initialize?(): Promise<void> | void;
    onReady?(client: Client): Promise<void> | void;
    handleButtonInteraction?(customId: string, interaction: ButtonInteraction): Promise<boolean>;
    handleMessageReactionAdd?(reaction: MessageReaction, user: User): Promise<boolean>;
    handleMessageReactionRemove?(reaction: MessageReaction, user: User): Promise<boolean>;
}