import dotenv from 'dotenv';
import { initDb, getDb } from './services/database.js';
import { amocrm } from './services/amocrm.js';
import { ai } from './services/ai.js';
import { telegram } from './services/telegram.js';
import { scheduler } from './services/scheduler.js';

dotenv.config();

const db = getDb();

// ⚡ Smart filter - only analyze leads that NEED attention
function quickFilter(lead: any): boolean {
    const now = Date.now() / 1000;
    const daysSinceUpdate = (now - (lead.updated_at || now)) / 86400;
    const budget = lead.price || 0;

    // Get active tasks count (if available in lead data)
    const hasActiveTasks = lead._embedded?.tasks?.some((t: any) => !t.is_completed) || false;

    console.log(`  Checking ${lead.name}: ${daysSinceUpdate.toFixed(1)}d old, ${budget}₽, tasks: ${hasActiveTasks}`);

    // 🚨 CRITICAL cases that need immediate attention

    // 1. No active tasks and stale
    if (daysSinceUpdate > 3 && !hasActiveTasks) {
        console.log(`    ⚠️ ALERT: No tasks for 3+ days`);
        return true;
    }

    // 2. Completely stuck
    if (daysSinceUpdate > 7) {
        console.log(`    ⚠️ ALERT: Stuck for 7+ days`);
        return true;
    }

    // 3. VIP client - ALWAYS needs attention (demo mode)
    if (budget >= 500000) {
        console.log(`    🔥 VIP (${budget}₽) - всегда требует внимания`);
        return true;
    }

    // 4. Important client - ALWAYS needs attention (demo mode)
    if (budget >= 100000) {
        console.log(`    ⚡ Важный (${budget}₽) - требует внимания`);
        return true;
    }

    // 5. Medium budget - if no tasks
    if (budget >= 50000 && !hasActiveTasks) {
        console.log(`    🔔 Средний клиент без задач`);
        return true;
    }

    // Otherwise - all good, don't spam
    return false;
}

async function bootstrap() {
    console.log('--- CRM AI Agent Starting ---');
    console.log('🤖 Human-in-the-Loop Mode');

    // 1. Init DB
    initDb();

    // 2. Init Services
    await amocrm.initialize();
    telegram.setupHandlers();

    // 3. Start scheduler for proactive notifications
    scheduler.scheduleMorningDigest();
    scheduler.scheduleEveningReport();
    scheduler.scheduleWeeklyOverview();
    scheduler.start();

    console.log('Services initialized. Entering polling loop...');


    // 3. Polling Loop - optimized with change tracking
    const interval = parseInt(process.env.POLLING_INTERVAL_MS || '900000'); // 15 min default

    // Track last update time for each lead
    const lastChecked = new Map<number, number>();

    async function poll() {
        console.log(`[${new Date().toISOString()}] 🔍 Analyzing leads...`);

        try {
            const leads: any = await amocrm.getNewLeads();
            const leadsArray = Array.isArray(leads) ? leads : (leads?._embedded?.leads || []);
            console.log(`✓ Fetched ${leadsArray.length} total leads`);

            // ⚡ SMART FILTER: Only leads that need attention
            const needsAttention = leadsArray.filter(lead => quickFilter(lead));

            // 🆕 CHANGE DETECTION: Only analyze leads that were updated
            const changedLeads = needsAttention.filter(lead => {
                const lastUpdate = lastChecked.get(lead.id) || 0;
                const hasChanged = lead.updated_at > lastUpdate;

                if (hasChanged) {
                    lastChecked.set(lead.id, lead.updated_at);
                }

                return hasChanged;
            });

            console.log(`📊 ${needsAttention.length} leads need attention (${changedLeads.length} changed since last check)`);

            if (changedLeads.length === 0) {
                console.log(`✅ No changes detected. Skipping analysis.`);
                return;
            }

            // 🔥 CRITICAL LEADS: Use LangGraph workflow
            const criticalLeads = changedLeads.filter(lead => {
                const daysSince = (Date.now() / 1000 - (lead.updated_at || Date.now() / 1000)) / 86400;
                const isVIP = lead.price >= 500000;
                const isStuck = daysSince > 7;

                return isVIP || isStuck;
            });

            // 📊 NORMAL LEADS: Use batch analysis
            const normalLeads = changedLeads.filter(lead => !criticalLeads.includes(lead));

            console.log(`   🔴 ${criticalLeads.length} critical (will use LangGraph workflow)`);
            console.log(`   🟢 ${normalLeads.length} normal (will use batch analysis)`);

            // Process critical leads with LangGraph
            if (criticalLeads.length > 0) {
                const { leadWorkflow } = await import('./services/lead-workflow.js');

                for (const lead of criticalLeads) {
                    try {
                        console.log(`\n🔴 [LangGraph] Processing critical lead: ${lead.name}`);
                        await leadWorkflow.process(lead.id);
                    } catch (error) {
                        console.error(`   ❌ Workflow error for lead ${lead.id}:`, error.message);
                    }
                }
            }

            // Process normal leads with batch analysis
            if (normalLeads.length > 0) {
                const BATCH_SIZE = 10;

                for (let i = 0; i < normalLeads.length; i += BATCH_SIZE) {
                    const batch = normalLeads.slice(i, i + BATCH_SIZE);
                    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                    console.log(`\n🔄 Batch ${batchNum}: Analyzing ${batch.length} normal leads...`);

                    try {
                        const results = await ai.analyzeBatch(batch);

                        for (let j = 0; j < batch.length; j++) {
                            const lead = batch[j];
                            const result = results[j];

                            if (!result || typeof result !== 'object') {
                                console.log(`  ⚠️ ${lead.name}: Invalid result`);
                                continue;
                            }

                            console.log(`  📊 ${lead.name}:`);
                            console.log(`     Risk: ${result.risk_level} (${result.risk_score}%), Priority: ${result.priority}`);
                            console.log(`     ${result.action_needed ? '⚡ ACTION' : '✅ OK'}: ${result.reasoning}`);

                            // Save score to history
                            db.prepare(`
                                INSERT INTO lead_scores (lead_id, score, risk_level, priority, calculated_at)
                                VALUES (?, ?, ?, ?, ?)
                            `).run(
                                lead.id,
                                result.risk_score,
                                result.risk_level,
                                result.priority,
                                Math.floor(Date.now() / 1000)
                            );

                            // Create pending action if needed
                            if (result.action_needed && result.recommended_action) {
                                const pendingActionId = db.prepare(`
                                    INSERT INTO pending_actions 
                                    (lead_id, action_type, action_data, risk_score, priority, reasoning, status)
                                    VALUES (?, ?, ?, ?, ?, ?, 'pending')
                                `).run(
                                    lead.id,
                                    result.recommended_action,
                                    JSON.stringify({ lead_name: lead.name }),
                                    result.risk_score,
                                    result.priority,
                                    result.reasoning
                                ).lastInsertRowid;

                                // Send to Telegram
                                await telegram.sendActionProposal(Number(pendingActionId), lead, { text: result.reasoning });
                                console.log(`     📱 Sent to Telegram (action #${pendingActionId})`);
                            }
                        }
                    } catch (batchError) {
                        console.error(`❌ Batch ${batchNum} error:`, batchError);
                    }
                }
            }

            console.log(`\n✅ Analysis complete. Next poll in ${interval / 60000} minutes.\n`);

        } catch (error) {
            console.error('❌ Poll error:', error);
        }
    }

    // Start polling on schedule (NOT immediately on startup)
    console.log(`⏰ Analysis scheduled every ${interval / 60000} minutes`);
    // poll(); // Disabled: don't analyze on startup
    setInterval(poll, interval);
}


bootstrap().catch(console.error);
