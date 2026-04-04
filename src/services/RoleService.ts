import { type Client, PermissionFlagsBits, type Guild, type Role } from "discord.js";

export class RoleService {
    /**
     * Finds a role by name in a guild
     */
    public static findRoleByName(guild: Guild, roleName: string): Role | undefined {
        return guild.roles.cache.find((role) => role.name === roleName);
    }

    /**
     * Finds a role by ID in a guild
     */
    public static findRoleById(guild: Guild, roleId: string): Role | undefined {
        return guild.roles.cache.find((role) => role.id === roleId);
    }

    /**
     * Checks if bot has permission to manage roles
     */
    public static async canManageRoles(guild: Guild): Promise<boolean> {
        const me = guild.members.me ?? await guild.members.fetchMe();
        return me.permissions.has(PermissionFlagsBits.ManageRoles);
    }

    /**
     * Creates a role with given configuration
     */
    public static async createRole(
        guild: Guild,
        config: {
            name: string;
            mentionable?: boolean;
            hoist?: boolean;
            reason?: string;
        }
    ): Promise<Role | null> {
        try {
            const canManage = await this.canManageRoles(guild);
            if (!canManage) {
                this.log(`❌ Bot hat keine ManageRoles-Berechtigung in "${guild.name}"`);
                return null;
            }

            const role = await guild.roles.create({
                name: config.name,
                mentionable: config.mentionable ?? false,
                hoist: config.hoist ?? false,
                reason: config.reason ?? "Rollen verwaltet durch RoleService"
            });

            this.log(`✓ Rolle erstellt: ${role.name} (${role.id}) in "${guild.name}"`);
            return role;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`❌ Fehler beim Erstellen der Rolle: ${message}`);
            return null;
        }
    }

    /**
     * Gets a role by name, creates it if it doesn't exist
     */
    public static async ensureRole(
        guild: Guild,
        config: {
            name: string;
            mentionable?: boolean;
            hoist?: boolean;
            reason?: string;
        }
    ): Promise<Role | null> {
        const existing = this.findRoleByName(guild, config.name);
        if (existing) {
            this.log(`✓ Rolle existiert bereits: ${existing.name} (${existing.id}) in "${guild.name}"`);
            return existing;
        }

        return await this.createRole(guild, config);
    }

    /**
     * Gets or creates multiple roles in a guild
     */
    public static async ensureRoles(
        guild: Guild,
        configs: Array<{
            name: string;
            mentionable?: boolean;
            hoist?: boolean;
            reason?: string;
        }>
    ): Promise<(Role | null)[]> {
        return Promise.all(configs.map((config) => this.ensureRole(guild, config)));
    }

    /**
     * Gets or creates role for a specific guild by ID
     */
    public static async ensureRoleForGuild(
        client: Client,
        guildId: string,
        config: {
            name: string;
            mentionable?: boolean;
            hoist?: boolean;
            reason?: string;
        }
    ): Promise<string | null> {
        try {
            const guild = await client.guilds.fetch(guildId);
            const role = await this.ensureRole(guild, config);
            return role?.id ?? null;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`❌ Fehler beim Abrufen der Guild: ${message}`);
            return null;
        }
    }

    /**
     * Deletes a role if it exists
     */
    public static async deleteRole(guild: Guild, roleId: string, reason?: string): Promise<boolean> {
        try {
            const canManage = await this.canManageRoles(guild);
            if (!canManage) {
                this.log(`❌ Bot hat keine ManageRoles-Berechtigung zum Löschen in "${guild.name}"`);
                return false;
            }

            const role = this.findRoleById(guild, roleId);
            if (!role) {
                this.log(`⚠ Rolle nicht gefunden: ${roleId}`);
                return false;
            }

            await role.delete(reason ?? "RoleService Löschung");
            this.log(`✓ Rolle gelöscht: ${role.name} (${role.id}) in "${guild.name}"`);
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`❌ Fehler beim Löschen der Rolle: ${message}`);
            return false;
        }
    }

    /**
     * Updates role properties
     */
    public static async updateRole(
        guild: Guild,
        roleId: string,
        config: {
            name?: string;
            mentionable?: boolean;
            hoist?: boolean;
        },
        reason?: string
    ): Promise<Role | null> {
        try {
            const canManage = await this.canManageRoles(guild);
            if (!canManage) {
                this.log(`❌ Bot hat keine ManageRoles-Berechtigung zum Aktualisieren in "${guild.name}"`);
                return null;
            }

            const role = this.findRoleById(guild, roleId);
            if (!role) {
                this.log(`⚠ Rolle nicht gefunden: ${roleId}`);
                return null;
            }

            await role.edit({
                ...config,
                reason: reason ?? "RoleService Update"
            });
            this.log(`✓ Rolle aktualisiert: ${role.name} (${role.id}) in "${guild.name}"`);
            return role;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`❌ Fehler beim Aktualisieren der Rolle: ${message}`);
            return null;
        }
    }

    private static log(message: string): void {
        console.log(`[RoleService] ${message}`);
    }
}
