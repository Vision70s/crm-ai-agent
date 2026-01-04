import { getDb } from './database.js';
import { amocrm } from './amocrm.js';

const db = getDb();

export class ActionExecutor {
    /**
     * Execute an approved action from pending_actions table
     */
    public async execute(actionId: number) {
        const action: any = db.prepare('SELECT * FROM pending_actions WHERE id = ?')
            .get(actionId);

        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        if (action.status !== 'pending') {
            throw new Error(`Action ${actionId} has already been ${action.status}`);
        }

        const params = action.action_data ? JSON.parse(action.action_data) : {};

        try {
            switch (action.action_type) {
                case 'create_task':
                    await amocrm.createTask(action.lead_id, params);
                    await amocrm.addNote(action.lead_id,
                        `🤖 AI Agent создал задачу: ${params.text}\n\nОбоснование: ${action.reasoning}`
                    );
                    break;

                case 'update_status':
                    await amocrm.updateLead(action.lead_id, {
                        status_id: params.new_status_id
                    });
                    await amocrm.addNote(action.lead_id,
                        `🤖 AI Agent обновил статус сделки\n\nОбоснование: ${action.reasoning}`
                    );
                    break;

                case 'add_note':
                    await amocrm.addNote(action.lead_id, params.text);
                    break;

                case 'wait':
                    // Просто логируем что решили подождать
                    await amocrm.addNote(action.lead_id,
                        `🤖 AI Agent: действие не требуется\n\n${action.reasoning}`
                    );
                    break;

                default:
                    throw new Error(`Unknown action type: ${action.action_type}`);
            }

            // Обновляем статус действия
            db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?')
                .run('executed', actionId);

            console.log(`✅ Action ${actionId} executed successfully`);
            return { success: true };

        } catch (error) {
            console.error(`❌ Failed to execute action ${actionId}:`, error);

            // Помечаем как failed
            db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?')
                .run('failed', actionId);

            throw error;
        }
    }

    /**
     * Mark action as rejected
     */
    public async reject(actionId: number) {
        db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?')
            .run('rejected', actionId);
    }

    /**
     * Log manager decision for learning
     */
    public async logDecision(
        actionId: number,
        decision: 'approved' | 'rejected' | 'modified',
        modifiedData?: any
    ) {
        db.prepare(`
            INSERT INTO decisions_log (pending_action_id, decision, modified_data)
            VALUES (?, ?, ?)
        `).run(
            actionId,
            decision,
            modifiedData ? JSON.stringify(modifiedData) : null
        );
    }
}

export const actionExecutor = new ActionExecutor();
