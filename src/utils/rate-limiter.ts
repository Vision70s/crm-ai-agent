/**
 * Rate Limiter for Telegram Bot
 * Prevents spam and API abuse
 */

export class RateLimiter {
    private requests = new Map<string, number[]>();
    private readonly maxRequests: number;
    private readonly windowMs: number;

    /**
     * @param maxRequests - Maximum requests allowed per window
     * @param windowMs - Time window in milliseconds (default: 60 seconds)
     */
    constructor(maxRequests = 20, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        console.log(`✅ Rate limiter: ${maxRequests} requests per ${windowMs / 1000}s`);
    }

    /**
     * Check if user request is allowed
     */
    isAllowed(userId: string): boolean {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];

        // Remove requests outside time window
        const recentRequests = userRequests.filter(
            time => now - time < this.windowMs
        );

        if (recentRequests.length >= this.maxRequests) {
            return false;
        }

        // Add current request
        recentRequests.push(now);
        this.requests.set(userId, recentRequests);

        // Cleanup old entries periodically
        if (Math.random() < 0.01) {
            this.cleanup();
        }

        return true;
    }

    /**
     * Clean up old entries to prevent memory leak
     */
    private cleanup() {
        const now = Date.now();
        for (const [userId, requests] of this.requests.entries()) {
            const recent = requests.filter(time => now - time < this.windowMs);
            if (recent.length === 0) {
                this.requests.delete(userId);
            } else {
                this.requests.set(userId, recent);
            }
        }
    }

    /**
     * Grammy middleware for rate limiting
     */
    middleware() {
        return async (ctx: any, next: any) => {
            const userId = ctx.from?.id?.toString();

            if (!userId) {
                return;
            }

            if (!this.isAllowed(userId)) {
                console.warn(`⏱️ Rate limit exceeded for user: ${userId}`);
                await ctx.reply('⏱️ Слишком много запросов. Подождите немного и попробуйте снова.');
                return;
            }

            await next();
        };
    }
}
