# TODO

## Prioritaet 1: Betrieb und Status

- [x] Healthcheck-Endpunkt fuer Docker und Home Assistant ergaenzen
- [x] Docker-Healthcheck fuer Port `8787` konfigurieren
- [x] Statusanzeige in der Admin-UI einfuehren: online, Token ungueltig, Guild nicht erreichbar
- [x] Graceful Shutdown bei Container- und Home-Assistant-Neustarts pruefen
- [x] Automatische Datenbankmigrationen mit Versionsanzeige ergaenzen
- [x] Rate-Limit- und Timeout-Behandlung fuer TheAudioDB und YouTube verbessern
- [x] Multi Server support. Unterstüztung für mehrere verschieden DiscordServer mit nur einem bot

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

- [x] Achievement-System
- [x] Achievement-Modul pro Discord-Server aktivieren und konfigurieren koennen
- [x] Achievement-Definitionen mit stabilen IDs, Kategorien, Medaillenstufe, Punkten und optional geheimen Bedingungen anlegen
- [x] Jede Achievement-Reihe einheitlich in Bronze, Silber und Gold staffeln
- [x] Stabile IDs nach dem Muster `<reihe>-bronze`, `<reihe>-silver` und `<reihe>-gold` verwenden
- [x] Einheitliche Punkte vergeben: Bronze 10 Punkte, Silber 25 Punkte und Gold 50 Punkte
- [x] Beim Erreichen einer hoeheren Stufe nur deren Punkte zusaetzlich vergeben; Bronze und Silber bleiben in der Sammlung sichtbar
- [x] Achievement-Reihe **Bot-Nutzung**: Bronze `command-user-bronze` fuer 1 Befehl, Silber `command-user-silver` fuer 25 Befehle, Gold `command-user-gold` fuer 250 Befehle
- [x] Achievement-Reihe **Modul-Entdecker**: Bronze `module-explorer-bronze` fuer 2 verwendete Module, Silber `module-explorer-silver` fuer 4 Module, Gold `module-explorer-gold` fuer alle auf dem Server aktivierten Module
- [x] Achievement-Reihe **Musikhoerer**: Bronze `music-listener-bronze` fuer 1 Track, Silber `music-listener-silver` fuer 25 Tracks, Gold `music-listener-gold` fuer 250 Tracks mit jeweils mindestens 30 Sekunden Hoerzeit
- [x] Achievement-Reihe **DJ**: Bronze `dj-bronze` fuer 10 gestartete Tracks, Silber `dj-silver` fuer 100 gestartete Tracks, Gold `dj-gold` fuer 500 gestartete Tracks
- [x] Achievement-Reihe **Queue-Builder**: Bronze `queue-builder-bronze` fuer 5, Silber `queue-builder-silver` fuer 10 und Gold `queue-builder-gold` fuer 25 gleichzeitig eingereihte Tracks
- [x] Geheime Achievement-Reihe **Nachteule**: Bronze `night-owl-bronze` fuer 1, Silber `night-owl-silver` fuer 10 und Gold `night-owl-gold` fuer 50 zwischen 00:00 und 04:00 Uhr Serverzeit gehoerte Tracks
- [x] Achievement-Reihe **Kanal-Ersteller**: Bronze `channel-creator-bronze` fuer 1, Silber `channel-creator-silver` fuer 25 und Gold `channel-creator-gold` fuer 100 erzeugte temporaere Community-Sprachkanaele
- [x] Achievement-Reihe **Community-Stammgast**: Bronze `community-regular-bronze` fuer 5, Silber `community-regular-silver` fuer 25 und Gold `community-regular-gold` fuer 100 abgeschlossene Community-Voice-Sitzungen
- [x] Achievement-Reihe **Gute Gesellschaft**: Bronze `social-circle-bronze` mit 2, Silber `social-circle-silver` mit 5 und Gold `social-circle-gold` mit 10 anderen Nutzern gleichzeitig im verwalteten Sprachkanal
- [x] Achievement-Reihe **Voice-Zeit**: Bronze `voice-time-bronze` fuer 1 Stunde, Silber `voice-time-silver` fuer 10 Stunden und Gold `voice-time-gold` fuer 50 Stunden gesamte Community-Voice-Zeit
- [x] Achievement-Reihe **Aktiver Waehler**: Bronze `active-voter-bronze` fuer 1, Silber `active-voter-silver` fuer 10 und Gold `active-voter-gold` fuer 50 verschiedene Kanalnamen-Abstimmungen
- [x] Achievement-Reihe **Kreativer Kopf**: Bronze `creative-mind-bronze` fuer 1, Silber `creative-mind-silver` fuer 5 und Gold `creative-mind-gold` fuer 20 gueltige Kanalnamenvorschlaege
- [x] Achievement-Reihe **Volltreffer**: Bronze `winning-suggestion-bronze` fuer 1, Silber `winning-suggestion-silver` fuer 5 und Gold `winning-suggestion-gold` fuer 15 gewonnene Kanalnamen-Abstimmungen
- [x] Achievement-Reihe **Willkommen**: Bronze `welcome-role-bronze` fuer 1, Silber `welcome-role-silver` fuer 3 und Gold `welcome-role-gold` fuer alle aktuell angebotenen Welcome-Rollen
- [x] Achievement-Reihe **Twitch-Verbindung**: Bronze `twitch-support-bronze` fuer eine erfolgreiche Kontoverknuepfung, Silber `twitch-support-silver` fuer die Follower-Rolle und Gold `twitch-support-gold` fuer die Subscriber-Rolle
- [x] Fuer das erste Release alle 15 Reihen mit insgesamt 45 Bronze-, Silber- und Gold-Achievements bereitstellen
- [x] Achievement-Fortschritt auf Reihenebene speichern und die drei Medaillenstufen je nach Reihe aus einem Zaehler oder klar definierten Meilensteinen berechnen
- [x] Dynamische Gold-Bedingungen wie „alle aktivierten Module“ und „alle Welcome-Rollen“ beim Freischalten als erreichten Stand festschreiben und spaetere Konfigurationsaenderungen nicht rueckwirkend entziehen
- [x] Achievement-Bedingungen gegen Farming schuetzen: Musik erst nach 30 Sekunden zaehlen, Abstimmungen nur einmal pro Runde und Voice-Zeit nur fuer echte abgeschlossene Sitzungen werten
- [x] Nutzerfortschritt und Freischaltungen pro Guild und Nutzer in SQLite speichern
- [x] Versionierte SQLite-Migration fuer Achievement-Fortschritt, Statistiken und Freischaltungen ergaenzen
- [x] Interne Achievement-Events fuer Commands, Musik, Community, Abstimmungen, Welcome und Twitch bereitstellen
- [x] Doppelte Freischaltungen durch eindeutige Guild-, Nutzer- und Achievement-Zuordnung verhindern
- [x] `/achievements` mit persoenlicher Uebersicht, Gesamtfortschritt und Punkten ergaenzen
- [x] Achievement-Ansicht mit Kategorien, Pagination, Fortschrittsbalken und Filter fuer erreichte oder laufende Achievements umsetzen
- [x] Oeffentliche Ansicht der erreichten Achievements anderer Nutzer anbieten
- [x] Geheime Achievements vor der Freischaltung ohne Bedingung anzeigen
- [x] Ansprechende Achievement-Karten mit Icon, Name, Beschreibung, Bronze-/Silber-/Gold-Stufe, Fortschritt und Freischaltdatum darstellen
- [x] Freischaltmeldungen per DM beidem oder stummem Modus unterstuetzen
- [x] Mehrere gleichzeitig erreichte Achievements in einer Nachricht buendeln
- [x] Fehlgeschlagene DMs abfangen, ohne die gespeicherte Freischaltung rueckgaengig zu machen
- [x] Achievement-Einstellungen pro Serverprofil in der Admin-UI anbieten
- [x] Kategorien, geheime Achievements, Benachrichtigungsmodus und Achievement-Kanal konfigurierbar machen
- [x] Admin-Ansicht fuer letzte Freischaltungen und Nutzerfortschritt planen
- [x] Tests fuer Guild-Isolation, Fortschritt, einmalige Freischaltung, Benachrichtigungen und fehlgeschlagene DMs ergaenzen
- [x] Admin UI pfade undco funktionieren im home assistant inkl. cloudflare proxy über das ha plugin

## Tests und Qualitaet

- [x] Mindestens 80 Prozent Coverage fuer Statements, Lines, Functions und Branches in Backend und Admin-UI erzwingen
- [x] Tests fuer Pflichtfeldvalidierung ergaenzen
- [x] Tests fuer TheAudioDB v1 und v2 ergaenzen
- [x] Tests fuer ungueltige Discord-Tokens ergaenzen
- [x] Tests fuer Healthcheck und Shutdown ergaenzen
- [x] Admin-UI in Desktop- und Mobile-Ansicht als Playwright-E2E pruefen und Ergebnisse zur manuellen Kontrolle ablegen
- [x] Code-Coverage fuer Backend-Tests und Playwright-UI-Tests als HTML- und LCOV-Bericht bereitstellen
