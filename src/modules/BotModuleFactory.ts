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
        const guildIds = options.guildIds?.length
            ? [...new Set(options.guildIds)]
            : options.guildId ? [options.guildId] : [];
        const guildTargets: Array<string | undefined> = guildIds.length > 0 ? guildIds : [undefined];
        const modules: IBotModule[] = [];

        for (const guildId of guildTargets) {
            const profile = guildId ? options.guildConfigs?.[guildId] : undefined;
            const guildOptions = {
                ...options,
                ...profile,
                guildId,
                guildIds: undefined,
                guildConfigs: undefined,
                twitchRole: {
                    ...options.twitchRole,
                    broadcasterName: profile?.twitchBroadcasterName ?? options.twitchRole?.broadcasterName,
                    clientId: profile?.twitchClientId ?? options.twitchRole?.clientId,
                    clientSecret: profile?.twitchClientSecret ?? options.twitchRole?.clientSecret,
                    redirectUri: profile?.twitchRedirectUri ?? options.twitchRole?.redirectUri,
                    accessToken: profile?.twitchAccessToken ?? options.twitchRole?.accessToken,
                    refreshToken: profile?.twitchRefreshToken ?? options.twitchRole?.refreshToken,
                    accessTokenExpiresAt: profile?.twitchAccessTokenExpiresAt ?? options.twitchRole?.accessTokenExpiresAt,
                    followerRoleName: profile?.twitchFollowerRoleName ?? options.twitchRole?.followerRoleName,
                    subscriberRoleName: profile?.twitchSubscriberRoleName ?? options.twitchRole?.subscriberRoleName,
                    linkChannelName: profile?.twitchLinkChannelName ?? options.twitchRole?.linkChannelName,
                    linkPanelTitle: profile?.twitchLinkPanelTitle ?? options.twitchRole?.linkPanelTitle,
                    linkPanelMessage: profile?.twitchLinkPanelMessage ?? options.twitchRole?.linkPanelMessage
                }
            };
            if (guildOptions.systemEnabled === true) modules.push(Object.assign(new SystemModule(), { targetGuildId: guildId }));
            if (guildOptions.musicEnabled === true) modules.push(Object.assign(new MusicBotModule(guildOptions), { targetGuildId: guildId }));
            if (guildOptions.communityEnabled === true) modules.push(Object.assign(new CommunityModule(guildOptions), { targetGuildId: guildId }));
            if (guildOptions.communityVotingEnabled === true) modules.push(Object.assign(new CommunityNameVotingModule(guildOptions), { targetGuildId: guildId }));

            if (guildOptions.welcomeEnabled === true && guildOptions.welcomeChannelId && guildOptions.welcomeRoles && guildOptions.welcomeRoles.length > 0) {
                modules.push(Object.assign(new WelcomeModule({
                    guildId,
                    welcomeChannelId: options.welcomeChannelId,
                    welcomeTitle: options.welcomeTitle,
                    welcomeReactionPrompt: options.welcomeReactionPrompt,
                    welcomeReactionInstructions: options.welcomeReactionInstructions,
                    roles: guildOptions.welcomeRoles
                }), { targetGuildId: guildId }));
            }

            if (guildOptions.twitchEnabled === true && guildOptions.twitchRole && (guildOptions.twitchRole.followerRoleName || guildOptions.twitchRole.subscriberRoleName)) {
                modules.push(Object.assign(new TwitchRoleModule({
                    guildId,
                    broadcasterName: guildOptions.twitchRole.broadcasterName,
                    clientId: guildOptions.twitchRole.clientId,
                    clientSecret: guildOptions.twitchRole.clientSecret,
                    accessToken: guildOptions.twitchRole.accessToken,
                    refreshToken: guildOptions.twitchRole.refreshToken,
                    accessTokenExpiresAt: guildOptions.twitchRole.accessTokenExpiresAt,
                    followerRoleName: guildOptions.twitchRole.followerRoleName,
                    subscriberRoleName: guildOptions.twitchRole.subscriberRoleName,
                    redirectUri: guildOptions.twitchRole.redirectUri,
                    linkChannelName: guildOptions.twitchRole.linkChannelName,
                    linkPanelTitle: guildOptions.twitchRole.linkPanelTitle,
                    linkPanelMessage: guildOptions.twitchRole.linkPanelMessage,
                    createMemberOAuthState: guildOptions.twitchRole.createMemberOAuthState,
                    getMemberLinks: guildOptions.twitchRole.getMemberLinks,
                    deleteMemberLink: guildOptions.twitchRole.deleteMemberLink,
                    getLinkPanel: guildOptions.twitchRole.getLinkPanel,
                    saveLinkPanel: guildOptions.twitchRole.saveLinkPanel,
                    saveSyncResult: guildOptions.twitchRole.saveSyncResult,
                    addRoleChange: guildOptions.twitchRole.addRoleChange,
                    onTokensUpdated: tokens => guildOptions.twitchRole.onTokensUpdated?.({ ...tokens, guildId })
                }), { targetGuildId: guildId }));
            }
        }

        for (const module of modules) {
            module.targetGuildId ??= guildTargets.length === 1 ? guildTargets[0] : undefined;
        }

        return modules;
    }
}
