import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import http, { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { AdminConfig } from "./AdminConfigStore";

type AdminWebServerOptions = {
    port: number;
    getAuthConfig: () => { username: string; token: string };
    getConfig: () => AdminConfig;
    getLogs: () => Array<{ timestamp: number; level: string; message: string }>;
    saveConfig: (config: AdminConfig) => Promise<void>;
    restartBot: () => Promise<void>;
    getServerEmojis: () => Promise<Array<{ value: string; label: string }>>;
    getWelcomeChannels: () => Promise<Array<{ id: string; name: string }>>;
};

export class AdminWebServer {
    private readonly options: AdminWebServerOptions;
    private readonly adminAppBundlePath: string;
    private unicodeEmojisCache?: Array<{ value: string; label: string; group: string }>;
    private unicodeEmojiLoadFailed = false;
    private readonly sessions = new Map<string, { username: string; expiresAt: number }>();
    private readonly sessionTtlMs = 8 * 60 * 60 * 1000;

    public constructor(options: AdminWebServerOptions) {
        this.options = options;
        this.adminAppBundlePath = path.resolve(process.cwd(), "dist", "admin", "app.js");
    }

    public start(): void {
        const server = http.createServer(async (req, res) => {
            try {
                await this.route(req, res);
            } catch (error) {
                console.error("[AdminUI] Unhandled error:", error);
                this.sendJson(res, 500, { error: "Internal Server Error" });
            }
        });

        server.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
                console.error(
                    `[AdminUI] Port ${this.options.port} ist bereits belegt. Admin UI wurde nicht gestartet.`
                );
                return;
            }

            console.error("[AdminUI] Serverfehler:", error);
        });

        server.listen(this.options.port, "127.0.0.1", () => {
            console.log(`[AdminUI] Aktiv auf http://127.0.0.1:${this.options.port}`);
        });
    }

    private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
        const authenticatedUser = this.getAuthenticatedUsername(req);

        if (req.method === "GET" && url.pathname === "/") {
            this.sendHtml(res, this.renderHtml(authenticatedUser));
            return;
        }

                if (req.method === "GET" && url.pathname === "/admin/app.js") {
                        await this.sendJavaScriptFile(res, this.adminAppBundlePath);
                        return;
        }

        if (req.method === "GET" && url.pathname === "/api/session") {
            this.sendJson(res, 200, {
                authenticated: Boolean(authenticatedUser),
                username: authenticatedUser ?? null
            });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/login") {
            const body = await this.readBody(req);
            const parsed = JSON.parse(body) as { username?: string; token?: string };
            const username = String(parsed.username ?? "").trim();
            const token = String(parsed.token ?? "").trim();
            const auth = this.options.getAuthConfig();

            if (username !== auth.username || token !== auth.token) {
                this.sendJson(res, 401, { error: "Invalid credentials" });
                return;
            }

            const sessionId = this.createSession(username);
            this.setSessionCookie(res, sessionId);
            this.sendJson(res, 200, { ok: true, username });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/logout") {
            const sessionId = this.getSessionIdFromRequest(req);
            if (sessionId) {
                this.sessions.delete(sessionId);
            }
            this.clearSessionCookie(res);
            this.sendJson(res, 200, { ok: true });
            return;
        }

        if (url.pathname.startsWith("/api/") && !authenticatedUser) {
            this.sendJson(res, 401, { error: "Unauthorized" });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/channels") {
            const channels = await this.options.getWelcomeChannels();
            this.sendJson(res, 200, { channels });
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/emojis") {
            const serverEmojis = (await this.options.getServerEmojis()).map((emoji) => ({
                ...emoji,
                group: "Server Emojis"
            }));
                        const unicodeEmojis = await this.getUnicodeEmojis();

                        const fallbackEmojis = [
                            { value: "🎮", label: "🎮 Gaming", group: "Activities" },
                            { value: "🎵", label: "🎵 Music", group: "Objects" },
                            { value: "🎬", label: "🎬 Movies", group: "Objects" },
                            { value: "📚", label: "📚 Learning", group: "Objects" },
                            { value: "🎉", label: "🎉 Events", group: "Activities" },
                            { value: "✅", label: "✅ Verified", group: "Symbols" }
                        ];

                        const seen = new Set<string>();
                        const emojis = [...serverEmojis, ...(unicodeEmojis.length > 0 ? unicodeEmojis : fallbackEmojis)].filter((emoji) => {
                                if (seen.has(emoji.value)) {
                                        return false;
                                }
                                seen.add(emoji.value);
                                return true;
                        });

                        this.sendJson(res, 200, { emojis });
                        return;
        }

        if (req.method === "GET" && url.pathname === "/api/config") {
            this.sendJson(res, 200, this.options.getConfig());
            return;
        }

        if (req.method === "GET" && url.pathname === "/api/logs") {
            const logs = this.options.getLogs();
            this.sendJson(res, 200, { logs: logs.slice(-300) });
            return;
        }

        if (req.method === "POST" && url.pathname === "/api/config") {
            const body = await this.readBody(req);
            const parsed = JSON.parse(body) as Partial<AdminConfig>;
            const next = this.normalize(parsed);
          const restartInfo = this.getRestartRequirement(this.options.getConfig(), next);
            await this.options.saveConfig(next);
          this.sendJson(res, 200, {
            ok: true,
            restartRequired: restartInfo.required,
            restartFields: restartInfo.fields,
            config: next
          });
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/restart") {
          await this.options.restartBot();
          this.sendJson(res, 200, { ok: true });
            return;
        }

        this.sendJson(res, 404, { error: "Not Found" });
    }

    private normalize(input: Partial<AdminConfig>): AdminConfig {
        const roles = Array.isArray(input.welcomeRoles)
            ? input.welcomeRoles
                  .map((role) => ({
                      name: String(role?.name ?? "").trim(),
                      emoji: String(role?.emoji ?? "").trim(),
                      description: String(role?.description ?? "").trim()
                  }))
                  .filter((role) => role.name.length > 0 && role.emoji.length > 0)
            : [];

        return {
            discordToken: String(input.discordToken ?? "").trim(),
            guildId: this.normalizeString(input.guildId),
            adminUiUsername: String(input.adminUiUsername ?? "admin").trim() || "admin",
            adminUiToken: String(input.adminUiToken ?? "admin").trim() || "admin",
            adminUiPort: this.normalizeNumber(input.adminUiPort, 1, 65535) ?? 8787,
            musicRoleName: String(input.musicRoleName ?? "Music Bot").trim() || "Music Bot",
            musicDefaultVolumePercent: this.normalizeNumber(input.musicDefaultVolumePercent, 0, 100),
            musicDebugSearch: input.musicDebugSearch === undefined ? true : Boolean(input.musicDebugSearch),
            musicYoutubeSearchLimit: this.normalizeNumber(input.musicYoutubeSearchLimit, 1, 200),
            spotifyClientId: this.normalizeString(input.spotifyClientId),
            spotifyClientSecret: this.normalizeString(input.spotifyClientSecret),
            spotifyRedirectUri: this.normalizeString(input.spotifyRedirectUri),
            welcomeChannelId: this.normalizeString(input.welcomeChannelId),
            welcomeRoles: roles
        };
    }

    private getRestartRequirement(previous: AdminConfig, next: AdminConfig): { required: boolean; fields: string[] } {
      const fields: Array<{ key: keyof AdminConfig; label: string }> = [
        { key: "discordToken", label: "Discord Token" },
        { key: "guildId", label: "Guild ID" },
        { key: "musicRoleName", label: "Music Rolle" },
        { key: "musicDefaultVolumePercent", label: "Music Default Volume" },
        { key: "musicDebugSearch", label: "Music Debug Search" },
        { key: "musicYoutubeSearchLimit", label: "Music YouTube Search Limit" },
        { key: "spotifyClientId", label: "Spotify Client ID" },
        { key: "spotifyClientSecret", label: "Spotify Client Secret" },
        { key: "spotifyRedirectUri", label: "Spotify Redirect URI" }
      ];

      const changed = fields
        .filter((field) => (previous[field.key] ?? null) !== (next[field.key] ?? null))
        .map((field) => field.label);

      return {
        required: changed.length > 0,
        fields: changed
      };
    }

    private normalizeString(value: unknown): string | undefined {
        const text = String(value ?? "").trim();
        return text.length > 0 ? text : undefined;
    }

    private async getUnicodeEmojis(): Promise<Array<{ value: string; label: string; group: string }>> {
        if (this.unicodeEmojisCache) {
            return this.unicodeEmojisCache;
        }

        if (this.unicodeEmojiLoadFailed) {
            return [];
        }

        try {
            const filePath = path.resolve(process.cwd(), "node_modules", "emojibase-data", "en", "data.json");
            const raw = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(raw) as Array<{ emoji?: string; annotation?: string; label?: string; group?: number }>;

            const seen = new Set<string>();
            this.unicodeEmojisCache = parsed
                .filter((item) => typeof item.emoji === "string" && item.emoji.length > 0)
                .map((item) => {
                    const value = item.emoji as string;
                    const annotation = String(item.annotation ?? item.label ?? "").trim();
                    return {
                        value,
                        label: annotation.length > 0 ? `${value} ${annotation}` : value,
                        group: this.mapUnicodeEmojiGroup(item.group)
                    };
                })
                .filter((item) => {
                    if (seen.has(item.value)) {
                        return false;
                    }

                    seen.add(item.value);
                    return true;
                });

            return this.unicodeEmojisCache;
        } catch (error) {
            this.unicodeEmojiLoadFailed = true;
            console.warn("[AdminUI] Failed to load Unicode emoji dataset:", error);
            return [];
        }
    }

    private mapUnicodeEmojiGroup(group?: number): string {
        switch (group) {
            case 0:
                return "Smileys & Emotion";
            case 1:
                return "People & Body";
            case 2:
                return "Components";
            case 3:
                return "Animals & Nature";
            case 4:
                return "Food & Drink";
            case 5:
                return "Travel & Places";
            case 6:
                return "Activities";
            case 7:
                return "Objects";
            case 8:
                return "Symbols";
            case 9:
                return "Flags";
            default:
                return "Other";
        }
    }

    private normalizeNumber(value: unknown, min: number, max: number): number | undefined {
        if (value === undefined || value === null || value === "") {
            return undefined;
        }

        const num = Number(value);
        if (!Number.isFinite(num)) {
            return undefined;
        }

        if (num < min || num > max) {
            return undefined;
        }

        return num;
    }

    private createSession(username: string): string {
        const sessionId = randomUUID();
        this.sessions.set(sessionId, {
            username,
            expiresAt: Date.now() + this.sessionTtlMs
        });
        return sessionId;
    }

    private getAuthenticatedUsername(req: IncomingMessage): string | null {
        const sessionId = this.getSessionIdFromRequest(req);
        if (!sessionId) {
            return null;
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        if (session.expiresAt <= Date.now()) {
            this.sessions.delete(sessionId);
            return null;
        }

        return session.username;
    }

    private getSessionIdFromRequest(req: IncomingMessage): string | null {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader) {
            return null;
        }

        const pairs = cookieHeader.split(";").map((entry) => entry.trim());
        for (const pair of pairs) {
            const [name, ...rest] = pair.split("=");
            if (name === "admin_session") {
                return decodeURIComponent(rest.join("="));
            }
        }

        return null;
    }

    private setSessionCookie(res: ServerResponse, sessionId: string): void {
        res.setHeader(
            "Set-Cookie",
            `admin_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
                this.sessionTtlMs / 1000
            )}`
        );
    }

    private clearSessionCookie(res: ServerResponse): void {
        res.setHeader("Set-Cookie", "admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    }

    private readBody(req: IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let raw = "";
            req.setEncoding("utf8");
            req.on("data", (chunk) => {
                raw += chunk;
            });
            req.on("end", () => resolve(raw));
            req.on("error", reject);
        });
    }

    private sendJson(res: ServerResponse, status: number, payload: unknown): void {
        const body = JSON.stringify(payload);
        res.writeHead(status, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(body)
        });
        res.end(body);
    }

    private sendHtml(res: ServerResponse, html: string): void {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }

    private async sendJavaScriptFile(res: ServerResponse, filePath: string): Promise<void> {
        try {
            const content = await fs.readFile(filePath);
            res.writeHead(200, {
                "Content-Type": "application/javascript; charset=utf-8",
                "Content-Length": content.length,
                "Cache-Control": "no-store"
            });
            res.end(content);
        } catch {
            const fallback = "console.error('Admin UI bundle is missing. Please run npm run build.');";
            res.writeHead(500, {
                "Content-Type": "application/javascript; charset=utf-8",
                "Content-Length": Buffer.byteLength(fallback)
            });
            res.end(fallback);
        }
    }

    private renderHtml(authenticatedUser: string | null): string {
        const initialAuthState = authenticatedUser
            ? JSON.stringify({ authenticated: true, username: authenticatedUser })
            : JSON.stringify({ authenticated: false, username: null });

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Discord Bot Admin</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
        :root {
            --bg:#060812;
            --bg2:#0b1022;
            --card:#0f1428;
            --card2:#131a33;
            --ink:#f8fafc;
            --muted:#9aa3bd;
            --line:#2a3558;
            --accent:#b05cff;
            --accent2:#7c3aed;
            --ok:#7bf1bf;
            --danger:#ef5a86;
        }
    * { box-sizing: border-box; }
        body {
            margin:0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: var(--ink);
            background:
                radial-gradient(900px 500px at 78% -8%, rgba(124,58,237,.36), transparent 70%),
                radial-gradient(700px 420px at 20% 8%, rgba(176,92,255,.18), transparent 65%),
                linear-gradient(160deg, var(--bg2), var(--bg));
            min-height: 100vh;
        }
        .site-shell { max-width: 1220px; margin: 0 auto; padding: 18px 18px 30px; }
        .site-header {
            display:flex;
            align-items:center;
            justify-content:space-between;
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 10px 14px;
            background: rgba(8,11,22,.76);
            backdrop-filter: blur(8px);
            margin-bottom: 26px;
        }
        .brand-wrap { display:flex; align-items:center; gap:10px; }
        .brand-logo { width:34px; height:34px; border-radius:9px; border:1px solid rgba(255,255,255,.18); }
        .brand-title { font-weight:700; letter-spacing:.2px; }
        .brand-badge {
            margin-left:10px;
            font-size:11px;
            color:#d0d6ee;
            border:1px solid var(--line);
            border-radius:999px;
            padding:3px 8px;
            background: rgba(28,34,59,.65);
        }
        .header-links { display:flex; gap:10px; align-items:center; }
        .header-links a {
            color:#b6c0df;
            text-decoration:none;
            font-size:13px;
            display:inline-flex;
            align-items:center;
            height:34px;
            padding:0 4px;
        }
        .header-links a:hover { color:#ffffff; }
        .header-icon-action {
            border:1px solid rgba(150,168,217,.35);
            background: rgba(24,31,53,.62);
            color:#d8def4;
            width:34px;
            height:34px;
            border-radius:10px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding:0;
        }
        .header-icon-action:hover {
            border-color: rgba(194,132,252,.55);
            color:#ffffff;
            background: rgba(62,40,95,.42);
        }
        .wrap { max-width: 1040px; margin: 0 auto; }
        .card {
            background:
                linear-gradient(180deg, rgba(19,26,51,.86), rgba(14,20,40,.9));
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 12px 36px rgba(0,0,0,.35);
        }
        h1 { margin: 0 0 10px; font-size: 36px; line-height: 1.15; }
        h1 strong { color: var(--accent); }
    p { color: var(--muted); }
        label { display:block; font-size: 12px; text-transform: uppercase; letter-spacing:.4px; color: #94a2c9; margin: 12px 0 6px; }
        input, select {
            width:100%;
            padding:11px 12px;
            border-radius:11px;
            border:1px solid #344166;
            background:#0b1124;
            color:var(--ink);
            outline:none;
            transition:border-color .2s, box-shadow .2s;
        }
        input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(176,92,255,.22); }
        .emoji-dropdown { position:relative; width:100%; }
        .emoji-trigger {
            width:100%;
            min-height:42px;
            display:flex;
            align-items:center;
            justify-content:space-between;
            border-radius:11px;
            border:1px solid #344166;
            background:#0b1124;
            color:var(--ink);
            padding:10px 12px;
            text-align:left;
        }
        .emoji-trigger:hover { border-color:#4d5f94; }
        .emoji-trigger:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(176,92,255,.22); outline:none; }
        .emoji-trigger .emoji-trigger-label {
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            max-width:calc(100% - 20px);
        }
        .emoji-panel {
            position:absolute;
            top:calc(100% + 6px);
            left:0;
            width:min(300px, 82vw);
            z-index:35;
            border:1px solid #3a4670;
            border-radius:12px;
            background:#0a1123;
            box-shadow:0 18px 32px rgba(0,0,0,.5);
            padding:8px;
        }
        .emoji-search-input { margin-bottom:8px; }
        .emoji-groups { max-height:260px; overflow:auto; padding-right:3px; }
        .emoji-group-title { color:#9ca9cf; font-size:11px; text-transform:uppercase; letter-spacing:.4px; margin:8px 2px 4px; }
        .emoji-option {
            width:100%;
            display:block;
            text-align:left;
            background:transparent;
            color:var(--ink);
            border:1px solid transparent;
            border-radius:8px;
            padding:6px 8px;
            margin-bottom:2px;
            font-weight:500;
        }
        .emoji-option:hover { border-color:#405086; background:rgba(53,67,112,.35); }
        .emoji-option.active { border-color:#7c3aed; background:rgba(124,58,237,.22); }
        .emoji-empty { color:#9aa3bd; font-size:12px; padding:6px 4px; }
        button {
            border:1px solid transparent;
            border-radius:11px;
            padding:10px 14px;
            cursor:pointer;
            font-weight:600;
            transition: transform .12s ease, filter .2s ease;
        }
        button:hover { transform: translateY(-1px); }
        button:disabled { opacity:0.45; cursor:not-allowed; filter:saturate(0.2); transform:none; }
    .row { display:grid; grid-template-columns: minmax(150px, 0.75fr) 1fr 1fr auto; gap:8px; margin-bottom:8px; }
    .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .add { background: linear-gradient(135deg, #4f46e5, #7c3aed); color:white; }
        .save { background: linear-gradient(135deg, var(--accent), var(--accent2)); color:white; }
        .del { background: linear-gradient(135deg, #fb7185, #e11d48); color:white; }
        .icon-btn { display:inline-flex; align-items:center; gap:8px; }
        .icon-btn i { font-size: 13px; }
        .icon-only { width:38px; height:38px; justify-content:center; padding:0; }
        .status { margin-top:10px; min-height:20px; }
        .muted { color:var(--muted); font-size:12px; }
        .log-panel {
            margin-top:16px;
            border:1px solid #2f3d67;
            border-radius:12px;
            background:#090f20;
            overflow:hidden;
        }
        .log-panel-head {
            display:flex;
            align-items:center;
            justify-content:space-between;
            padding:10px 12px;
            border-bottom:1px solid #2f3d67;
            color:#c7d0eb;
            font-size:12px;
            text-transform:uppercase;
            letter-spacing:.4px;
        }
        .log-body {
            max-height:280px;
            overflow:auto;
            font-family: Consolas, "Courier New", monospace;
            font-size:12px;
            line-height:1.45;
            padding:8px 12px;
            white-space:pre-wrap;
            color:#d5ddf5;
            scrollbar-width: thin;
            scrollbar-color: #55649a #0b1225;
        }
        .log-body::-webkit-scrollbar { width: 10px; }
        .log-body::-webkit-scrollbar-track {
            background:#0b1225;
            border-left:1px solid rgba(92,110,164,.22);
            border-radius:8px;
        }
        .log-body::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, #4c5d96, #3a4673);
            border:1px solid rgba(131,151,214,.35);
            border-radius:8px;
        }
        .log-body::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, #655fc6, #4d469e);
            border-color: rgba(178,145,255,.55);
        }
        .log-line { padding:2px 0; border-bottom:1px dashed rgba(120,136,184,.16); }
        .log-line:last-child { border-bottom:none; }
        .log-level { display:inline-block; min-width:52px; font-weight:700; }
        .log-level.log, .log-level.info { color:#b7c3ea; }
        .log-level.warn { color:#f3d077; }
        .log-level.error { color:#f49ab4; }
        .region {
            border:1px solid #2f3d67;
            border-radius:12px;
            background:#0a1123;
            margin-top:12px;
            overflow:hidden;
        }
        .region-summary {
            cursor:pointer;
            user-select:none;
            list-style:none;
            padding:10px 12px;
            color:#d7def4;
            font-weight:700;
            border-bottom:1px solid rgba(120,136,184,.22);
        }
        .region-summary::-webkit-details-marker { display:none; }
        .region-summary::after {
            content:"▾";
            float:right;
            color:#93a2c9;
            transition:transform .2s ease;
        }
        .region:not([open]) .region-summary::after { transform:rotate(-90deg); }
        .region-content { padding:10px 12px 12px; }
    .loading-overlay { position:absolute; inset:0; display:none; align-items:center; justify-content:center; background:rgba(2,6,23,.82); border-radius:14px; z-index:20; }
    .loading-overlay.active { display:flex; }
    .loading-box { display:flex; flex-direction:column; align-items:center; gap:10px; color:#e5e7eb; }
        .spinner { width:34px; height:34px; border:4px solid rgba(148,163,184,.3); border-top-color:var(--accent); border-radius:999px; animation:spin 0.85s linear infinite; }
        @media (max-width: 900px) {
            .header-links { display:none; }
            h1 { font-size: 30px; }
            .grid2 { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
            .site-shell { padding: 12px; }
            .row { grid-template-columns: 1fr; }
            .wrap { max-width: 100%; }
        }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__ADMIN_INITIAL_AUTH__ = ${initialAuthState};
  </script>
  <script src="/admin/app.js" defer></script>
</body>
</html>`;
    }
}
