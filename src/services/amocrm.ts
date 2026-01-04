import { Client } from 'amocrm-js';
import { getDb } from './database.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export class AmoCRMService {
    private client: Client;
    private db = getDb();

    constructor() {
        this.client = new Client({
            domain: process.env.AMOCRM_SUBDOMAIN!,
            auth: {
                client_id: process.env.AMOCRM_CLIENT_ID!,
                client_secret: process.env.AMOCRM_CLIENT_SECRET!,
                redirect_uri: process.env.AMOCRM_REDIRECT_URI!,
            },
        });

        // Handle token rotation and persistence
        this.client.token.on('change', () => {
            const token = this.client.token.getValue();
            if (token) {
                console.log('AmoCRM Token changed, saving to DB...');
                this.saveToken(token);
            }
        });
    }

    private saveToken(token: any) {
        this.db.prepare(`
      INSERT OR REPLACE INTO tokens (id, access_token, refresh_token, expires_at, subdomain)
      VALUES (1, ?, ?, ?, ?)
    `).run(token.access_token, token.refresh_token, token.expires_at, process.env.AMOCRM_SUBDOMAIN);
    }

    public async initialize() {
        const savedToken = this.db.prepare('SELECT * FROM tokens WHERE id = 1').get() as any;

        if (savedToken) {
            console.log('Loading existing AmoCRM token from DB');
            this.client.token.setValue(savedToken);
        } else {
            console.log('No token found in DB. Please authorize the application.');
        }
    }

    public async getNewLeads() {
        const response: any = await this.client.leads.get({
            with: ['custom_fields_values', 'contacts']
        } as any);

        // amocrm-js returns: {data: [leads array], links, page}
        const leads = response.data || [];
        console.log(`✓ Fetched ${leads.length} leads from amoCRM`);
        return leads;
    }

    public async getLeadNotes(leadId: number) {
        const response: any = await this.client.request.get(`/api/v4/leads/${leadId}/notes`);
        return response.data?._embedded?.notes || [];
    }

    public async addNote(leadId: number, text: string) {
        await this.client.request.post(`/api/v4/leads/${leadId}/notes`, [
            {
                note_type: 'common',
                params: {
                    text: text
                }
            }
        ]);
    }

    // Tasks API
    public async createTask(leadId: number, task: {
        text: string;
        complete_till: number;
        task_type_id?: number;
    }) {
        const response = await this.client.request.post('/api/v4/tasks', [
            {
                entity_id: leadId,
                entity_type: 'leads',
                text: task.text,
                complete_till: task.complete_till,
                task_type_id: task.task_type_id || 1
            }
        ]);
        return response.data;
    }

    public async getLeadTasks(leadId: number) {
        const response: any = await this.client.request.get('/api/v4/tasks', {
            params: {
                filter: {
                    entity_id: leadId,
                    entity_type: 'leads'
                }
            }
        });
        return response.data?._embedded?.tasks || [];
    }

    // Lead updates
    public async updateLead(leadId: number, data: {
        status_id?: number;
        pipeline_id?: number;
        responsible_user_id?: number;
    }) {
        const response = await this.client.request.patch(`/api/v4/leads/${leadId}`, data);
        return response.data;
    }

    // Custom fields
    public async getLeadCustomFields(leadId: number) {
        const response: any = await this.client.request.get(`/api/v4/leads/${leadId}`, {
            params: {
                with: 'custom_fields_values'
            }
        });
        return response.data?.custom_fields_values || [];
    }

    // Comprehensive lead details
    public async getLeadDetails(leadId: number) {
        const response: any = await this.client.request.get(`/api/v4/leads/${leadId}`, {
            params: {
                with: 'contacts,custom_fields_values'
            }
        });

        const lead = response.data;
        const tasks = await this.getLeadTasks(leadId);
        const notes = await this.getLeadNotes(leadId);

        return {
            id: lead.id,
            name: lead.name,
            price: lead.price || 0,
            status_id: lead.status_id,
            pipeline_id: lead.pipeline_id,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
            responsible_user_id: lead.responsible_user_id,
            custom_fields: lead.custom_fields_values || [],
            tasks: tasks,
            notes: notes,
            contacts: lead._embedded?.contacts || []
        };
    }


    /**
     * Get leads by risk level (days since last update)
     */
    public async getLeadsByRiskLevel(minDaysSinceUpdate: number = 7) {
        const leads = await this.getNewLeads();
        const now = Math.floor(Date.now() / 1000);

        return leads.filter((lead: any) => {
            const daysSince = (now - (lead.updated_at || now)) / 86400;
            return daysSince >= minDaysSinceUpdate;
        });
    }

    /**
     * Get VIP leads (500K+ budget)
     */
    public async getVIPLeads() {
        const leads = await this.getNewLeads();
        return leads.filter((lead: any) => (lead.price || 0) >= 500000);
    }

    /**
     * Get important leads (100K+ budget)
     */
    public async getImportantLeads() {
        const leads = await this.getNewLeads();
        return leads.filter((lead: any) => {
            const price = lead.price || 0;
            return price >= 100000 && price < 500000;
        });
    }

    /**
     * Search leads by text query (name, ID, etc)
     */
    public async searchLeads(query: string) {
        const leads = await this.getNewLeads();
        const lowerQuery = query.toLowerCase();

        return leads.filter((lead: any) => {
            // Search in name
            if (lead.name?.toLowerCase().includes(lowerQuery)) return true;

            // Search by exact ID
            if (lead.id?.toString() === query) return true;

            return false;
        }).slice(0, 10); // Limit to 10 results
    }

    /**
     * Get all pipelines with statuses
     */
    public async getPipelines() {
        const response: any = await this.client.request.get('/api/v4/leads/pipelines');
        return response.data?._embedded?.pipelines || [];
    }

    /**
     * Search status by name
     */
    public async findStatusByName(statusName: string) {
        const pipelines = await this.getPipelines();
        const lowerQuery = statusName.toLowerCase();

        for (const pipeline of pipelines) {
            const statuses = pipeline._embedded?.statuses || [];
            for (const status of statuses) {
                if (status.name?.toLowerCase().includes(lowerQuery)) {
                    return {
                        id: status.id,
                        name: status.name,
                        pipeline_id: pipeline.id,
                        pipeline_name: pipeline.name
                    };
                }
            }
        }
        return null;
    }

    /**
     * Get tasks sorted by deadline
     */
    public async getTasksByDeadline(limit?: number) {
        const response: any = await this.client.request.get('/api/v4/tasks', {
            params: {
                filter: {
                    is_completed: false
                },
                order: {
                    complete_till: 'asc'
                },
                limit: limit || 50
            }
        });
        return response.data?._embedded?.tasks || [];
    }

    /**
     * Get overdue tasks
     */
    public async getOverdueTasks() {
        const now = Math.floor(Date.now() / 1000);
        const response: any = await this.client.request.get('/api/v4/tasks', {
            params: {
                filter: {
                    is_completed: false
                }
            }
        });
        const tasks = response.data?._embedded?.tasks || [];
        return tasks.filter((task: any) => task.complete_till < now);
    }

    /**
     * Get tasks for today (by deadline OR created today)
     */
    public async getTasksForToday() {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const response: any = await this.client.request.get('/api/v4/tasks', {
            params: {
                filter: {
                    is_completed: false
                }
            }
        });

        const tasks = response.data?._embedded?.tasks || [];

        // Show tasks with deadline today OR created today
        return tasks.filter((task: any) => {
            const deadline = task.complete_till * 1000;
            const createdAt = task.created_at * 1000;

            const deadlineToday = deadline >= startOfDay.getTime() && deadline <= endOfDay.getTime();
            const createdToday = createdAt >= startOfDay.getTime() && createdAt <= endOfDay.getTime();

            return deadlineToday || createdToday;
        });
    }

}

export const amocrm = new AmoCRMService();

