import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import dotenv from 'dotenv';
import { amocrm } from './amocrm.js';
import { getDb } from './database.js';

dotenv.config();

const db = getDb();

export class AIService {
    private model = google('gemini-2.5-flash');

    /**
     * Main lead analysis method - autonomous intelligence layer
     */
    public async analyzeLead(leadData: any) {
        const leadId = leadData.id;

        // Calculate days since last contact
        const daysSinceContact = leadData.updated_at
            ? Math.floor((Date.now() / 1000 - leadData.updated_at) / 86400)
            : 999;

        // Fetch historical memories
        const memories = db.prepare('SELECT value FROM memory WHERE key LIKE ?')
            .all(`lead_${leadId}_%`) as any[];
        const memoryContext = memories.map(m => m.value).join('\n');

        // Get previous scores for trend analysis
        const previousScores = db.prepare(`
            SELECT risk_level, priority, calculated_at 
            FROM lead_scores 
            WHERE lead_id = ? 
            ORDER BY calculated_at DESC 
            LIMIT 3
        `).all(leadId) as any[];

        // Compact context - only essential data
        const memoryText = memoryContext ? `Память: ${memoryContext.substring(0, 100)}...` : '';
        const scoresTrend = previousScores.length > 0
            ? `Динамика: ${previousScores[0].risk_level}/${previousScores[0].priority}`
            : '';

        const result = await generateText({
            model: this.model,
            system: `CRM аналитик. Оцени риск (0-100) и нужность действия.

Риск:
• 76-100: CRITICAL (>7д)
• 51-75: HIGH (>3д, нет задач)
• 26-50: MEDIUM
• 0-25: LOW

Действия: create_task/update_status/wait
${memoryText}
${scoresTrend}`,
            prompt: `Лид #${leadData.id} "${leadData.name}":
• Обновлён: ${daysSinceContact}д назад
• Бюджет: ${leadData.price || 0}₽
• Задачи: ${leadData.tasks?.length || 0}
• Заметки: ${leadData.notes?.length || 0}
• Статус: ${leadData.status_id}

Используй инструменты для анализа.`,

            tools: {
                assessRisk: tool({
                    description: 'Оценить риск потери лида (0-100%) на основе времени, активности и истории',
                    parameters: z.object({
                        daysSinceContact: z.number(),
                        hasActiveTasks: z.boolean(),
                        engagementLevel: z.enum(['high', 'medium', 'low']),
                        reasoning: z.string()
                    }),
                    execute: async ({ daysSinceContact, hasActiveTasks, engagementLevel, reasoning }) => {
                        let score = 0;

                        // Время без контакта (0-50 points)
                        if (daysSinceContact > 7) score += 50;
                        else if (daysSinceContact > 3) score += 30;
                        else if (daysSinceContact > 1) score += 10;

                        // Активные задачи снижают риск (-20 points)
                        if (hasActiveTasks) score -= 20;

                        // Уровень вовлеченности (0-30 points)
                        if (engagementLevel === 'low') score += 30;
                        else if (engagementLevel === 'medium') score += 15;

                        score = Math.max(0, Math.min(100, score));

                        let risk_level: string;
                        if (score > 75) risk_level = 'CRITICAL';
                        else if (score > 50) risk_level = 'HIGH';
                        else if (score > 25) risk_level = 'MEDIUM';
                        else risk_level = 'LOW';

                        return { risk_score: score, risk_level, reasoning };
                    }
                }),

                scorePriority: tool({
                    description: 'Определить приоритет лида (LOW/MEDIUM/HIGH) на основе бюджета и потенциала',
                    parameters: z.object({
                        budgetEstimate: z.enum(['high', 'medium', 'low', 'unknown']),
                        leadSource: z.string().optional(),
                        reasoning: z.string()
                    }),
                    execute: async ({ budgetEstimate, leadSource, reasoning }) => {
                        let priority: string;

                        if (budgetEstimate === 'high') priority = 'HIGH';
                        else if (budgetEstimate === 'medium') priority = 'MEDIUM';
                        else priority = 'LOW';

                        return { priority, reasoning };
                    }
                }),

                recommendAction: tool({
                    description: 'Предложить оптимальное действие для лида',
                    parameters: z.object({
                        actionType: z.enum(['create_task', 'update_status', 'wait']),
                        actionDescription: z.string(),
                        timing: z.enum(['now', 'today', 'tomorrow', 'this_week']),
                        taskText: z.string().nullish(),
                        reasoning: z.string()
                    }),
                    execute: async ({ actionType, actionDescription, timing, taskText, reasoning }) => {
                        const dueDate = new Date();
                        if (timing === 'tomorrow') dueDate.setDate(dueDate.getDate() + 1);
                        else if (timing === 'this_week') dueDate.setDate(dueDate.getDate() + 3);

                        const actionData: any = {};
                        if (actionType === 'create_task') {
                            actionData.text = taskText || actionDescription;
                            actionData.complete_till = Math.floor(dueDate.getTime() / 1000);
                        }

                        return {
                            action_type: actionType,
                            description: actionDescription,
                            timing,
                            parameters: actionData,
                            reasoning
                        };
                    }
                }),

                saveThought: tool({
                    description: 'Сохранить внутреннее размышление о лиде',
                    parameters: z.object({
                        thought: z.string(),
                        action: z.string()
                    }),
                    execute: async ({ thought, action }) => {
                        db.prepare('INSERT INTO thoughts (lead_id, thought, action) VALUES (?, ?, ?)')
                            .run(leadId, thought, action);
                        return { status: 'Thought recorded' };
                    }
                }),

                updateMemory: tool({
                    description: 'Обновить долгосрочную память о лиде',
                    parameters: z.object({
                        key: z.string(),
                        insight: z.string()
                    }),
                    execute: async ({ key, insight }) => {
                        const memoryKey = `lead_${leadId}_${key}`;
                        db.prepare('INSERT OR REPLACE INTO memory (key, value) VALUES (?, ?)')
                            .run(memoryKey, insight);
                        return { status: 'Memory updated' };
                    }
                })
            },
            maxSteps: 8
        });

        return {
            raw: result,
            text: result.text,
            toolCalls: result.toolCalls,
            steps: result.steps
        };
    }

    /**
     * Batch analysis - analyze multiple leads in ONE request (much cheaper!)
     */
    public async analyzeBatch(leads: any[]) {
        console.log(`🔄 Batch analyzing ${leads.length} leads in one request...`);

        const leadsSummary = leads.map((lead, i) => ({
            index: i,
            id: lead.id,
            name: lead.name,
            price: lead.price || 0,
            status_id: lead.status_id,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
            daysSinceUpdate: Math.floor((Date.now() / 1000 - lead.updated_at) / 86400)
        }));

        // Compact format: #ID(days,budget,tasks)
        const compactLeads = leadsSummary.map(l =>
            `#${l.id}(${l.daysSinceUpdate}d,${l.price}₽,${l.status_id})`
        ).join(' ');


        const prompt = `Batch анализ ${leads.length} лидов. Верни JSON массив results.

Лиды: ${compactLeads}

Формат: {"results":[{"lead_id":123,"risk_score":30,"risk_level":"MEDIUM","priority":"LOW","action_needed":false,"reasoning":"краткое обоснование"}]}`;

        try {
            const response = await generateText({
                model: this.model,
                temperature: 0,
                system: `Ты - CRM аналитик. Анализируй лиды batch-режимом для экономии токенов.
                
Критерии:
- VIP (500K+): всегда HIGH priority
- Важные (100K+): MEDIUM priority
- Застрявшие (7+ дней): HIGH risk
- Без задач (3+ дней): MEDIUM risk

Будь краток в reasoning (1 строка).`,
                prompt
            });

            // Strip markdown code blocks if present
            let responseText = response.text.trim();
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (responseText.startsWith('```')) {
                responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            const result = JSON.parse(responseText);
            console.log(`✅ Batch analysis complete: ${result.results.length} results`);

            return result.results;

        } catch (error) {
            console.error('Batch analysis error:', error);
            // Fallback: возвращаем дефолтные результаты
            return leads.map(lead => ({
                lead_id: lead.id,
                risk_score: 0,
                risk_level: 'LOW',
                priority: 'LOW',
                action_needed: false,
                reasoning: 'Batch analysis failed'
            }));
        }
    }
}

export const ai = new AIService();
