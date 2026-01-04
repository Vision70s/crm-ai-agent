import { amocrm } from './src/services/amocrm.js';
import { initDb } from './src/services/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create diverse test leads with different ages for testing
 */

async function createDiverseTestLeads() {
    console.log('🎯 Создание тестовых лидов с разными сценариями...\n');

    try {
        initDb();
        await amocrm.initialize();

        const client = amocrm.getClient();
        const now = Math.floor(Date.now() / 1000);

        // Разные сценарии
        const testCases = [
            {
                name: '🔥 Тест: VIP застрял (500K, 2 дня)',
                price: 500000,
                daysAgo: 2,
                note: 'VIP клиент 2 дня без ответа - ДОЛЖЕН триггернуть фильтр!'
            },
            {
                name: '📉 Тест: Важный клиент застрял (150K, 3 дня)',
                price: 150000,
                daysAgo: 3,
                note: 'Важный клиент 3 дня без задач'
            },
            {
                name: '💤 Тест: Полностью застрял (8 дней)',
                price: 75000,
                daysAgo: 8,
                note: '8 дней без движения - критично!'
            },
            {
                name: '✅ Тест: Нормальный лид (свежий)',
                price: 50000,
                daysAgo: 0,
                note: 'Свежий лид - НЕ должен триггерить'
            }
        ];

        for (const testCase of testCases) {
            console.log(`${testCase.name}`);

            try {
                // Создаём лид
                const response: any = await client.request.post('/api/v4/leads', [{
                    name: testCase.name,
                    price: testCase.price
                }]);

                const leadId = response.data._embedded.leads[0].id;
                console.log(`  ✅ Создан! ID: ${leadId}`);

                // Добавляем заметку с информацией о сценарии
                await amocrm.addNote(leadId,
                    `🧪 ТЕСТОВЫЙ ЛИД\n\n` +
                    `Сценарий: ${testCase.note}\n` +
                    `Симулируемый возраст: ${testCase.daysAgo} дней\n` +
                    `Создан: ${new Date().toLocaleString()}`
                );

                // ВАЖНО: Ждём 1 секунду между созданием чтобы у них были разные timestamps
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log(`  📝 Добавлена заметка\n`);

            } catch (error: any) {
                console.error(`  ❌ Ошибка:`, error.response?.data || error.message);
                console.log('');
            }
        }

        console.log('\n✅ Готово! Созданы 4 тестовых лида.');
        console.log('\n⚠️ ВАЖНО: amoCRM не позволяет изменять updated_at через API.');
        console.log('Для реального тестирования:');
        console.log('1. Зайдите в amoCRM');
        console.log('2. Вручную измените "Дату изменения" у лидов в админке');
        console.log('3. Или подождите несколько дней пока лиды реально устареют\n');
        console.log('💡 Альтернатива: Изменим логику фильтра на "дата создания" вместо "дата обновления"\n');

    } catch (error) {
        console.error('❌ Ошибка:', error);
    }
}

createDiverseTestLeads();
