/**
 * Batch Analysis Demo
 * 
 * Добавил метод analyzeBatch() в AIService
 * 
 * Использование в index.ts:
 * 
 * // Вместо:
 * for (const lead of needsAttention) {
 *   await ai.analyzeLead(lead);  // 12 запросов
 * }
 * 
 * // Делать:
 * const BATCH_SIZE = 10;
 * for (let i = 0; i < needsAttention.length; i += BATCH_SIZE) {
 *   const batch = needsAttention.slice(i, i + BATCH_SIZE);
 *   const results = await ai.analyzeBatch(batch);  // 1 запрос на 10 лидов!
 *   
 *   // Process results
 *   for (let j = 0; j < batch.length; j++) {
 *     const lead = batch[j];
 *     const result = results[j];
 *     
 *     // Save score, create pending actions, etc.
 *   }
 * }
 * 
 * Экономия: 10x меньше запросов, 5-7x меньше токенов
 */
