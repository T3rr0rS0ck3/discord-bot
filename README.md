# Discord Bot (Node.js + TypeScript)

Modularer Discord-Bot mit erweiterbarer Modul-Architektur.

- `system`-Modul: `/ping`, `/join`
- `musicbot`-Modul: `/music` inkl. Player, Queue, Volume und Spotify OAuth

## Voraussetzungen

- Node.js 22.12+
- Ein Discord-Bot-Token

## Setup

1. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

2. `.env` erstellen und Werte eintragen:

   ```env
   DISCORD_TOKEN=dein_bot_token_hier
   GUILD_ID=deine_server_id_hier
   SPOTIFY_CLIENT_ID=deine_spotify_client_id
   SPOTIFY_CLIENT_SECRET=dein_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/spotify/callback
   MUSIC_ROLE_NAME=Music Bot
   MUSIC_DEFAULT_VOLUME_PERCENT=70
   MUSIC_YOUTUBE_SEARCH_LIMIT=25
   ```

   In deinem Spotify Developer Dashboard muss dieselbe Redirect URI eingetragen sein.

3. Bot in der Discord Developer Console:
   - Bot auf deinen Server einladen

## Entwicklung starten

```bash
npm run dev
```

Dann im Discord-Channel:

```text
/ping
/join
/music spotify-connect
/music spotify-disconnect
/music play query:https://example.com/audio.mp3
/music play query:https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl
/music play query:https://www.youtube.com/watch?v=dQw4w9WgXcQ
/music play query:Linkin Park Numb
/music queue
/music skip
/music back
/music pause
/music resume
/music volume percent:70
/music player
```

Antwort vom Bot:

```text
Pong! 🏓
```

Bei `/join` joint der Bot deinen aktuellen Voice-Channel.
Bei `/play` wird eine direkte MP3-URL, ein Spotify-Track-Link oder ein YouTube-Link abgespielt.
Bei `/play query:<titel interpret>` nutzt der Bot Spotify für Metadaten und sucht dann eine passende YouTube-Quelle.
Bei Spotify-Track-Links wird ebenfalls immer eine passende YouTube-Quelle verwendet (kein Playback über Spotify `preview_url`).
Mit `/music player` wird ein Player-Panel im Chat mit Buttons für Zurück, Pause/Play und Skip angezeigt.
Mit den `/music`-Subcommands steuerst du die Wiedergabe (`volume` = 0 bis 100).
Bei `/music play query` bekommst du beim Tippen Spotify-Vorschläge und kannst den exakten Song direkt auswählen.

## Build + Start

```bash
npm run build
npm start
```

## Hinweis

- `GUILD_ID` sorgt dafür, dass `/ping` sofort auf deinem Server verfügbar ist.
- Ohne `GUILD_ID` wird der Command global registriert (kann bis zu 1h dauern).
- Für `/join` braucht der Bot Voice-Rechte auf dem Channel (`Connect`, optional `Speak`).
- Für Spotify musst du zuerst `/music spotify-connect` ausführen und OAuth bestätigen.
- Für `/play` kannst du MP3-URLs, Spotify-Track-URLs, YouTube-Links oder Suchtext (Titel/Interpret) verwenden.
- Wenn du MP3/WAV/ähnliche Dateien abspielen willst, wird `ffmpeg-static` mitinstalliert.
- Der Bot legt beim Start in der Ziel-Guild automatisch eine Rolle mit dem Namen aus `MUSIC_ROLE_NAME` an oder verwendet eine vorhandene Rolle gleichen Namens. Nur Mitglieder mit dieser Rolle können die Musikbefehle nutzen.
- Dafür braucht der Bot in der Guild die Berechtigung `Manage Roles`.
- Die Start-Lautstärke pro Guild-Player kommt aus `MUSIC_DEFAULT_VOLUME_PERCENT` (0 bis 100, Standard: 100).
- Für YouTube-Suche werden standardmäßig 25 Treffer betrachtet (`MUSIC_YOUTUBE_SEARCH_LIMIT`, Bereich 10-100).
