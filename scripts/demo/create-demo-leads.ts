import { amocrm } from './src/services/amocrm.js';
import { initDb } from './src/services/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create demo leads with different budgets for testing smart filter
 */

const demoLeads = [
    // VIP сегмент (500K+)
    {
        name: '💎 DEMO: Крупный проект (1M)',
        price: 1000000
    },
    {
        name: '💎 DEMO: Разработка enterprise системы (800K)',
        price: 800000
    },
    {
        name: '💎 DEMO: Редизайн корпоративного сайта (600K)',
        price: 600000
    },

    // Важный сегмент (100-500K)
    {
        name: '⭐ DEMO: Мобильное приложение (300K)',
        price: 300000
    },
    {
        name: '⭐ DEMO: CRM интеграция (200K)',
        price: 200000
    },
    {
        name: '⭐ DEMO: Лендинг + реклама (150K)',
        price: 150000
    },

    // Средний сегмент (50-100K)
    {
        name: '🔔 DEMO: Корпоративный сайт (80K)',
        price: 80000
    },
    {
        name: '🔔 DEMO: Интернет-магазин (70K)',
        price: 70000
    },

    // Мелкий сегмент (< 50K) - НЕ должен триггерить
    {
        name: '⚪ DEMO: Визитка (30K)',
        price: 30000
    },
    {
        name: '⚪ DEMO: Консультация (15K)',
        price: 15000
    }
];

async function createDemoLeads() {
    console.log('🎯 Создание DEMO лидов для тестирования фильтра...\n');

    try {
        initDb();
        await amocrm.initialize();

        const client = amocrm.getClient();

        console.log(`Создаю ${demoLeads.length} тестовых лидов:\n`);

        for (let i = 0; i < demoLeads.length; i++) {
            const lead = demoLeads[i];

            console.log(`${i + 1}. ${lead.name} (${lead.price.toLocaleString()}₽)`);

            try {
                const response: any = await client.request.post('/api/v4/leads', [lead]);
                const createdLead = response.data._embedded.leads[0];

                console.log(`   ✅ Создан! ID: ${createdLead.id}\n`);

                // Добавляем заметку
                await amocrm.addNote(createdLead.id,
                    `🧪 DEMO лид для тестирования smart filter\n\n` +
                    `Бюджет: ${lead.price.toLocaleString()}₽\n` +
                    `Создан: ${new Date().toLocaleString()}\n\n` +
                    `Ожидаемое поведение:\n` +
                    `${lead.price >= 500000 ? '💎 VIP - должен ВСЕГДА триггерить' :
                        lead.price >= 100000 ? '⭐ Важный - должен триггерить' :
                            lead.price >= 50000 ? '🔔 Средний - триггерит если нет задач' :
                                '⚪ Мелкий - НЕ должен триггерить'}`
                );

                // Небольшая пауза чтобы не перегрузить API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error: any) {
                console.error(`   ❌ Ошибка:`, error.response?.data || error.message);
                console.log('');
            }
        }

        console.log('\n✅ Готово! Создано 10 DEMO лидов.');
        console.log('\n📊 Ожидаемый результат при запуске бота:');
        console.log('   🟢 Должны пройти фильтр:');
        console.log('      • 3 VIP лида (500K+)');
        console.log('      • 3 важных лида (100-500K)');
        console.log('      • 2 средних лида если нет задач (50-100K)');
        console.log('   🔴 НЕ должны пройти:');
        console.log('      • 2 мелких лида (< 50K)');
        console.log('\n🚀 Теперь запустите: npm run dev\n');

    } catch (error) {
        console.error('❌ Ошибка:', error);
    }
}

createDemoLeads();
