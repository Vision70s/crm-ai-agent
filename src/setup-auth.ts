import axios from 'axios';
import path from 'path';
import { initDb, getDb } from './services/database.js';
import dotenv from 'dotenv';

import fs from 'fs';

dotenv.config();

let code = process.argv[2];

if (!code) {
    const codeFile = path.resolve(process.cwd(), 'auth_code.txt');
    if (fs.existsSync(codeFile)) {
        code = fs.readFileSync(codeFile, 'utf8').trim();
        console.log('📖 Код загружен из файла auth_code.txt');
    }
}

if (!code) {
    console.error('❌ Ошибка: Введите код авторизации!');
    console.log('Использование: npx tsx src/setup-auth.ts ВАШ_КОД');
    process.exit(1);
}

async function auth() {
    console.log('� Начинаем прямой обмен кода на токены...');

    initDb();
    const db = getDb();

    const data = {
        client_id: process.env.AMOCRM_CLIENT_ID,
        client_secret: process.env.AMOCRM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.AMOCRM_REDIRECT_URI,
    };

    try {
        const url = `https://${process.env.AMOCRM_SUBDOMAIN}.amocrm.ru/oauth2/access_token`;
        console.log(`� Отправляем запрос в amoCRM: ${url}`);

        const response = await axios.post(url, data, {
            headers: { 'Content-Type': 'application/json' }
        });

        const token = response.data;
        const expiresAt = Math.floor(Date.now() / 1000) + token.expires_in;

        db.prepare(`
            INSERT OR REPLACE INTO tokens (id, access_token, refresh_token, expires_at, subdomain)
            VALUES (1, ?, ?, ?, ?)
        `).run(token.access_token, token.refresh_token, expiresAt, process.env.AMOCRM_SUBDOMAIN);

        console.log('✅ УСПЕХ! Токены получены напрямую и сохранены в базу.');
        console.log('Теперь вы можете запустить бота: npm run dev');
        process.exit(0);
    } catch (error) {
        console.error('❌ ОШИБКА ОБМЕНА:');
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

auth();
