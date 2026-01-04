import { leadWorkflow } from './src/services/lead-workflow.js';

/**
 * Тестовый скрипт для LangGraph workflow
 */
async function testWorkflow() {
    console.log('🧪 Testing LangGraph workflow...\n');

    // Тестовый лид ID (замени на реальный)
    const testLeadId = 58482961;

    try {
        const result = await leadWorkflow.process(testLeadId);

        console.log('\n📊 Final Result:');
        console.log('================');
        console.log(`Lead: ${result.leadName} (#${result.leadId})`);
        console.log(`Risk: ${result.riskLevel} (${result.riskScore}%)`);
        console.log(`Has Tasks: ${result.hasTasks}`);
        console.log(`Task Created: ${result.taskCreated}`);
        console.log(`Manager Notified: ${result.managerNotified}`);
        console.log(`Attempts: ${result.attempts}`);
        console.log('================\n');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testWorkflow();
