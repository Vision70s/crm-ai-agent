import { StateGraph, END, START } from "@langchain/langgraph";
import { amocrm } from './amocrm.js';
import { ai } from './ai.js';
import { telegram, bot } from './telegram.js';

/**
 * State для workflow обработки критичного лида
 */
interface CriticalLeadState {
    leadId: number;
    leadName: string;
    riskScore: number;
    riskLevel: string;
    hasTasks: boolean;
    taskCreated: boolean;
    managerNotified: boolean;
    attempts: number;
    actionNeeded: boolean;
}

/**
 * LangGraph workflow для автоматической обработки критичных лидов
 * 
 * Flow:
 * 1. Анализ риска
 * 2. Проверка задач
 * 3. Создание задачи (если нужно)
 * 4. Уведомление менеджера
 * 5. Retry loop (если критично)
 */
export class LeadWorkflowGraph {
    private graph: StateGraph<CriticalLeadState>;

    constructor() {
        this.graph = new StateGraph<CriticalLeadState>({
            channels: {
                leadId: null,
                leadName: null,
                riskScore: 0,
                riskLevel: 'LOW',
                hasTasks: false,
                taskCreated: false,
                managerNotified: false,
                attempts: 0,
                actionNeeded: false
            }
        });

        this.buildGraph();
    }

    /**
     * Построение графа workflow
     */
    private buildGraph() {
        // Nodes
        this.graph.addNode("analyzeRisk", this.analyzeRisk.bind(this));
        this.graph.addNode("checkTasks", this.checkTasks.bind(this));
        this.graph.addNode("createTask", this.createTask.bind(this));
        this.graph.addNode("notifyManager", this.notifyManager.bind(this));
        this.graph.addNode("waitAndRetry", this.waitAndRetry.bind(this));

        // Entry point
        this.graph.addEdge(START, "analyzeRisk");

        // analyzeRisk → checkTasks (всегда)
        this.graph.addEdge("analyzeRisk", "checkTasks");

        // checkTasks → условие: есть задачи?
        this.graph.addConditionalEdges(
            "checkTasks",
            (state) => state.hasTasks ? 'notify' : 'create',
            {
                'notify': "notifyManager",
                'create': "createTask"
            }
        );

        // createTask → notifyManager
        this.graph.addEdge("createTask", "notifyManager");

        // notifyManager → условие: критичность
        this.graph.addConditionalEdges(
            "notifyManager",
            (state) => {
                // Если критично и < 3 попыток → retry
                if (state.riskScore > 70 && state.attempts < 3) {
                    return 'retry';
                }
                return 'end';
            },
            {
                'retry': "waitAndRetry",
                'end': END
            }
        );

        // waitAndRetry → analyzeRisk (loop!)
        this.graph.addEdge("waitAndRetry", "analyzeRisk");
    }

    /**
     * Node: Анализ риска лида
     */
    private async analyzeRisk(state: CriticalLeadState): Promise<Partial<CriticalLeadState>> {
        console.log(`🔍 [Workflow] Analyzing lead ${state.leadId}...`);

        const lead = await amocrm.getLeadDetails(state.leadId);

        // Простой расчет риска
        const now = Math.floor(Date.now() / 1000);
        const daysSinceUpdate = (now - lead.updated_at) / 86400;

        let riskScore = 0;
        if (daysSinceUpdate > 7) riskScore = 80;
        else if (daysSinceUpdate > 3) riskScore = 50;
        else riskScore = 20;

        const riskLevel = riskScore > 70 ? 'CRITICAL' : riskScore > 40 ? 'HIGH' : 'MEDIUM';

        console.log(`   Risk: ${riskLevel} (${riskScore}%)`);

        return {
            leadName: lead.name,
            riskScore,
            riskLevel,
            actionNeeded: riskScore > 40
        };
    }

    /**
     * Node: Проверка наличия задач
     */
    private async checkTasks(state: CriticalLeadState): Promise<Partial<CriticalLeadState>> {
        console.log(`📋 [Workflow] Checking tasks for lead ${state.leadId}...`);

        const tasks = await amocrm.getLeadTasks(state.leadId);
        const activeTasks = tasks.filter((t: any) => !t.is_completed);

        console.log(`   Active tasks: ${activeTasks.length}`);

        return {
            hasTasks: activeTasks.length > 0
        };
    }

    /**
     * Node: Создание задачи
     */
    private async createTask(state: CriticalLeadState): Promise<Partial<CriticalLeadState>> {
        console.log(`✏️ [Workflow] Creating task for lead ${state.leadId}...`);

        try {
            const deadline = Math.floor(Date.now() / 1000) + 86400; // завтра
            await amocrm.createTask(state.leadId, {
                text: 'Связаться с клиентом (создано автоматически)',
                complete_till: deadline,
                task_type_id: 1
            });

            console.log(`   ✅ Task created`);

            return {
                taskCreated: true
            };
        } catch (error) {
            console.error('   ❌ Failed to create task:', error);
            return {
                taskCreated: false
            };
        }
    }

    /**
     * Node: Уведомление менеджера
     */
    private async notifyManager(state: CriticalLeadState): Promise<Partial<CriticalLeadState>> {
        console.log(`📱 [Workflow] Notifying manager about lead ${state.leadId}...`);

        const managerId = process.env.MANAGER_TG_ID;
        if (!managerId) {
            console.log('   ⚠️ MANAGER_TG_ID not set');
            return { managerNotified: false };
        }

        const emoji = state.riskLevel === 'CRITICAL' ? '🔴' : '🟠';
        const message = `${emoji} **Автообработка лида**

**${state.leadName}** (#${state.leadId})

📊 **Статус:**
• Риск: ${state.riskLevel} (${state.riskScore}%)
• Задачи: ${state.hasTasks ? '✅ Есть' : '❌ Нет'}${state.taskCreated ? '\n• ✅ Новая задача создана' : ''}

🔄 Попытка ${state.attempts + 1}/3`;

        try {
            await bot.api.sendMessage(managerId, message, { parse_mode: 'Markdown' });
            console.log(`   ✅ Manager notified`);

            return { managerNotified: true };
        } catch (error) {
            console.error('   ❌ Failed to notify:', error);
            return { managerNotified: false };
        }
    }

    /**
     * Node: Ожидание и повтор (для критичных лидов)
     */
    private async waitAndRetry(state: CriticalLeadState): Promise<Partial<CriticalLeadState>> {
        console.log(`⏰ [Workflow] Scheduling retry for lead ${state.leadId}...`);

        // В продакшене здесь был бы реальный wait (setTimeout или queue)
        // Для демо просто увеличиваем счётчик

        return {
            attempts: state.attempts + 1
        };
    }

    /**
     * Запуск workflow для лида
     */
    public async process(leadId: number): Promise<CriticalLeadState> {
        const app = this.graph.compile();

        console.log(`\n🚀 [Workflow] Starting for lead ${leadId}...\n`);

        const result = await app.invoke({
            leadId,
            leadName: '',
            riskScore: 0,
            riskLevel: 'LOW',
            hasTasks: false,
            taskCreated: false,
            managerNotified: false,
            attempts: 0,
            actionNeeded: false
        });

        console.log(`\n✅ [Workflow] Completed. Result:`, result);

        return result;
    }
}

export const leadWorkflow = new LeadWorkflowGraph();
