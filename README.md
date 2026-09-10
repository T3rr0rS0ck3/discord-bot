# Discord Bot (Node.js + TypeScript)

Modularer Discord-Bot mit erweiterbarer Modul-Architektur.

- `system`-Modul: `/ping`, `/join`
- `musicbot`-Modul: `/music` inkl. Player, Queue, Volume und TheAudioDB-Metadaten

## Voraussetzungen

- Node.js 22.12+
- Ein Discord-Bot-Token

## Setup

1. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

2. Bot in der Discord Developer Console:
   - Bot auf deinen Server einladen

3. Entwicklung starten:

   ```bash
   npm run dev
   ```

4. Admin-Webseite öffnen und Konfiguration setzen:

   ```text
   http://127.0.0.1:8787
   ```

   Standard-Login (wenn noch nichts konfiguriert):
   - Benutzername: `admin`
   - Token: `admin`

   Dort kannst du alle Einstellungen setzen, inkl. `DISCORD_TOKEN`, `GUILD_ID`, Music/Welcome und Admin-Login.

## Entwicklung starten

```bash
npm run dev
```

Dann im Discord-Channel:

```text
/ping
/join
/music play query:https://example.com/audio.mp3
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
Bei `/play` wird eine direkte MP3-URL oder ein YouTube-Link abgespielt.
Bei `/play query:<titel interpret>` nutzt der Bot TheAudioDB für Metadaten und sucht danach eine passende YouTube-Quelle.
TheAudioDB-Key und API-Modus (Free/v1 oder Premium/v2) lassen sich unter Music
Settings konfigurieren und werden in SQLite gespeichert. Ohne eigenen Key wird
im Free-Modus der öffentliche Key `2` verwendet; im Premium-Modus ist der
Premium-Key üblicherweise `123`. Alternativ können `AUDIODB_API_KEY` und
`AUDIODB_API_VERSION` (`v1` oder `v2`) als Startwerte gesetzt werden.
Mit `/music player` wird ein Player-Panel im Chat mit Buttons für Zurück, Pause/Play und Skip angezeigt.
Mit den `/music`-Subcommands steuerst du die Wiedergabe (`volume` = 0 bis 100).
Bei `/music play query` bekommst du beim Tippen TheAudioDB-Vorschläge und kannst den gefundenen Song direkt auswählen.

## Build + Start

```bash
npm run build
npm start
```

## Docker (Linux base) + Docker Compose

Container setup nutzt `node:22-bookworm-slim` (Linux) und speichert alle Laufzeitdaten weiterhin im Host-Ordner `data/`.

Es gibt zwei Compose-Varianten:

- `docker-compose.yml`: Build-basiert (nutzt lokales `Dockerfile`)
- `docker-compose.release.yml`: Image-basiert, Portainer-freundlich (nutzt named volume, kein lokaler Build)

Starten:

```bash
docker compose up -d --build
```

Release-Compose mit fertigem Image starten:

```bash
docker compose -f docker-compose.release.yml up -d
```

## Home Assistant App

Das Verzeichnis `homeassistant-addon/` enthält eine Home-Assistant-App-Definition
für dasselbe Multi-Arch-Image. Das Repository kann in Home Assistant unter

```text
Einstellungen -> Add-ons -> Add-on Store -> Repositories
```

als benutzerdefiniertes Repository hinzugefügt werden. Danach die App **Discord
Bot** installieren und starten. Die Admin-Oberfläche ist über den App-Eintrag
und Ingress erreichbar; die SQLite-Daten werden dauerhaft im Home-Assistant-
App-Datenverzeichnis gespeichert.

Die normale Docker- und Compose-Nutzung bleibt unverändert. Compose bindet den
Host-Ordner `data/` ausdrücklich nach `/app/data`; das Image verwendet für
Home-Assistant standardmäßig `/data`. Der Datenpfad kann für weitere Deployments
über `BOT_DATA_DIR` gesetzt werden.

Die SQLite-Datei wird nicht mit Git oder dem Docker-Image ausgeliefert. Bei einem
leeren Datenverzeichnis legt der Bot `bot-config.sqlite` beim ersten Start mit
allen Tabellen, Migrationen, Standardrollen und dem initialen Login `admin` /
`admin` an. Discord- und Twitch-Zugangsdaten werden erst über die
Admin-Oberfläche in der persistenten Laufzeitdatenbank gespeichert.

Das Release-Image in GHCR wird als Multi-Arch-Manifest veröffentlicht (`linux/amd64` + `linux/arm64`).

Im Release-ZIP liegt die Image-basierte Compose-Datei als `docker-compose.yml`, damit du direkt nur mit dem Archiv arbeiten kannst.

Hinweis: Das mitgelieferte `discord-bot-image-vX.Y.Z.tar.gz` wird im Workflow aus dem Runner-Image exportiert (typisch `amd64`). Für native ARM-Deployments daher am besten direkt aus GHCR pullen.

Optional ein bestimmtes Tag/Image setzen (z. B. nach `docker load` aus dem Release-Archiv):

```bash
DISCORD_BOT_IMAGE=ghcr.io/t3rr0rs0ck3/discord-bot:1.0.0 docker compose -f docker-compose.release.yml up -d
```

Logs anzeigen:

```bash
docker compose logs -f
```

Stoppen:

```bash
docker compose down
```

Wichtige Ports (in `docker-compose.yml`):

- `8787:8787` Admin-UI
- SQLite Web GUI ist in die Admin-Oberflaeche eingebettet und laeuft nur innerhalb der angemeldeten Session.

Hinweis: Wenn du den Admin-Port in der UI änderst, musst du das Port-Mapping in `docker-compose.yml` entsprechend anpassen.

## Admin-Webseite (Welcome-Konfiguration)

Alle Einstellungen werden in SQLite gespeichert:

- Datei: `data/bot-config.sqlite`
- Kein `.env` mehr notwendig

Hinweis zur Laufzeit:

- Welcome-Änderungen werden live angewendet.
- Discord Token, Guild ID und Admin UI Port/Login gelten nach Neustart.

### Konfigurations-Backup

In der Action Bar der Admin-Oberfläche stehen **Backup** und **Restore** zur Verfügung.

- **Backup** lädt die aktuelle Konfiguration als versionierte JSON-Datei herunter.
- **Restore** öffnet eine lokale JSON-Datei, verlangt eine Bestätigung und validiert sie vor dem Speichern mit denselben Regeln wie die normale Konfigurationsseite.
- Ein unbekanntes oder nicht unterstütztes Backupformat wird abgewiesen.
- Nach dem Restore zeigt die Oberfläche an, ob für einzelne Änderungen ein Bot-Neustart erforderlich ist.
- Das Backup enthält auch Discord-, Twitch- und Admin-Zugangsdaten. Die Datei muss deshalb wie ein Passwort behandelt und sicher aufbewahrt werden.
- Laufzeitdaten wie aktuelle Community-Kanäle, Namensvorschläge, Abstimmungen und Stimmen sind nicht Teil des Konfigurations-Backups und verbleiben in SQLite.

## Hinweis

### Module ein- und ausschalten

Die Adminoberfläche bietet Schalter für Musik, Welcome, Twitch und Community. Die Auswahl wird in SQLite gespeichert und über **Save and restart** angewendet. Nur **Save** speichert die Auswahl für den nächsten Bot-Neustart. Vorhandene Installationen behalten standardmäßig alle Module eingeschaltet; Welcome und Twitch benötigen zusätzlich ihre Konfiguration.

Ausgeschaltete Module registrieren keine Befehle und starten keine Verarbeitung. Beim Neustart wird laufende Musik beendet. Bestehende Rollen und Kanäle bleiben erhalten; die Community räumt ihre temporären Kanäle erst nach erneutem Einschalten wieder auf. Die Adminoberfläche bleibt unabhängig von den Modulschaltern erreichbar.

### Temporäre Community-Sprachkanäle

- Mit gesetzter Guild ID erstellt der Bot beim Start eine Kategorie `Community` und darunter den Sprachkanal `➕ Sprachkanal erstellen`.
- Wer diesem Kanal beitritt, erhält einen eigenen Sprachkanal und wird automatisch dorthin verschoben.
- Neue Sprachkanäle erhalten zufällige Namen aus der SQLite-Tabelle `community_channel_names` in `data/bot-config.sqlite`. Bereits verwendete Namen werden nach Möglichkeit übersprungen. Die versionierte Migration `src/admin/migrations/communityChannelNames.ts` enthält die 10.000 Startnamen und ist im Build und Docker-Image enthalten. Beim ersten Start wird die Tabelle automatisch befüllt, auch bei bestehenden Installationen. Weitere Starts/Deployments überschreiben keine Änderungen an den Namen. Eine separate JSON-Namensdatei ist nicht nötig.
- **Maximale Anzahl temporärer Sprachkanäle** ist in der Adminoberfläche von 1 bis 50 einstellbar (Standard 50). Leere Kanäle während des Timeouts zählen mit. Discord erlaubt insgesamt 50 Kanäle pro Kategorie, daher sind mit dem Erstellen-Kanal höchstens 49 temporäre Kanäle möglich; weitere fremde Kanäle in derselben Kategorie reduzieren die verfügbaren Plätze. Es werden keine zusätzlichen Kategorien angelegt.
- Bei erreichtem Limit wird der Nutzer vom Erstellen-Kanal getrennt und der Grund im Bot-Log vermerkt. Nach Freiwerden eines Platzes kann er erneut beitreten. Eine Verringerung des Limits löscht keine bestehenden Kanäle.
- Ein erzeugter Kanal wird nach 60 Sekunden ohne Teilnehmer gelöscht. Ein erneuter Beitritt bricht die Löschung ab.
- In der Adminoberfläche unter **Community Sprachkanäle** lassen sich Kategoriename und Timeout (1–86400 Sekunden) ändern. Speichern wendet die Änderungen live an; eine Timeout-Änderung startet laufende Wartezeiten neu.
- Der Bot benötigt **Kanäle verwalten**, **Mitglieder verschieben**, **Kanal ansehen** und **Verbinden** in dieser Kategorie.
- Die IDs der vom Bot erzeugten Kanäle werden in der Tabelle `community_state` in `data/bot-config.sqlite` gespeichert. Beim ersten Start nach dem Update wird ein vorhandener `data/community-<guild-id>.json`-Status automatisch einmalig in SQLite übernommen. Die SQLite-Datei zusammen mit den übrigen Laufzeitdaten behalten. Nach einem Neustart beginnt für noch vorhandene leere Kanäle der Timeout erneut. Andere Kanäle werden nicht gelöscht.
- Funktionstests ohne Discord-Verbindung: `node tests/community.test.cjs`.

### Kanalnamen-Abstimmung

Das eigenständige Modul **Kanalnamen-Abstimmung** kann unabhängig von den temporären Community-Sprachkanälen in der Admin-UI aktiviert werden. Dort lassen sich der Name des Discord-Textkanals und die Abstimmungsdauer von 1 bis 30 Tagen konfigurieren.

- Der Bot erstellt im konfigurierten Textkanal eine dauerhaft aktualisierte Abstimmungsnachricht.
- Über **Namen vorschlagen** öffnet sich direkt in Discord ein Formular. Ein Slash-Command ist nicht erforderlich.
- Vorschläge werden in `community_name_suggestions` gespeichert. Bereits vorhandene echte Kanalnamen und doppelte Vorschläge werden abgewiesen.
- Sobald mindestens vier Vorschläge verfügbar sind, wählt SQLite zufällig genau vier Kandidaten für die nächste Abstimmung aus.
- Jeder Nutzer hat eine aktive Stimme und kann sie durch Klick auf einen anderen Kandidaten ändern.
- Nach Ablauf werden alle vier ausgewählten Kandidaten aus dem Vorschlagspool entfernt. Nicht ausgewählte Vorschläge bleiben für spätere Runden erhalten.
- Der Kandidat mit den meisten Stimmen wird in die bestehende Tabelle `community_channel_names` übernommen. Bei Gleichstand gewinnt der früher eingereichte Kandidat.
- Runden, Kandidaten, Stimmen und Discord-Nachrichtenreferenzen werden vollständig in SQLite gespeichert und über versionierte Migrationen angelegt.

- `GUILD_ID` sorgt dafür, dass `/ping` sofort auf deinem Server verfügbar ist.
- Ohne `GUILD_ID` wird der Command global registriert (kann bis zu 1h dauern).
- Für `/join` braucht der Bot Voice-Rechte auf dem Channel (`Connect`, optional `Speak`).
- Für `/play` kannst du MP3-URLs, YouTube-Links oder Suchtext (Titel/Interpret) verwenden. Suchtext wird über TheAudioDB mit Metadaten angereichert und anschließend auf YouTube aufgelöst.
- Wenn du MP3/WAV/ähnliche Dateien abspielen willst, wird `ffmpeg-static` mitinstalliert.
- Der Bot legt beim Start in der Ziel-Guild automatisch eine Rolle mit dem Namen aus `MUSIC_ROLE_NAME` an oder verwendet eine vorhandene Rolle gleichen Namens. Nur Mitglieder mit dieser Rolle können die Musikbefehle nutzen.
- Dafür braucht der Bot in der Guild die Berechtigung `Manage Roles`.
- Die Start-Lautstärke pro Guild-Player kommt aus `MUSIC_DEFAULT_VOLUME_PERCENT` (0 bis 100, Standard: 50).
- Für YouTube-Suche werden standardmäßig 25 Treffer betrachtet (`MUSIC_YOUTUBE_SEARCH_LIMIT`, Bereich 10-100).
