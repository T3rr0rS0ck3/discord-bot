# TODO

## Prioritaet 1: Betrieb und Status

- [x] Healthcheck-Endpunkt fuer Docker und Home Assistant ergaenzen
- [x] Docker-Healthcheck fuer Port `8787` konfigurieren
- [x] Statusanzeige in der Admin-UI einfuehren: online, Token ungueltig, Guild nicht erreichbar
- [x] Graceful Shutdown bei Container- und Home-Assistant-Neustarts pruefen
- [x] Automatische Datenbankmigrationen mit Versionsanzeige ergaenzen
- [x] Rate-Limit- und Timeout-Behandlung fuer TheAudioDB und YouTube verbessern
- [ ] Multi Server support. Unterstüztung für mehrere verschieden DiscordServer mit nur einem bot

## Prioritaet 2: Sicherheit und Konfiguration

- [x] Admin-Passwoerter gehasht statt im Klartext in SQLite speichern
- [x] Login-Versuche begrenzen und bei zu vielen Fehlversuchen temporaer sperren
- [ ] Alle Sessions nach einer Admin-Passwortaenderung beenden
- [x] Konfigurations-Backup aus der Admin-UI herunterladen koennen
- [x] Konfigurations-Backup aus der Admin-UI wiederherstellen koennen
- [ ] Testverbindung fuer Discord, TheAudioDB und Twitch anbieten

## Musik

- [x] `/music remove` zum Entfernen einzelner Queue-Eintraege ergaenzen
- [x] `/music clear` zum Leeren der Queue ergaenzen
- [x] Loop fuer den aktuellen Track und fuer die gesamte Queue ergaenzen
- [x] Shuffle fuer die Queue ergaenzen
- [x] Lautstaerke-Steuerung mit Feintasten und Prozent-Auswahl im Musik-Player ergaenzen
- [x] Fortschrittsanzeige und bekannte Trackdauer im Musik-Player anzeigen
- [x] Mehrere TheAudioDB-Suchergebnisse zur Auswahl anzeigen
- [x] Bei fehlenden TheAudioDB-Treffern auf direkte YouTube-Suche zurueckfallen

## Community

- [x] Status der Community-Kategorie und verwalteten Kanaele in der Admin-UI anzeigen
- [x] Verwaiste Community-Kanaele manuell ueber die UI aufraeumen koennen
- [ ] Bestimmte Rollen oder Benutzer von Community-Kanaelen ausschliessen koennen
- [x] Community-Kanalnamen aus der UI exportieren koennen
- [x] Community-Kanalnamen aus der UI importieren koennen
- [x] Liste der Community-Kanalnamen inklusive Bearbeiten, Loeschen und Hinzufuegen
- [x] Kanalnamenvorschlaege mit konfigurierbarer Abstimmungsdauer und zufaelliger Viererauswahl
- [x] Kanalvorschlaege als echte Umfrage

## Welcome und Twitch

- [x] Welcome-Texte bearbeiten und Vorschau der Welcome-Nachricht anzeigen
- [x] Twitch-Mitglieder per Discord-Kanal und OAuth-Button zuverlässig in SQLite verknüpfen
- [x] Twitch-Synchronisierung manuell starten koennen
- [x] Zeitpunkt des letzten erfolgreichen Twitch-Syncs anzeigen
- [x] Protokollieren, welche Twitch-Rollen hinzugefuegt oder entfernt wurden

## Features

- [ ] Achivement system
- [x] Admin UI pfade undco funktionieren im home assistant inkl. cloudflare proxy über das ha plugin
- [ ] sql lite browser wieder funktions fähig im ha

## Tests und Qualitaet

- [x] Mindestens 80 Prozent Coverage fuer Statements, Lines, Functions und Branches in Backend und Admin-UI erzwingen
- [ ] Tests fuer Pflichtfeldvalidierung ergaenzen
- [x] Tests fuer TheAudioDB v1 und v2 ergaenzen
- [ ] Tests fuer ungueltige Discord-Tokens ergaenzen
- [ ] Tests fuer Healthcheck und Shutdown ergaenzen
- [x] Admin-UI in Desktop- und Mobile-Ansicht als Playwright-E2E pruefen und Ergebnisse zur manuellen Kontrolle ablegen
- [x] Code-Coverage fuer Backend-Tests und Playwright-UI-Tests als HTML- und LCOV-Bericht bereitstellen
