# LangGraph Integration - Документация

## Что добавлено

### 📦 Новые зависимости
```bash
@langchain/langgraph  # Граф состояний для агентов
@langchain/core       # Базовые компоненты LangChain
langchain             # Основной фреймворк
```

### 🎯 Файл: `lead-workflow.ts`

Создан **StateGraph для обработки критичных лидов** с автоматическими действиями.

## Граф Workflow

```
START
  ↓
analyzeRisk (анализ риска)
  ↓
checkTasks (проверка задач)
  ↓
  ├─→ hasTasks? YES → notifyManager
  └─→ hasTasks? NO  → createTask → notifyManager
                          ↓
                    riskScore > 70 && attempts < 3?
                          ↓
                    ├─→ YES → waitAndRetry → analyzeRisk (LOOP!)
                    └─→ NO  → END
```

## Использование

### Базовый пример

```typescript
import { leadWorkflow } from './services/lead-workflow.js';

// Запустить workflow для лида
const result = await leadWorkflow.process(58482961);

console.log(result);
// {
//   leadId: 58482961,
//   leadName: "Сделка #58482961",
//   riskScore: 80,
//   riskLevel: "CRITICAL",
//   hasTasks: false,
//   taskCreated: true,
//   managerNotified: true,
//   attempts: 0,
//   actionNeeded: true
// }
```

### Интеграция в основной код

**Вариант 1: Заменить batch analysis**

В `src/index.ts`, строка ~104:

```typescript
// СТАРЫЙ КОД
const results = await ai.analyzeBatch(batch);

// НОВЫЙ КОД с LangGraph
import { leadWorkflow } from './services/lead-workflow.js';

for (const lead of batch) {
    // Запустить workflow для каждого лида
    const result = await leadWorkflow.process(lead.id);
    
    console.log(`✅ Workflow completed for ${lead.name}:`, result);
}
```

**Вариант 2: Только для критичных лидов**

```typescript
const results = await ai.analyzeBatch(batch);

for (let i = 0; i < batch.length; i++) {
    const lead = batch[i];
    const result = results[i];
    
    // Если риск высокий → запустить LangGraph workflow
    if (result.risk_score > 70) {
        console.log(`🔴 High risk detected! Starting workflow...`);
        await leadWorkflow.process(lead.id);
    } else {
        // Обычная обработка
        if (result.action_needed) {
            await telegram.sendActionProposal(...);
        }
    }
}
```

### Добавить команду в Telegram

В `telegram.ts`:

```typescript
bot.command('workflow', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const leadId = parseInt(args[1]);
    
    if (!leadId) {
        await ctx.reply('Использование: /workflow [lead_id]');
        return;
    }
    
    await ctx.reply(`🚀 Запускаю workflow для лида #${leadId}...`);
    
    try {
        const result = await leadWorkflow.process(leadId);
        
        await ctx.reply(`✅ Workflow завершён!
        
Риск: ${result.riskLevel} (${result.riskScore}%)
Задачи: ${result.hasTasks ? 'Есть' : 'Нет'}
${result.taskCreated ? '📝 Задача создана' : ''}
${result.managerNotified ? '📱 Уведомление отправлено' : ''}`);
    } catch (error) {
        await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
});
```

## Возможности расширения

### 1. Добавить новые nodes

```typescript
// В lead-workflow.ts

this.graph.addNode("escalateToManager", this.escalate.bind(this));

private async escalate(state: CriticalLeadState): Promise<Partial<CriticalLeadState>> {
    // Эскалация руководству
    await telegram.notifyBoss(state.leadId);
    return { escalated: true };
}

// Добавить в граф
this.graph.addConditionalEdges(
    "waitAndRetry",
    (state) => state.attempts >= 3 ? 'escalate' : 'retry',
    {
        'escalate': "escalateToManager",
        'retry': "analyzeRisk"
    }
);
```

### 2. Conversation workflow

```typescript
interface ConversationState {
    messages: Array<{ role: string; content: string }>;
    userId: string;
    context: any;
    needsClarification: boolean;
}

const chatGraph = new StateGraph<ConversationState>({...});

chatGraph
    .addNode("understand", async (state) => {
        const intent = await ai.classify(state.messages);
        return { intent };
    })
    .addNode("askClarification", async (state) => {
        await telegram.send("Уточни, пожалуйста...");
        return { needsClarification: true };
    })
    .addConditionalEdges("understand",
        (state) => state.needsClarification,
        {
            true: "askClarification",
            false: "respond"
        }
    );
```

### 3. Multi-agent система

```typescript
// Агент-анализатор
const analyzerAgent = new StateGraph({...});

// Агент-исполнитель
const executorAgent = new StateGraph({...});

// Супервизор
const supervisor = new StateGraph({...});

supervisor.addConditionalEdges("route",
    (state) => state.taskType,
    {
        'analyze': analyzerAgent,
        'execute': executorAgent
    }
);
```

## Преимущества над текущим подходом

### Сейчас (без LangGraph)
```typescript
const analysis = await ai.analyzeLead(lead);
if (analysis.actionNeeded) {
    await telegram.sendNotification(lead);
}
// Всё. Линейно. Без retry, без циклов.
```

### С LangGraph
```typescript
await leadWorkflow.process(lead.id);
// Автоматически:
// 1. Анализ
// 2. Проверка задач
// 3. Создание задачи (если нужно)
// 4. Уведомление
// 5. Retry если критично
// 6. Loop до 3 попыток
```

## Тестирование

```bash
# В отдельном файле test-workflow.ts
import { leadWorkflow } from './src/services/lead-workflow.js';

async function test() {
    const result = await leadWorkflow.process(58482961);
    console.log('Result:', result);
}

test();
```

```bash
npx tsx test-workflow.ts
```

## Визуализация графа

LangGraph может визуализировать workflow:

```typescript
import { leadWorkflow } from './services/lead-workflow.js';

const app = leadWorkflow['graph'].compile();
const mermaid = app.getMermaidGraph();

console.log(mermaid);
// Можно вставить в Mermaid Live Editor
```

## Next Steps

1. ✅ Установить зависимости
2. ✅ Создать базовый workflow
3. ⏳ Интегрировать в main loop
4. ⏳ Добавить команду `/workflow` в Telegram
5. ⏳ Расширить граф (эскалация, персистентность)
6. ⏳ Добавить conversation workflow для чата

## Ссылки

- [LangGraph Docs](https://langchain-ai.github.io/langgraphjs/)
- [Примеры](https://github.com/langchain-ai/langgraphjs/tree/main/examples)
