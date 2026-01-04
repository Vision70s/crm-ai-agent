/**
 * Telegram Bot Authentication Middleware
 * Restricts access to authorized users only
 */

export class TelegramAuth {
    private allowedUsers: Set<string>;

    constructor() {
        const managerId = process.env.MANAGER_TG_ID;
        const additionalUsers = process.env.ALLOWED_TG_IDS?.split(',') || [];

        this.allowedUsers = new Set([
            managerId,
            ...additionalUsers
        ].filter(Boolean));

        if (this.allowedUsers.size === 0) {
            console.warn('⚠️ No allowed users configured! Set MANAGER_TG_ID in .env');
        } else {
            console.log(`✅ Auth configured for ${this.allowedUsers.size} user(s)`);
        }
    }

    /**
     * Check if user is authorized
     */
    isAuthorized(userId: string | number): boolean {
        return this.allowedUsers.has(userId.toString());
    }

    /**
     * Grammy middleware for authentication
     */
    middleware() {
        return async (ctx: any, next: any) => {
            const userId = ctx.from?.id?.toString();

            if (!userId) {
                console.warn('⚠️ Message without user ID');
                return;
            }

            if (!this.isAuthorized(userId)) {
                console.warn(`🚫 Unauthorized access attempt from: ${userId}`);
                await ctx.reply('⛔ Доступ запрещен. Этот бот предназначен только для авторизованных пользователей.');
                return;
            }

            // User is authorized, continue
            await next();
        };
    }
}
