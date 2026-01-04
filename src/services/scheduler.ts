import cron from 'node-cron';
import { telegram } from './telegram.js';
import { getDb } from './database.js';

export class SchedulerService {
    private jobs: Map<string, cron.ScheduledTask> = new Map();
    private managerId: string | undefined;

    constructor() {
        this.managerId = process.env.MANAGER_TG_ID;
    }

    /**
     * Schedule morning digest at 9:00 AM
     */
    public scheduleMorningDigest() {
        if (!this.managerId) {
            console.log('⚠️ MANAGER_TG_ID not set, skipping morning digest');
            return;
        }

        const job = cron.schedule('0 9 * * *', async () => {
            console.log('📅 Sending morning digest...');
            try {
                await telegram.sendMorningDigest();
            } catch (error) {
                console.error('Error sending morning digest:', error);
            }
        }, {
            timezone: 'Europe/Moscow'
        });

        this.jobs.set('morning_digest', job);
        console.log('✅ Morning digest scheduled (9:00 AM)');
    }

    /**
     * Schedule evening report at 6:00 PM
     */
    public scheduleEveningReport() {
        if (!this.managerId) {
            console.log('⚠️ MANAGER_TG_ID not set, skipping evening report');
            return;
        }

        const job = cron.schedule('0 18 * * *', async () => {
            console.log('📅 Sending evening report...');
            try {
                await telegram.sendEveningReport();
            } catch (error) {
                console.error('Error sending evening report:', error);
            }
        }, {
            timezone: 'Europe/Moscow'
        });

        this.jobs.set('evening_report', job);
        console.log('✅ Evening report scheduled (6:00 PM)');
    }

    /**
     * Schedule weekly overview (Monday 10:00 AM)
     */
    public scheduleWeeklyOverview() {
        if (!this.managerId) {
            console.log('⚠️ MANAGER_TG_ID not set, skipping weekly overview');
            return;
        }

        const job = cron.schedule('0 10 * * 1', async () => {
            console.log('📅 Sending weekly overview...');
            try {
                if (this.managerId) {
                    await telegram.sendWeeklyOverview(this.managerId);
                }
            } catch (error) {
                console.error('Error sending weekly overview:', error);
            }
        }, {
            timezone: 'Europe/Moscow'
        });

        this.jobs.set('weekly_overview', job);
        console.log('✅ Weekly overview scheduled (Monday 10:00 AM)');
    }

    /**
     * Start all scheduled jobs
     */
    public start() {
        this.jobs.forEach((job, name) => {
            job.start();
            console.log(`▶️ Started job: ${name}`);
        });
    }

    /**
     * Stop all scheduled jobs
     */
    public stop() {
        this.jobs.forEach((job, name) => {
            job.stop();
            console.log(`⏸️ Stopped job: ${name}`);
        });
    }
}

export const scheduler = new SchedulerService();
