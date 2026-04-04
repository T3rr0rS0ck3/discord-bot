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
            "# 👋 Willkommen!\n\n" +
            "Reagiere auf ein Emoji unten, um die entsprechende Rolle zu erhalten:\n\n" +
            roleList +
            "\n\n" +
            "Klicke auf die Reaction, um die Rolle zu erhalten. Klicke nochmal um sie zu entfernen."
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
            console.warn(`[Welcome] Unbekanntes Emoji: ${emoji}`);
            return;
        }

        try {
            const role = RoleService.findRoleByName(guild, roleConfig.name);
            if (!role) {
                console.error(`[Welcome] Rolle "${roleConfig.name}" existiert nicht.`);
                return;
            }

            const hasMemberRole = RoleService.memberHasRoleName(member, roleConfig.name);

            if (!hasMemberRole) {
                await member.roles.add(role);
                console.log(
                    `[Welcome] ✅ ${member.user.tag} erhielt Rolle "${roleConfig.name}" via ${emoji}`
                );
            }
        } catch (error) {
            console.error(`[Welcome] Fehler beim Hinzufügen von Rolle "${roleConfig.name}":`, error);
        }
    }

    public async removeRoleByReaction(
        guild: Guild,
        member: GuildMember,
        emoji: string
    ): Promise<void> {
        const roleConfig = this.getRoleConfig(emoji);
        if (!roleConfig) {
            console.warn(`[Welcome] Unbekanntes Emoji: ${emoji}`);
            return;
        }

        try {
            const role = RoleService.findRoleByName(guild, roleConfig.name);
            if (!role) {
                console.error(`[Welcome] Rolle "${roleConfig.name}" existiert nicht.`);
                return;
            }

            const hasMemberRole = RoleService.memberHasRoleName(member, roleConfig.name);

            if (hasMemberRole) {
                await member.roles.remove(role);
                console.log(
                    `[Welcome] ✅ ${member.user.tag} verlor Rolle "${roleConfig.name}" via ${emoji}`
                );
            }
        } catch (error) {
            console.error(`[Welcome] Fehler beim Entfernen von Rolle "${roleConfig.name}":`, error);
        }
    }
}
