import type { BotModuleFactoryOptions } from "../types/Discord";
import { IBotModule } from "./interfaces/IBotModule";
import { MusicBotModule } from "./MusicBotModule";
import { SystemModule } from "./SystemModule";
import { TwitchRoleModule } from "./TwitchRoleModule";
import { WelcomeModule } from "./WelcomeModule";

import { CommunityModule } from "./CommunityModule";
import { CommunityNameVotingModule } from "./CommunityNameVotingModule";

export class BotModuleFactory {
    public static create(options: BotModuleFactoryOptions): IBotModule[] {
        const modules: IBotModule[] = [
            ...(options.communityEnabled === true ? [new CommunityModule(options)] : []),
            ...(options.communityVotingEnabled === true ? [new CommunityNameVotingModule(options)] : []),
            ...(options.systemEnabled === true ? [new SystemModule()] : []),
            ...(options.musicEnabled === true ? [new MusicBotModule(options)] : [])
        ];

        // Welcome module is optional when configured.
        if (options.welcomeEnabled === true && options.welcomeChannelId && options.welcomeRoles && options.welcomeRoles.length > 0) {
            modules.push(
                new WelcomeModule({
                    guildId: options.guildId,
                    welcomeChannelId: options.welcomeChannelId,
                    welcomeTitle: options.welcomeTitle,
                    welcomeReactionPrompt: options.welcomeReactionPrompt,
                    welcomeReactionInstructions: options.welcomeReactionInstructions,
                    roles: options.welcomeRoles
                })
            );
        }

        // Twitch role module is optional when configured.
        if (options.twitchEnabled === true && options.twitchRole && (options.twitchRole.followerRoleName || options.twitchRole.subscriberRoleName)) {
            modules.push(
                new TwitchRoleModule({
                    guildId: options.guildId,
                    broadcasterName: options.twitchRole.broadcasterName,
                    clientId: options.twitchRole.clientId,
                    clientSecret: options.twitchRole.clientSecret,
                    accessToken: options.twitchRole.accessToken,
                    refreshToken: options.twitchRole.refreshToken,
                    accessTokenExpiresAt: options.twitchRole.accessTokenExpiresAt,
                    followerRoleName: options.twitchRole.followerRoleName,
                    subscriberRoleName: options.twitchRole.subscriberRoleName,
                    redirectUri: options.twitchRole.redirectUri,
                    linkChannelName: options.twitchRole.linkChannelName,
                    linkPanelTitle: options.twitchRole.linkPanelTitle,
                    linkPanelMessage: options.twitchRole.linkPanelMessage,
                    createMemberOAuthState: options.twitchRole.createMemberOAuthState,
                    getMemberLinks: options.twitchRole.getMemberLinks,
                    deleteMemberLink: options.twitchRole.deleteMemberLink,
                    getLinkPanel: options.twitchRole.getLinkPanel,
                    saveLinkPanel: options.twitchRole.saveLinkPanel,
                    saveSyncResult: options.twitchRole.saveSyncResult,
                    addRoleChange: options.twitchRole.addRoleChange,
                    onTokensUpdated: options.twitchRole.onTokensUpdated
                })
            );
        }

        return modules;
    }
}
