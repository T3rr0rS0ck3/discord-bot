import { Guild, GuildMember } from "discord.js";
import { RoleService } from "./RoleService";

export type WelcomeRoleConfig = {
    name: string;
    emoji: string;
    description: string;
};

export class WelcomeRoleAssignmentService {
    private readonly roles: Map<string, WelcomeRoleConfig> = new Map();

    public constructor(roles: WelcomeRoleConfig[]) {
        for (const role of roles) {
            this.roles.set(role.emoji, role);
        }
    }

    public getWelcomeMessage(): string {
        const roleList = Array.from(this.roles.values())
            .map((role) => `${role.emoji} **${role.name}** - ${role.description}`)
            .join("\n");

        return (
            "# 👋 Welcome!\n\n" +
            "React with an emoji below to get the matching role:\n\n" +
            roleList +
            "\n\n" +
            "Click a reaction to get the role. Click it again to remove the role."
        );
    }

    public getRoleEmojis(): string[] {
        return Array.from(this.roles.keys());
    }

    public getRoleConfigs(): WelcomeRoleConfig[] {
        return Array.from(this.roles.values());
    }

    public getRoleConfig(emoji: string): WelcomeRoleConfig | undefined {
        return this.roles.get(emoji);
    }

    public isValidEmoji(emoji: string): boolean {
        return this.roles.has(emoji);
    }

    public async assignRoleByReaction(
        guild: Guild,
        member: GuildMember,
        emoji: string
    ): Promise<void> {
        const roleConfig = this.getRoleConfig(emoji);
        if (!roleConfig) {
            console.warn(`[Welcome] Unknown emoji: ${emoji}`);
            return;
        }

        try {
            const role = RoleService.findRoleByName(guild, roleConfig.name);
            if (!role) {
                console.error(`[Welcome] Role "${roleConfig.name}" does not exist.`);
                return;
            }

            const hasMemberRole = RoleService.memberHasRoleName(member, roleConfig.name);

            if (!hasMemberRole) {
                await member.roles.add(role);
                console.log(
                    `[Welcome] ${member.user.tag} received role "${roleConfig.name}" via ${emoji}`
                );
            }
        } catch (error) {
            console.error(`[Welcome] Failed to add role "${roleConfig.name}":`, error);
        }
    }

    public async removeRoleByReaction(
        guild: Guild,
        member: GuildMember,
        emoji: string
    ): Promise<void> {
        const roleConfig = this.getRoleConfig(emoji);
        if (!roleConfig) {
            console.warn(`[Welcome] Unknown emoji: ${emoji}`);
            return;
        }

        try {
            const role = RoleService.findRoleByName(guild, roleConfig.name);
            if (!role) {
                console.error(`[Welcome] Role "${roleConfig.name}" does not exist.`);
                return;
            }

            const hasMemberRole = RoleService.memberHasRoleName(member, roleConfig.name);

            if (hasMemberRole) {
                await member.roles.remove(role);
                console.log(
                    `[Welcome] ${member.user.tag} lost role "${roleConfig.name}" via ${emoji}`
                );
            }
        } catch (error) {
            console.error(`[Welcome] Failed to remove role "${roleConfig.name}":`, error);
        }
    }
}
