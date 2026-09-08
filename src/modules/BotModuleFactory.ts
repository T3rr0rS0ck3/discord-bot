import type { BotModuleFactoryOptions } from "../types/Discord";
import { IBotModule } from "./interfaces/IBotModule";
import { MusicBotModule } from "./MusicBotModule";
import { SystemModule } from "./SystemModule";
import { TwitchRoleModule } from "./TwitchRoleModule";
import { WelcomeModule } from "./WelcomeModule";

import { CommunityModule } from "./CommunityModule";

export class BotModuleFactory {
    public static create(options: BotModuleFactoryOptions): IBotModule[] {
        const modules: IBotModule[] = [
            ...(options.communityEnabled !== false ? [new CommunityModule(options)] : []),
            ...(options.systemEnabled !== false ? [new SystemModule()] : []),
            ...(options.musicEnabled !== false ? [new MusicBotModule(options)] : [])
        ];

        // Welcome module is optional when configured.
        if (options.welcomeEnabled !== false && options.welcomeChannelId && options.welcomeRoles && options.welcomeRoles.length > 0) {
            modules.push(
                new WelcomeModule({
                    guildId: options.guildId,
                    welcomeChannelId: options.welcomeChannelId,
                    roles: options.welcomeRoles
                })
            );
        }

        // Twitch role module is optional when configured.
        if (options.twitchEnabled !== false && options.twitchRole && (options.twitchRole.followerRoleName || options.twitchRole.subscriberRoleName)) {
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
                    onTokensUpdated: options.twitchRole.onTokensUpdated
                })
            );
        }

        return modules;
    }
}
