import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';
import { actionExecutor } from './action-executor.js';
import { getDb } from './database.js';
import { TelegramAuth } from '../utils/telegram-auth.js';
import { RateLimiter } from '../utils/rate-limiter.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const managerId = process.env.MANAGER_TG_ID;

if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not defined');

export const bot = new Bot(token);
const db = getDb();

// Security: Authentication and Rate Limiting
const auth = new TelegramAuth();
const rateLimiter = new RateLimiter(20, 60000); // 20 requests per minute

bot.use(auth.middleware());
bot.use(rateLimiter.middleware());

export class TelegramService {
    private db = getDb();
    // Conversation memory: chatId -> message history
    private conversationHistory = new Map<string, Array<{ role: string; content: string }>>();
    /**
     * Send rich contextual alert - что/почему/что делать
     */
    public async sendActionProposal(
        pendingActionId: number,
        lead: any,
        analysis: any
    ) {
        if (!managerId) return;

        // Extract analysis data
        const daysSince = lead.updated_at
            ? Math.floor((Date.now() / 1000 - lead.updated_at) / 86400)
            : 0;

        const budget = lead.price || 0;
        const hasActiveTasks = lead._embedded?.tasks?.some((t: any) => !t.is_completed) || false;

        // Determine issue type
        const issue = this.describeIssue(daysSince, hasActiveTasks, budget);
        const impact = this.explainImpact(budget, daysSince);

        // Get action from pending_actions
        const action = db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(pendingActionId) as any;

        const riskEmoji = {
            CRITICAL: '🔴',
            HIGH: '🟠',
            MEDIUM: '',
            LOW: '🟢'
        }[action?.risk_score > 70 ? 'CRITICAL' : action?.risk_score > 40 ? 'HIGH' : 'MEDIUM'] || '⚪';

        const message = `
${riskEmoji} **Требует внимания**

**Что:** ${lead.name} (#${lead.id})
**Проблема:** ${issue}
**Почему важно:** ${impact}
${budget > 0 ? `**Бюджет:** ${budget.toLocaleString()} ₽` : ''}

📊 **Контекст:**
• Последний контакт: ${daysSince} дн. назад
• Активные задачи: ${hasActiveTasks ? '✅ Есть' : '❌ Нет'}
• Приоритет: ${action?.priority || 'MEDIUM'}

🎯 **Рекомендация:**
${action?.reasoning || analysis.text.substring(0, 150)}

${this.getActionButtons(action)}

**Что делать:**
✅ Выполнить — создать задачу прямо сейчас
❌ Отклонить — клиент не требует внимания
`;

        const keyboard = new InlineKeyboard()
            .text('✅ Выполнить', `execute_${pendingActionId}`)
            .text('❌ Отклонить', `reject_${pendingActionId}`)
            .row()
            .text('📋 Детали', `details_${lead.id}`);

        try {
            const sentMessage = await bot.api.sendMessage(managerId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Save telegram message ID for future updates
            db.prepare('UPDATE pending_actions SET telegram_message_id = ? WHERE id = ?')
                .run(sentMessage.message_id, pendingActionId);

            return sentMessage;
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
            throw error;
        }
    }

    /**
     * Describe what's wrong with the lead
     */
    private describeIssue(daysSince: number, hasActiveTasks: boolean, budget: number): string {
        if (daysSince > 7) return `Застрял - нет движения ${daysSince} дней`;
        if (!hasActiveTasks && daysSince > 3) return `Нет активных задач ${daysSince} дней`;
        if (budget > 500000 && daysSince > 1) return "VIP клиент ждёт ответа";
        if (budget > 100000 && daysSince > 2) return "Важный клиент может уйти";
        return `Требует проверки (${daysSince} дней без обновления)`;
    }

    /**
     * Explain business impact
     */
    private explainImpact(budget: number, daysSince: number): string {
        if (budget > 500000) return `Потенциально ${(budget / 1000).toFixed(0)}K₽ под угрозой`;
        if (daysSince > 7) return "Высокий риск потери сделки";
        if (daysSince > 3) return "Клиент может уйти к конкурентам";
        return "Снижается вероятность закрытия";
    }

    /**
     * Get action-specific instructions
     */
    private getActionButtons(action: any): string {
        if (action?.action_type === 'create_task') {
            const data = JSON.parse(action.action_data || '{}');
            return `📝 **Задача:** ${data.text || 'Связаться с клиентом'}`;
        }
        return '';
    }

    /**
     * Send lead details
     */
    public async sendLeadDetails(leadId: number, chatId: string) {
        const lead: any = db.prepare('SELECT * FROM leads WHERE amo_id = ?').get(leadId);
        const scores: any[] = db.prepare(`
            SELECT * FROM lead_scores 
            WHERE lead_id = ? 
            ORDER BY calculated_at DESC 
            LIMIT 5
        `).all(leadId) as any[];

        const thoughts: any[] = db.prepare(`
            SELECT * FROM thoughts 
            WHERE lead_id = ? 
            ORDER BY created_at DESC 
            LIMIT 3
        `).all(leadId) as any[];

        let message = `📋 **Детали лида #${leadId}**\n\n`;

        if (lead) {
            message += `**Статус:** ${lead.status_id}\n`;
            message += `**Последняя мысль:** ${lead.last_thought || 'Нет'}\n\n`;
        }

        if (scores.length > 0) {
            message += `**История оценок:**\n`;
            scores.forEach(s => {
                message += `• ${new Date(s.calculated_at).toLocaleDateString()}: ${s.risk_level} / ${s.priority}\n`;
            });
            message += '\n';
        }

        if (thoughts.length > 0) {
            message += `**Последние размышления AI:**\n`;
            thoughts.forEach(t => {
                message += `• ${t.thought.substring(0, 100)}...\n`;
            });
        }

        await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }

    /**
     * Send today's digest - dashboard with tasks and critical leads
     */
    public async sendTodayDigest(chatId: string) {
        const { amocrm } = await import('./amocrm.js');

        try {
            // Get today's tasks
            const tasksToday = await amocrm.getTasksForToday();
            const overdueTasks = await amocrm.getOverdueTasks();

            // Get critical leads
            const riskLeads = await amocrm.getLeadsByRiskLevel(7);
            const vipLeads = await amocrm.getVIPLeads();

            const greeting = this.getGreeting();
            let message = `${greeting}\n\n📊 **Сегодня:**\n\n`;

            // Overdue tasks
            if (overdueTasks.length > 0) {
                message += `🔴 **${overdueTasks.length} просроченных задач**\n`;
            }

            // Today's tasks
            if (tasksToday.length > 0) {
                message += `✅ **${tasksToday.length} задач на сегодня**\n`;
            } else {
                message += `✅ Задач на сегодня нет\n`;
            }

            // Critical leads
            if (riskLeads.length > 0) {
                message += `⚠️ **${riskLeads.length} сделок застряли >7 дней**\n`;
            }

            // VIP leads
            if (vipLeads.length > 0) {
                message += `🔥 **${vipLeads.length} VIP лидов требуют внимания**\n`;
            }

            message += `\n**Команды:**\n`;
            message += `/hot — срочные лиды\n`;
            message += `/risk — застрявшие сделки\n`;
            message += `/tasks — активные задачи\n`;

            await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending today digest:', error);
            await bot.api.sendMessage(chatId, '❌ Ошибка при получении данных');
        }
    }

    /**
     * Send risk leads - stuck 7+ days
     */
    public async sendRiskLeads(chatId: string) {
        const { amocrm } = await import('./amocrm.js');

        try {
            const riskLeads = await amocrm.getLeadsByRiskLevel(7);

            if (riskLeads.length === 0) {
                await bot.api.sendMessage(chatId, '✅ Застрявших лидов нет!');
                return;
            }

            let message = `⚠️ **Застрявшие лиды (${riskLeads.length}):**\n\n`;

            riskLeads.slice(0, 10).forEach((lead: any, index: number) => {
                const daysSince = Math.floor((Date.now() / 1000 - lead.updated_at) / 86400);
                const budget = lead.price || 0;

                message += `${index + 1}. **${lead.name}**\n`;
                message += `   📅 ${daysSince} дней без движения\n`;
                if (budget > 0) {
                    message += `   💰 ${budget.toLocaleString()} ₽\n`;
                }
                message += `   🔗 [Открыть в CRM](https://${process.env.AMOCRM_SUBDOMAIN}.amocrm.ru/leads/detail/${lead.id})\n\n`;
            });

            if (riskLeads.length > 10) {
                message += `\n_...и ещё ${riskLeads.length - 10} лидов_`;
            }

            await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending risk leads:', error);
            await bot.api.sendMessage(chatId, '❌ Ошибка при получении данных');
        }
    }

    /**
     * Send hot leads - VIP and important clients
     */
    public async sendHotLeads(chatId: string) {
        const { amocrm } = await import('./amocrm.js');

        try {
            const vipLeads = await amocrm.getVIPLeads();
            const importantLeads = await amocrm.getImportantLeads();

            if (vipLeads.length === 0 && importantLeads.length === 0) {
                await bot.api.sendMessage(chatId, '✅ Срочных лидов нет');
                return;
            }

            let message = `🔥 **Горячие лиды:**\n\n`;

            if (vipLeads.length > 0) {
                message += `**🔴 VIP (500K+):**\n`;
                vipLeads.slice(0, 5).forEach((lead: any) => {
                    const daysSince = Math.floor((Date.now() / 1000 - lead.updated_at) / 86400);
                    message += `• ${lead.name} — ${(lead.price || 0).toLocaleString()} ₽\n`;
                    message += `  📞 Последний контакт: ${daysSince} дн. назад\n`;
                });
                message += '\n';
            }

            if (importantLeads.length > 0) {
                message += `**🟠 Важные (100K+):**\n`;
                importantLeads.slice(0, 5).forEach((lead: any) => {
                    const daysSince = Math.floor((Date.now() / 1000 - lead.updated_at) / 86400);
                    message += `• ${lead.name} — ${(lead.price || 0).toLocaleString()} ₽\n`;
                    message += `  📞 ${daysSince} дн. назад\n`;
                });
            }

            await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending hot leads:', error);
            await bot.api.sendMessage(chatId, '❌ Ошибка при получении данных');
        }
    }

    /**
     * Send weekly overview
     */
    public async sendWeeklyOverview(chatId: string) {
        const { amocrm } = await import('./amocrm.js');

        try {
            const allLeads = await amocrm.getNewLeads();
            const allTasks = await amocrm.getTasksByDeadline();

            const executed = db.prepare('SELECT COUNT(*) as count FROM pending_actions WHERE status = ? AND created_at > ?')
                .get('executed', Math.floor(Date.now() / 1000) - 7 * 86400) as any;

            const rejected = db.prepare('SELECT COUNT(*) as count FROM pending_actions WHERE status = ? AND created_at > ?')
                .get('rejected', Math.floor(Date.now() / 1000) - 7 * 86400) as any;

            let message = `📅 **Обзор недели:**\n\n`;
            message += `📊 **Лиды:** ${allLeads.length} активных\n`;
            message += `✅ **Задачи:** ${allTasks.length} активных\n`;
            message += `🎯 **Выполнено действий:** ${executed.count}\n`;
            message += `❌ **Отклонено:** ${rejected.count}\n`;

            await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending weekly overview:', error);
            await bot.api.sendMessage(chatId, '❌ Ошибка при получении данных');
        }
    }

    /**
     * Handle conversational queries with AI reasoning
     */
    private async handleConversationalQuery(userMessage: string, chatId: string) {
        const { ai } = await import('./ai.js');
        const { amocrm } = await import('./amocrm.js');
        const { generateText, tool } = await import('ai');
        const { google } = await import('@ai-sdk/google');
        const { z } = await import('zod');

        try {
            // Send "typing" indicator
            await bot.api.sendChatAction(chatId, 'typing');

            // Get or initialize conversation history
            if (!this.conversationHistory.has(chatId)) {
                this.conversationHistory.set(chatId, []);
            }
            const msgHistory = this.conversationHistory.get(chatId)!;

            // Add user message to history
            msgHistory.push({ role: 'user', content: userMessage });

            const result = await generateText({
                model: google('gemini-2.5-flash'),
                system: `CRM AI-ассистент. Будь кратким и полезным.

СТИЛЬ:
✅ Короткие списки
✅ Анализируй + рекомендации
✅ Используй данные из истории (не запрашивай повторно!)
✅ Эмодзи для визуала

ОЦЕНКИ:
• ✅ Хорошо: свежий, есть задачи
• ⚠️ Внимание: нет задач, старый
• 🔥 Срочно: VIP без движения

ИНСТРУМЕНТЫ:
📊 getVIPLeads, searchLeads, getLeadDetails(id), getStatuses
✏️ createTask(id,text,hours), addNote(id,text)
🔄 updateLeadStatus(id,status)`,
                messages: [
                    { role: 'user', content: `ИСТОРИЯ:\n${msgHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}\n\nЗАПРОС: ${userMessage}` }
                ],
                tools: {
                    // === ЧТЕНИЕ ЛИДОВ ===
                    getVIPLeads: tool({
                        description: 'Получить список VIP лидов (500K+ бюджет)',
                        parameters: z.object({}),
                        execute: async () => {
                            const leads = await amocrm.getVIPLeads();
                            return leads.map((l: any) => ({
                                name: l.name,
                                id: l.id,
                                price: l.price,
                                updated: Math.floor((Date.now() / 1000 - l.updated_at) / 86400)
                            }));
                        }
                    }),
                    getImportantLeads: tool({
                        description: 'Получить важные лиды (100K-500K бюджет)',
                        parameters: z.object({}),
                        execute: async () => {
                            const leads = await amocrm.getImportantLeads();
                            return leads.map((l: any) => ({
                                name: l.name,
                                id: l.id,
                                price: l.price,
                                updated: Math.floor((Date.now() / 1000 - l.updated_at) / 86400)
                            }));
                        }
                    }),
                    getRiskLeads: tool({
                        description: 'Получить застрявшие лиды (7+ дней без движения)',
                        parameters: z.object({}),
                        execute: async () => {
                            const leads = await amocrm.getLeadsByRiskLevel(7);
                            return leads.map((l: any) => ({
                                name: l.name,
                                id: l.id,
                                price: l.price || 0,
                                daysStuck: Math.floor((Date.now() / 1000 - l.updated_at) / 86400)
                            }));
                        }
                    }),
                    getLeadDetails: tool({
                        description: 'Получить полную информацию о конкретном лиде (история, задачи, заметки)',
                        parameters: z.object({
                            leadId: z.number().describe('ID лида')
                        }),
                        execute: async ({ leadId }) => {
                            const details = await amocrm.getLeadDetails(leadId);

                            // Get status name from pipelines
                            const pipelines = await amocrm.getPipelines();
                            let statusName = 'Неизвестно';

                            for (const pipeline of pipelines) {
                                if (pipeline.id === details.pipeline_id) {
                                    const statuses = pipeline._embedded?.statuses || [];
                                    const status = statuses.find((s: any) => s.id === details.status_id);
                                    if (status) {
                                        statusName = status.name;
                                        break;
                                    }
                                }
                            }

                            return {
                                name: details.name,
                                id: details.id,
                                status: statusName,
                                status_id: details.status_id,
                                pipeline_id: details.pipeline_id,
                                price: details.price || 0,
                                created: new Date(details.created_at * 1000).toLocaleDateString('ru-RU'),
                                updated: new Date(details.updated_at * 1000).toLocaleDateString('ru-RU'),
                                tasksCount: details.tasks.length,
                                notesCount: details.notes.length,
                                recentNotes: details.notes.slice(0, 3).map((n: any) => n.params?.text || '').filter(Boolean),
                                activeTasks: details.tasks.filter((t: any) => !t.is_completed).map((t: any) => ({
                                    text: t.text,
                                    deadline: new Date(t.complete_till * 1000).toLocaleDateString('ru-RU')
                                }))
                            };
                        }
                    }),
                    searchLeads: tool({
                        description: 'Найти лиды по тексту (имя, часть имени). Используй если не знаешь точный ID',
                        parameters: z.object({
                            query: z.string().describe('Поисковый запрос (часть имени лида)')
                        }),
                        execute: async ({ query }) => {
                            const results = await amocrm.searchLeads(query);
                            return results.map((l: any) => ({
                                name: l.name,
                                id: l.id,
                                price: l.price || 0,
                                updated: Math.floor((Date.now() / 1000 - l.updated_at) / 86400)
                            }));
                        }
                    }),
                    getStatuses: tool({
                        description: 'Получить список всех статусов/стадий в amoCRM',
                        parameters: z.object({}),
                        execute: async () => {
                            const pipelines = await amocrm.getPipelines();
                            const result: any[] = [];

                            for (const pipeline of pipelines) {
                                const statuses = pipeline._embedded?.statuses || [];
                                result.push({
                                    pipeline: pipeline.name,
                                    statuses: statuses.map((s: any) => s.name)
                                });
                            }

                            return result;
                        }
                    }),

                    // === ЗАДАЧИ ===
                    getTodayTasks: tool({
                        description: 'Получить задачи на сегодня (по дедлайну или созданные сегодня)',
                        parameters: z.object({}),
                        execute: async () => {
                            const tasks = await amocrm.getTasksForToday();
                            return tasks.map((t: any) => ({
                                id: t.id,
                                text: t.text,
                                leadId: t.entity_id,
                                deadline: new Date(t.complete_till * 1000).toLocaleString('ru-RU'),
                                created: new Date(t.created_at * 1000).toLocaleString('ru-RU')
                            }));
                        }
                    }),
                    getOverdueTasks: tool({
                        description: 'Получить просроченные задачи',
                        parameters: z.object({}),
                        execute: async () => {
                            const tasks = await amocrm.getOverdueTasks();
                            return tasks.map((t: any) => ({
                                text: t.text,
                                leadId: t.entity_id,
                                overdueDays: Math.floor((Date.now() / 1000 - t.complete_till) / 86400)
                            }));
                        }
                    }),
                    createTask: tool({
                        description: 'Создать новую задачу для лида',
                        parameters: z.object({
                            leadId: z.number().describe('ID лида'),
                            text: z.string().describe('Текст задачи'),
                            hoursUntilDeadline: z.number().optional().describe('Через сколько часов дедлайн (по умолчанию 24)')
                        }),
                        execute: async ({ leadId, text, hoursUntilDeadline }) => {
                            const deadline = Math.floor(Date.now() / 1000) + (hoursUntilDeadline || 24) * 3600;
                            await amocrm.createTask(leadId, {
                                text,
                                complete_till: deadline
                            });
                            return {
                                success: true,
                                message: `Задача создана для лида #${leadId}`,
                                deadline: new Date(deadline * 1000).toLocaleString('ru-RU')
                            };
                        }
                    }),

                    // === ЗАМЕТКИ ===
                    addNote: tool({
                        description: 'Добавить заметку к лиду',
                        parameters: z.object({
                            leadId: z.number().describe('ID лида'),
                            note: z.string().describe('Текст заметки')
                        }),
                        execute: async ({ leadId, note }) => {
                            await amocrm.addNote(leadId, note);
                            return {
                                success: true,
                                message: `Заметка добавлена к лиду #${leadId}`
                            };
                        }
                    }),

                    // === ОБНОВЛЕНИЕ ЛИДОВ ===
                    updateLeadStatus: tool({
                        description: 'Изменить статус лида. Укажи название статуса',
                        parameters: z.object({
                            leadId: z.number().describe('ID лида'),
                            statusName: z.string().describe('Название статуса')
                        }),
                        execute: async ({ leadId, statusName }) => {
                            const found = await amocrm.findStatusByName(statusName);
                            if (!found) {
                                // Get all available statuses for helpful error
                                const pipelines = await amocrm.getPipelines();
                                const allStatuses: string[] = [];
                                for (const pipeline of pipelines) {
                                    const statuses = pipeline._embedded?.statuses || [];
                                    allStatuses.push(...statuses.map((s: any) => s.name));
                                }

                                return {
                                    success: false,
                                    message: `Статус "${statusName}" не найден.\n\nДоступные:\n${allStatuses.map(s => `• ${s}`).join('\n')}`
                                };
                            }

                            await amocrm.updateLead(leadId, { status_id: found.id });
                            return {
                                success: true,
                                message: `✅ Статус лида #${leadId} → "${found.name}"`
                            };
                        }
                    })
                },
                maxSteps: 5
            });

            // Add AI response to history
            msgHistory.push({ role: 'assistant', content: result.text });

            // Keep only last 12 messages (6 exchanges)
            if (msgHistory.length > 12) {
                this.conversationHistory.set(chatId, msgHistory.slice(-12));
            }

            // Send AI response (with fallback for empty)
            const responseText = result.text?.trim() || 'Выполнено ✅';
            await bot.api.sendMessage(chatId, responseText);

        } catch (error) {
            console.error('Conversational AI error:', error);
            await bot.api.sendMessage(chatId, 'Извини, что-то пошло не так. Попробуй /help для списка команд.');
        }
    }

    /**
     * Get greeting based on time of day
     */
    private getGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 12) return '☀️ Доброе утро!';
        if (hour < 18) return '👋 Добрый день!';
        return '🌆 Добрый вечер!';
    }

    /**
     * Send morning digest (called by scheduler)
     */
    public async sendMorningDigest() {
        const managerId = process.env.MANAGER_TG_ID;
        if (!managerId) return;

        await this.sendTodayDigest(managerId);
    }

    /**
     * Send evening report (called by scheduler)
     */
    public async sendEveningReport() {
        const managerId = process.env.MANAGER_TG_ID;
        if (!managerId) return;

        const { amocrm } = await import('./amocrm.js');

        try {
            const tasksToday = await amocrm.getTasksForToday();
            const overdueTasks = await amocrm.getOverdueTasks();

            // Count completed actions today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Math.floor(today.getTime() / 1000);

            const actionsToday = db.prepare(`
                SELECT COUNT(*) as count 
                FROM pending_actions 
                WHERE status = 'executed' AND created_at >= ?
            `).get(todayTimestamp) as any;

            let message = `🌆 **Вечерний отчёт:**\n\n`;
            message += `✅ Выполнено действий: ${actionsToday?.count || 0}\n`;
            message += `📋 Задач на сегодня: ${tasksToday.length}\n`;

            if (overdueTasks.length > 0) {
                message += `🔴 Просроченных задач: ${overdueTasks.length}\n`;
            }

            message += `\nХорошего вечера! 🌙`;

            await bot.api.sendMessage(managerId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error sending evening report:', error);
        }
    }

    /**
     * Setup bot handlers
     */
    public setupHandlers() {
        // Execute action
        bot.callbackQuery(/^execute_(\d+)$/, async (ctx) => {
            const actionId = parseInt(ctx.match[1]);
            try {
                await actionExecutor.execute(actionId);
                await actionExecutor.logDecision(actionId, 'approved');
                await ctx.editMessageText(ctx.message?.text + '\n\n✅ **Действие выполнено в amoCRM**');
                await ctx.answerCallbackQuery('Выполнено!');
            } catch (error: any) {
                await ctx.answerCallbackQuery(`Ошибка: ${error.message}`);
            }
        });

        // Reject action
        bot.callbackQuery(/^reject_(\d+)$/, async (ctx) => {
            const actionId = parseInt(ctx.match[1]);
            await actionExecutor.reject(actionId);
            await actionExecutor.logDecision(actionId, 'rejected');
            await ctx.editMessageText(ctx.message?.text + '\n\n❌ **Действие отклонено**');
            await ctx.answerCallbackQuery('Отклонено');
        });

        // Show details
        bot.callbackQuery(/^details_(\d+)$/, async (ctx) => {
            const leadId = parseInt(ctx.match[1]);
            await this.sendLeadDetails(leadId, ctx.chat!.id.toString());
            await ctx.answerCallbackQuery();
        });

        // Snooze action
        bot.callbackQuery(/^snooze_(\d+)$/, async (ctx) => {
            const actionId = parseInt(ctx.match[1]);
            // Mark as snoozed for 1 hour - will be re-evaluated in next poll
            db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?')
                .run('snoozed', actionId);
            await ctx.editMessageText(ctx.message?.text + '\n\n⏰ **Отложено на 1 час**');
            await ctx.answerCallbackQuery('Отложено');
        });

        bot.command('start', (ctx) => {
            const helpMessage = `🤖 **CRM AI Agent активен**

Я помогу управлять лидами прямо из Telegram! 

📊 **Основные команды:**
/today — дашборд дня (задачи + критичные лиды)
/hot — VIP и важные клиенты (100K+)
/risk — застрявшие лиды (7+ дней)
/week — обзор недели
/stats — статистика агента

💡 **Можешь просто писать:**
"покажи горячие лиды"
"что сегодня?"
"какие срочные дела?"

Я пойму и помогу! 🚀`;

            ctx.reply(helpMessage, { parse_mode: 'Markdown' });
        });

        bot.command('help', (ctx) => {
            ctx.reply(`📖 **Список команд:**

📊 *Обзоры:*
/today — дашборд дня
/hot — VIP лиды (500K+) и важные (100K+)
/risk — застрявшие лиды (>7 дней без движения)
/week — обзор недели

📈 *Статистика:*
/stats — статистика работы агента

💬 *Подсказка:*
Можешь писать обычным текстом, я помогу найти нужную информацию!`,
                { parse_mode: 'Markdown' }
            );
        });

        // Handle regular text messages with AI assistant
        bot.on('message:text', async (ctx) => {
            const text = ctx.message.text;

            // Skip if it's a command
            if (text.startsWith('/')) return;

            // Use AI conversational assistant
            await this.handleConversationalQuery(text, ctx.chat.id.toString());
        });

        bot.command('stats', async (ctx) => {
            const pending = db.prepare('SELECT COUNT(*) as count FROM pending_actions WHERE status = ?').get('pending') as any;
            const executed = db.prepare('SELECT COUNT(*) as count FROM pending_actions WHERE status = ?').get('executed') as any;
            const rejected = db.prepare('SELECT COUNT(*) as count FROM pending_actions WHERE status = ?').get('rejected') as any;

            await ctx.reply(`📊 **Статистика агента:**\n\nОжидают одобрения: ${pending.count}\nВыполнено: ${executed.count}\nОтклонено: ${rejected.count}`);
        });

        // Quick overview commands
        bot.command('today', async (ctx) => {
            await this.sendTodayDigest(ctx.chat.id.toString());
        });

        bot.command('risk', async (ctx) => {
            await this.sendRiskLeads(ctx.chat.id.toString());
        });

        bot.command('hot', async (ctx) => {
            await this.sendHotLeads(ctx.chat.id.toString());
        });

        bot.command('week', async (ctx) => {
            await this.sendWeeklyOverview(ctx.chat.id.toString());
        });

        bot.start();
        console.log('✅ Telegram bot started');
    }
}

export const telegram = new TelegramService();
