import { ButtonInteraction, Client, MessageReaction, ModalSubmitInteraction, StringSelectMenuInteraction, User } from "discord.js";
import { ICommand } from "../../commands/interfaces/ICommand";
import type { WelcomeRoleOption } from "../../types/Discord";

export interface IBotModule {
    handleRoleSelectInteraction?(interaction: import("discord.js").RoleSelectMenuInteraction): Promise<boolean>;
    name: string;
    getCommands(): ICommand[];
    initialize?(): Promise<void> | void;
    shutdown?(): Promise<void> | void;
    onReady?(client: Client): Promise<void> | void;
    applyRuntimeConfig?(
        config: {
    communityCategoryName?: string;
    communityEmptyTimeoutSeconds?: number;
    communityMaxChannels?: number;
            communityVotingChannelName?: string;
            communityVotingDurationDays?: number;

            welcomeChannelId?: string;
            welcomeTitle?: string;
            welcomeReactionPrompt?: string;
            welcomeReactionInstructions?: string;
            welcomeRoles?: WelcomeRoleOption[];
            twitchBroadcasterName?: string;
            twitchClientId?: string;
            twitchClientSecret?: string;
            twitchRedirectUri?: string;
            twitchAccessToken?: string;
            twitchRefreshToken?: string;
            twitchAccessTokenExpiresAt?: number;
            twitchFollowerRoleName?: string;
            twitchSubscriberRoleName?: string;
            twitchLinkChannelName?: string;
            twitchLinkPanelTitle?: string;
            twitchLinkPanelMessage?: string;
        },
        client?: Client
    ): Promise<void> | void;
    handleButtonInteraction?(customId: string, interaction: ButtonInteraction): Promise<boolean>;
    handleModalSubmitInteraction?(customId: string, interaction: ModalSubmitInteraction): Promise<boolean>;
    handleStringSelectInteraction?(customId: string, interaction: StringSelectMenuInteraction): Promise<boolean>;
    handleMessageReactionAdd?(reaction: MessageReaction, user: User): Promise<boolean>;
    handleMessageReactionRemove?(reaction: MessageReaction, user: User): Promise<boolean>;
}
