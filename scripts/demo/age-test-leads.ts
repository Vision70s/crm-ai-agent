import { amocrm } from './src/services/amocrm.js';
import { initDb } from './src/services/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to age test leads for testing the smart filter
 */

async function ageTestLeads() {
    console.log('🕐 Состаривание тестовых лидов для тестирования фильтра...\n');

    try {
        initDb();
        await amocrm.initialize();

        const client = amocrm.getClient();

        // Получаем тестовые лиды
        const response: any = await client.leads.get();
        const leads = response.data || [];

        const testLeads = leads.filter((l: any) =>
            l.name.includes('Тест:') || l.name.includes('Сделка #')
        );

        console.log(`Найдено ${testLeads.length} тестовых лидов для обновления\n`);

        // Разные сценарии для тестирования
        const scenarios = [
            {
                pattern: 'Горячий',
                daysAgo: 2, // VIP лид ждёт 2 дня - должен попасть в фильтр
                description: 'VIP клиент ждёт 2 дня (должен триггернуть!)'
            },
            {
                pattern: 'Холодный',
                daysAgo: 5, // 5 дней без задач - должен попасть
                description: 'Холодный лид 5 дней без внимания'
            },
            {
                pattern: 'Средний',
                daysAgo: 3, // Важный клиент (100K) ждёт 3 дня - должен попасть
                description: 'Средний лид 3 дня без задач'
            },
            {
                pattern: 'Сделка #58482823', // VIP 500K
                daysAgo: 1, // VIP ждёт 1 день - должен попасть
                description: 'VIP сделка (500K) ждёт 1 день'
            }
        ];

        for (const scenario of scenarios) {
            const lead = testLeads.find((l: any) => l.name.includes(scenario.pattern));

            if (!lead) {
                console.log(`⚠️ Лид с паттерном "${scenario.pattern}" не найден\n`);
                continue;
            }

            console.log(`📝 Обновляю: ${lead.name} (ID: ${lead.id})`);
            console.log(`   Сценарий: ${scenario.description}`);

            // Вычисляем timestamp X дней назад
            const timestamp = Math.floor(Date.now() / 1000) - (scenario.daysAgo * 24 * 3600);

            try {
                // Обновляем лид с новым updated_at
                await client.request.patch(`/api/v4/leads/${lead.id}`, {
                    updated_at: timestamp
                });

                console.log(`   ✅ Обновлён! Теперь выглядит как ${scenario.daysAgo} дн. назад\n`);

            } catch (error: any) {
                console.error(`   ❌ Ошибка обновления:`, error.response?.data || error.message);
                console.log('');
            }
        }

        console.log('\n✅ Готово! Теперь запустите бота для тестирования:');
        console.log('   npm run dev');
        console.log('\n📊 Ожидаемый результат:');
        console.log('   - Минимум 3-4 лида должны пройти фильтр');
        console.log('   - VIP лиды (500K) даже с 1 днём ожидания');
        console.log('   - Важные лиды (100K+) с 2+ днями');
        console.log('   - Любые лиды с 3+ днями без задач');
        console.log('   - Застрявшие лиды (7+ дней)\n');

    } catch (error) {
        console.error('❌ Ошибка:', error);
    }
}

ageTestLeads();
