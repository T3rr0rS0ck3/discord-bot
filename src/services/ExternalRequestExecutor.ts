export type ExternalRequestOptions = {
    serviceName: string;
    timeoutMs: number;
    maxAttempts: number;
    baseDelayMs: number;
    shouldRetry?: (error: unknown) => boolean;
    getRetryDelayMs?: (error: unknown) => number | undefined;
    logger?: (message: string) => void;
};

export class ExternalHttpError extends Error {
    public constructor(
        public readonly status: number,
        public readonly retryAfterMs?: number
    ) {
        super(`HTTP ${status}`);
    }
}

export class ExternalRequestExecutor {
    public static async execute<T>(
        operation: (signal: AbortSignal) => Promise<T>,
        options: ExternalRequestOptions
    ): Promise<T> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
            const controller = new AbortController();
            let timeout: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeout = setTimeout(() => {
                    controller.abort();
                    reject(Object.assign(
                        new Error(`${options.serviceName} timed out after ${options.timeoutMs}ms`),
                        { name: "AbortError" }
                    ));
                }, options.timeoutMs);
            });

            try {
                return await Promise.race([operation(controller.signal), timeoutPromise]);
            } catch (error) {
                lastError = error;
                const retryable = options.shouldRetry?.(error) ?? this.isRetryable(error);
                if (!retryable || attempt >= options.maxAttempts) {
                    throw error;
                }

                const retryDelay = options.getRetryDelayMs?.(error)
                    ?? (error instanceof ExternalHttpError ? error.retryAfterMs : undefined)
                    ?? options.baseDelayMs * 2 ** (attempt - 1);
                options.logger?.(`[${options.serviceName}] Request failed, retrying in ${retryDelay}ms (${attempt}/${options.maxAttempts}).`);
                await this.delay(retryDelay);
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }

        throw lastError;
    }

    public static parseRetryAfter(value: string | null): number | undefined {
        if (!value) return undefined;

        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return seconds * 1000;
        }

        const date = Date.parse(value);
        if (!Number.isFinite(date)) return undefined;
        return Math.max(0, date - Date.now());
    }

    private static isRetryable(error: unknown): boolean {
        if (error instanceof ExternalHttpError) {
            return error.status === 429 || error.status >= 500;
        }

        if (error instanceof Error) {
            return error.name === "AbortError"
                || /timeout|timed out|429|rate.?limit|econnreset|eai_again|network/i.test(error.message);
        }

        return false;
    }

    private static async delay(delayMs: number): Promise<void> {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
    }
}