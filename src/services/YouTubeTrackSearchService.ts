import * as play from "play-dl";
import type { AudioDbTrackMetadata } from "../types/AudioDb";
import type { YouTubeCandidate, YouTubeSearchConfig, YouTubeResolvedResult, YouTubeScoreEntry, ParsedArtistTitle } from "../types/YouTube";
import { ExternalRequestExecutor } from "./ExternalRequestExecutor";

export class YouTubeTrackSearchService {
    private readonly searchLimit: number;
    private readonly debugEnabled: boolean;
    private readonly logger?: (message: string) => void;

    public constructor(config: YouTubeSearchConfig) {
        this.searchLimit = config.searchLimit;
        this.debugEnabled = config.debugEnabled;
        this.logger = config.logger;
    }

    public async resolveByQuery(query: string, expected?: AudioDbTrackMetadata, queryHint?: string): Promise<YouTubeResolvedResult> {
        this.log(`YouTube search started: query="${query}"${queryHint ? `, queryHint="${queryHint}"` : ""}`);
        if (expected) {
            this.log(`Expected track: ${expected.title} - ${expected.artists.join(", ")} (${expected.durationSec}s)`);
        }

        const searchQueries = this.buildYouTubeSearchVariants(query, expected, queryHint);
        this.log(`YouTube search limit per query: ${this.searchLimit}`);
        this.log(`YouTube query variants: ${searchQueries.length}`);
        searchQueries.forEach((entry, index) => {
            this.log(`Query ${index + 1}: "${entry}"`);
        });

        const dedupedCandidates = new Map<string, YouTubeCandidate>();
        for (const searchQuery of searchQueries) {
            const partial = await this.fetchYouTubeCandidates(searchQuery);
            for (const candidate of partial) {
                if (!dedupedCandidates.has(candidate.url)) {
                    dedupedCandidates.set(candidate.url, candidate);
                }
            }
        }

        const candidates = [...dedupedCandidates.values()];
        this.log(`Aggregierte Kandidaten nach Dedupe: ${candidates.length}`);

        if (candidates.length === 0) {
            this.log("YouTube search returned no valid candidates after normalization.");
            throw new Error("No matching YouTube source found.");
        }

        this.log(`YouTube candidates found: ${candidates.length}`);
        candidates.forEach((candidate, index) => {
            this.log(`Kandidat ${index + 1}: title="${candidate.title}" | channel="${candidate.channelName}" | duration=${candidate.durationInSec ?? "?"}s | url=${candidate.url}`);
        });

        const parsedPair = queryHint ? this.parseArtistAndTitle(queryHint) : {};
        const pairCandidates = (parsedPair.artist && parsedPair.title)
            ? candidates.filter((candidate) => this.containsBothParsedTerms(candidate, parsedPair.artist!, parsedPair.title!))
            : candidates;

        if (parsedPair.artist && parsedPair.title) {
            this.log(`Parsed pair detected: artist="${parsedPair.artist}", title="${parsedPair.title}", pairMatches=${pairCandidates.length}/${candidates.length}`);
        }

        const strictCandidates = pairCandidates.filter((candidate) => this.matchesRequiredSongTerms(candidate, expected, queryHint));
        const candidatePool = strictCandidates.length > 0
            ? strictCandidates
            : (pairCandidates.length > 0 ? pairCandidates : candidates);
        const scoredCandidates = candidatePool
            .map((candidate, index) => ({
                candidate,
                searchOrder: index + 1,
                strictMatch: strictCandidates.includes(candidate),
                score: this.scoreYouTubeCandidate(candidate, expected, queryHint),
                combinedScore: 0
            }))
            .map((entry) => ({
                ...entry,
                combinedScore: entry.score + Math.max(0, 20 - (entry.searchOrder - 1) * 2)
            }));

        this.log(`Strict candidates: ${strictCandidates.length}/${candidates.length}`);

        if (strictCandidates.length === 0) {
            this.log(`No strict match found for "${query}", using best-ranked fallback.`);
        }

        scoredCandidates.forEach((entry, index) => {
            this.log(`SearchOrder ${index + 1}: score=${entry.score} | combined=${entry.combinedScore} | strict=${entry.strictMatch ? "yes" : "no"} | title="${entry.candidate.title}" | url=${entry.candidate.url}`);
        });

        const rankedForDebug = [...scoredCandidates].sort((a, b) => b.combinedScore - a.combinedScore);
        rankedForDebug.forEach((entry, index) => {
            this.log(`Ranking ${index + 1}: score=${entry.score} | combined=${entry.combinedScore} | order=${entry.searchOrder} | strict=${entry.strictMatch ? "yes" : "no"} | title="${entry.candidate.title}" | url=${entry.candidate.url}`);
        });

        for (const candidate of rankedForDebug.map((entry) => entry.candidate)) {
            try {
                await ExternalRequestExecutor.execute(
                    () => play.video_basic_info(candidate.url),
                    this.createRequestOptions("YouTube validation", 8_000, 2)
                );
                this.log(`Selected YouTube result: ${candidate.url} | title="${candidate.title}"`);
                return {
                    url: candidate.url,
                    title: candidate.title,
                    thumbnailUrl: candidate.thumbnailUrl
                };
            }
            catch {
                this.log(`Candidate invalid or unavailable: ${candidate.url}`);
            }
        }

        this.log("All candidates failed validation.");
        throw new Error("No valid YouTube source found.");
    }

    public normalizeYouTubeUrl(value: string): string | null {
        try {
            const parsed = new URL(value);
            const host = parsed.hostname.toLowerCase();

            if (host.includes("youtu.be")) {
                const videoId = parsed.pathname.split("/").filter(Boolean)[0];
                if (!videoId) {
                    return null;
                }

                return `https://www.youtube.com/watch?v=${videoId}`;
            }

            if (host.includes("youtube.com")) {
                if (parsed.pathname === "/watch") {
                    const videoId = parsed.searchParams.get("v");
                    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
                }

                if (parsed.pathname.startsWith("/shorts/")) {
                    const videoId = parsed.pathname.split("/").filter(Boolean)[1];
                    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
                }
            }

            return null;
        }
        catch {
            return null;
        }
    }

    public getYouTubeThumbnailUrl(youtubeUrl: string): string | undefined {
        try {
            const parsed = new URL(youtubeUrl);
            if (parsed.pathname !== "/watch") {
                return undefined;
            }

            const videoId = parsed.searchParams.get("v");
            if (!videoId) {
                return undefined;
            }

            return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
        catch {
            return undefined;
        }
    }

    private buildYouTubeSearchVariants(baseQuery: string, expected?: AudioDbTrackMetadata, queryHint?: string): string[] {
        const variants = new Set<string>();
        const add = (value: string): void => {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                variants.add(trimmed);
            }
        };

        add(baseQuery);

        const stripped = this.stripSearchNoise(baseQuery);
        if (stripped !== baseQuery) {
            add(stripped);
        }

        if (queryHint) {
            add(queryHint);

            const parsed = this.parseArtistAndTitle(queryHint);
            if (parsed.artist && parsed.title) {
                add(`${parsed.artist} ${parsed.title}`);
                add(`${parsed.title} ${parsed.artist}`);
            }
        }

        if (expected) {
            add(`${expected.title} ${expected.artists.join(" ")}`);
            add(`${expected.artists.join(" ")} ${expected.title}`);
        }

        add(this.enrichYouTubeSearchQuery(baseQuery));

        return [...variants];
    }

    private async fetchYouTubeCandidates(searchQuery: string): Promise<YouTubeCandidate[]> {
        const results = await ExternalRequestExecutor.execute(
            () => play.search(searchQuery, {
                source: {
                    youtube: "video"
                },
                limit: this.searchLimit
            }),
            this.createRequestOptions("YouTube search", 10_000, 3)
        );

        this.log(`[${searchQuery}] Rohresultate: ${results.length}`);

        const candidates: YouTubeCandidate[] = [];
        let skippedNoUrl = 0;
        let skippedLive = 0;
        let skippedPrivate = 0;
        let skippedUpcoming = 0;
        let skippedNormalize = 0;

        for (const result of results) {
            if (!result.url) {
                skippedNoUrl += 1;
                continue;
            }

            if (result.live) {
                skippedLive += 1;
                continue;
            }

            if (result.private) {
                skippedPrivate += 1;
                continue;
            }

            if (result.upcoming) {
                skippedUpcoming += 1;
                continue;
            }

            const normalized = this.normalizeYouTubeUrl(result.url);
            if (!normalized || play.yt_validate(normalized) !== "video") {
                skippedNormalize += 1;
                continue;
            }

            candidates.push({
                url: normalized,
                title: result.title ?? normalized,
                durationInSec: result.durationInSec,
                channelName: result.channel?.name?.toLowerCase() ?? "",
                channelVerified: result.channel?.verified ?? false,
                thumbnailUrl: this.getYouTubeThumbnailUrl(normalized)
            });
        }

        this.log(`[${searchQuery}] Filterstatistik: noUrl=${skippedNoUrl}, live=${skippedLive}, private=${skippedPrivate}, upcoming=${skippedUpcoming}, invalid=${skippedNormalize}, verbleibend=${candidates.length}`);
        return candidates;
    }

    private createRequestOptions(serviceName: string, timeoutMs: number, maxAttempts: number) {
        return {
            serviceName,
            timeoutMs,
            maxAttempts,
            baseDelayMs: 750,
            logger: (message: string) => this.log(message)
        };
    }

    private stripSearchNoise(query: string): string {
        const noiseWords = new Set(["official", "offiziell", "audio", "original", "studio", "version"]);
        const cleaned = query
            .split(/\s+/)
            .filter((part) => !noiseWords.has(part.toLowerCase()))
            .join(" ")
            .trim();

        return cleaned.length > 0 ? cleaned : query;
    }

    private enrichYouTubeSearchQuery(query: string): string {
        const base = query.trim();
        if (!base) {
            return query;
        }

        return `${base} official audio official offiziell original studio version`;
    }

    private scoreYouTubeCandidate(candidate: YouTubeCandidate, expected?: AudioDbTrackMetadata, queryHint?: string): number {
        const title = candidate.title.toLowerCase();
        const channel = candidate.channelName;
        let score = 0;

        if (expected) {
            const expectedTitle = expected.title.toLowerCase();
            const normalizedExpectedTitle = this.normalizeText(expectedTitle);
            const normalizedCandidateTitle = this.normalizeText(title);

            if (normalizedCandidateTitle.includes(normalizedExpectedTitle)) {
                score += 70;
            }
            else {
                score -= 40;
            }

            let artistMatches = 0;
            for (const artist of expected.artists) {
                const normalizedArtist = this.normalizeText(artist.toLowerCase());
                if (normalizedCandidateTitle.includes(normalizedArtist) || this.normalizeText(channel).includes(normalizedArtist)) {
                    artistMatches += 1;
                    score += 30;
                }
            }

            if (artistMatches === 0) {
                score -= 35;
            }

            if (candidate.durationInSec && expected.durationSec > 0) {
                const diff = Math.abs(candidate.durationInSec - expected.durationSec);
                if (diff <= 3) {
                    score += 22;
                }
                else if (diff <= 8) {
                    score += 14;
                }
                else if (diff <= 15) {
                    score += 8;
                }
                else if (diff > 35) {
                    score -= 10;
                }
            }
        }

        if (queryHint) {
            const queryTokens = this.getSearchTokens(queryHint);
            if (queryTokens.length > 0) {
                const tokenMatches = queryTokens.filter((token) => this.normalizeText(title).includes(token)).length;
                score += tokenMatches * 10;
                if (tokenMatches === 0) {
                    score -= 20;
                }
            }
        }

        if (title.includes("official audio")) {
            score += 14;
        }

        if (channel.includes(" - topic") || channel.includes("topic")) {
            score += 10;
        }

        if (channel.includes("vevo")) {
            score += 6;
        }

        if (candidate.channelVerified) {
            score += 6;
        }

        const positiveHints = ["audio", "provided to youtube", "album version"];
        for (const hint of positiveHints) {
            if (title.includes(hint)) {
                score += 8;
            }
        }

        const negativeHints = ["official video", "music video", "video", "mv", "live", "lyric", "lyrics", "reaction", "cover", "remix", "nightcore", "slowed", "reverb"];
        for (const hint of negativeHints) {
            if (title.includes(hint)) {
                score -= 12;
            }
        }

        return score;
    }

    private matchesRequiredSongTerms(candidate: YouTubeCandidate, expected?: AudioDbTrackMetadata, queryHint?: string): boolean {
        const normalizedTitle = this.normalizeText(candidate.title);
        const normalizedChannel = this.normalizeText(candidate.channelName);

        if (expected) {
            const expectedTitle = this.normalizeText(expected.title);
            const hasTitle = normalizedTitle.includes(expectedTitle) || this.allTokensPresent(normalizedTitle, this.getSearchTokens(expected.title));

            const hasArtist = expected.artists
                .map((artist) => this.normalizeText(artist))
                .some((artist) => artist.length > 1 && (normalizedTitle.includes(artist) || normalizedChannel.includes(artist)));

            return hasTitle && hasArtist;
        }

        if (!queryHint) {
            return true;
        }

        const parsed = this.parseArtistAndTitle(queryHint);
        if (parsed.artist && parsed.title) {
            const artist = this.normalizeText(parsed.artist);
            const title = this.normalizeText(parsed.title);
            if (artist.length <= 1 || title.length <= 1) {
                return true;
            }

            const titleHasArtist = normalizedTitle.includes(artist);
            const titleHasTitle = normalizedTitle.includes(title);
            const channelHasArtist = normalizedChannel.includes(artist);
            const channelHasTitle = normalizedChannel.includes(title);

            const orientationA = titleHasTitle && (titleHasArtist || channelHasArtist);
            const orientationB = titleHasArtist && (titleHasTitle || channelHasTitle);

            return orientationA || orientationB;
        }

        const queryTokens = this.getSearchTokens(queryHint).filter((token) => token.length >= 3);
        if (queryTokens.length === 0) {
            return true;
        }

        const tokenMatches = queryTokens.filter((token) => normalizedTitle.includes(token) || normalizedChannel.includes(token)).length;
        const requiredMatches = Math.min(queryTokens.length, 3);
        return tokenMatches >= requiredMatches;
    }

    private containsBothParsedTerms(candidate: YouTubeCandidate, left: string, right: string): boolean {
        const normalizedTitle = this.normalizeText(candidate.title);
        const normalizedChannel = this.normalizeText(candidate.channelName);
        const leftNorm = this.normalizeText(left);
        const rightNorm = this.normalizeText(right);

        if (leftNorm.length <= 1 || rightNorm.length <= 1) {
            return true;
        }

        const hasLeft = normalizedTitle.includes(leftNorm) || normalizedChannel.includes(leftNorm);
        const hasRight = normalizedTitle.includes(rightNorm) || normalizedChannel.includes(rightNorm);
        return hasLeft && hasRight;
    }

    private parseArtistAndTitle(query: string): { artist?: string; title?: string } {
        const trimmed = query.trim();
        if (!trimmed) {
            return {};
        }

        const separators = [" - ", " – ", " — ", " by "];
        const lowerTrimmed = trimmed.toLowerCase();
        for (const separator of separators) {
            const lowerSeparator = separator.toLowerCase();
            const index = lowerTrimmed.indexOf(lowerSeparator);
            if (index <= 0) {
                continue;
            }

            const left = trimmed.slice(0, index).trim();
            const right = trimmed.slice(index + separator.length).trim();
            if (!left || !right) {
                continue;
            }

            if (separator.trim().toLowerCase() === "by") {
                return { artist: right, title: left };
            }

            return { artist: left, title: right };
        }

        return {};
    }

    private allTokensPresent(candidateText: string, tokens: string[]): boolean {
        const filtered = tokens.filter((token) => token.length >= 3);
        if (filtered.length === 0) {
            return true;
        }

        return filtered.every((token) => candidateText.includes(token));
    }

    private getSearchTokens(query: string): string[] {
        const stopWords = new Set(["official", "offiziell", "audio", "original", "studio", "version"]);
        return this.normalizeText(query)
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && !stopWords.has(token));
    }

    private normalizeText(value: string): string {
        return value
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private log(message: string): void {
        if (!this.debugEnabled) {
            return;
        }

        if (this.logger) {
            this.logger(message);
            return;
        }

        console.log(`[Music][Search] ${message}`);
    }
}