import { amocrm } from './src/services/amocrm.js';
import { initDb } from './src/services/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to create test leads in amoCRM for bot testing
 */

const testLeads = [
    {
        name: '🔥 Тест: Горячий лид (свежий)',
        price: 150000
    },
    {
        name: '❄️ Тест: Холодный лид (давно не выходил на связь)',
        price: 50000
    },
    {
        name: '⚠️ Тест: Средний лид (требует внимания)',
        price: 100000
    },
    {
        name: '💼 Тест: Крупный клиент (высокий приоритет)',
        price: 500000
    }
];

async function createTestLeads() {
    console.log('🚀 Создание тестовых лидов в amoCRM...\n');

    try {
        initDb();
        await amocrm.initialize();

        const client = amocrm.getClient();

        for (let i = 0; i < testLeads.length; i++) {
            const lead = testLeads[i];
            console.log(`${i + 1}. Создаём: ${lead.name}`);

            try {
                const response: any = await client.request.post('/api/v4/leads', [lead]);
                const createdLead = response.data._embedded.leads[0];

                console.log(`   ✅ Создан! ID: ${createdLead.id}`);

                // Добавляем начальную заметку
                await amocrm.addNote(createdLead.id,
                    `🧪 Тестовый лид для проверки AI агента\n\nСоздан автоматически скриптом для тестирования.`
                );

                console.log(`   📝 Добавлена заметка\n`);

            } catch (error: any) {
                console.error(`   ❌ Ошибка: ${error.message}\n`);
            }
        }

        console.log('\n✅ Готово! Тестовые лиды созданы.');
        console.log('\n📋 Что дальше:');
        console.log('1. Запустите бота: npm run dev');
        console.log('2. Дождитесь анализа (до 15 минут)');
        console.log('3. Проверьте Telegram - придут карточки с рекомендациями');
        console.log('\n💡 Совет: Для немедленного анализа - измените POLLING_INTERVAL_MS на 60000 (1 мин) в .env\n');

    } catch (error) {
        console.error('❌ Ошибка при создании лидов:', error);
    }
}

createTestLeads();
