import { ButtonInteraction, Client, MessageReaction, User } from "discord.js";
import { ICommand } from "../../commands/interfaces/ICommand";
import type { WelcomeRoleOption } from "../../types/Discord";

export interface IBotModule {
    name: string;
    getCommands(): ICommand[];
    initialize?(): Promise<void> | void;
    shutdown?(): Promise<void> | void;
    onReady?(client: Client): Promise<void> | void;
    applyRuntimeConfig?(
        config: { welcomeChannelId?: string; welcomeRoles?: WelcomeRoleOption[] },
        client?: Client
    ): Promise<void> | void;
    handleButtonInteraction?(customId: string, interaction: ButtonInteraction): Promise<boolean>;
    handleMessageReactionAdd?(reaction: MessageReaction, user: User): Promise<boolean>;
    handleMessageReactionRemove?(reaction: MessageReaction, user: User): Promise<boolean>;
}