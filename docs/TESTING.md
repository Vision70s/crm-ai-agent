# 🧪 Testing Guide - CRM AI Agent

Complete guide for testing the CRM AI Agent with or without real leads.

## Quick Start

### 1. Create Test Leads

Choose one method:

**Option A: HTML Form** (Easiest)
1. Open `scripts/test/test-form.html` in browser
2. Fill in test data (name, email, phone)
3. Submit → Lead appears in amoCRM automatically ✅

**Option B: Automated Script** (Recommended)
```bash
npm run demo:create-leads
```

Creates 4 diverse test leads:
- 🔥 Hot lead - fresh, high price (150K₽)
- ❄️ Cold lead - low price (50K₽)
- ⚠️ Medium lead - average (100K₽)
- 💼 VIP client - very high price (500K₽)

**Option C: Manual in amoCRM**
1. Open amoCRM → Create "Deal" or "Lead"
2. Fill in name, budget (100,000₽), contact info
3. Save

### 2. Run the Bot

```bash
npm run dev
```

Expected output:
```
✅ Telegram bot started
✅ Morning digest scheduled (9:00 AM)
✅ Evening report scheduled (6:00 PM)
⏰ Analysis scheduled every 15 minutes
```

### 3. Test Telegram Commands

Send to your bot:

**Basic Commands**
- `/start` - Check bot is alive
- `/stats` - Agent statistics
- `/today` - Daily dashboard (tasks + critical leads)
- `/hot` - VIP and important clients (100K+)
- `/risk` - Stuck leads (7+ days without movement)
- `/week` - Weekly overview

**Natural Language**
You can also use plain text:
- "show hot leads" → Bot suggests `/hot`
- "what's today?" → Bot suggests `/today`
- "stuck deals" → Bot suggests `/risk`

---

## Test Scenarios

### Scenario 1: Fresh Lead
1. Create lead right now
2. Run bot
3. **Expected:** AI says no action needed (lead is fresh)

### Scenario 2: Old Lead
1. Create lead
2. In amoCRM, manually change update date (or wait a few days)
3. Run bot
4. **Expected:** AI suggests creating a task (lead is stuck)

### Scenario 3: Lead with Active Task
1. Create lead
2. Manually add task in amoCRM
3. Run bot
4. **Expected:** Risk level decreases (has active task)

### Scenario 4: VIP Lead
1. Create lead with high budget (500K+)
2. Run bot
3. **Expected:** Priority will be HIGH

---

## Fast Testing (1 minute)

Don't want to wait 15 minutes? Edit `.env`:

```env
POLLING_INTERVAL_MS=60000  # 1 minute instead of 15
```

Then:
1. Create test leads: `npm run demo:create-leads`
2. Start bot: `npm run dev`
3. Wait 1 minute → see analysis in console
4. Check Telegram → action cards appear!

⚠️ **After testing:** Restore `POLLING_INTERVAL_MS=900000` (15 min)

---

## Windows Utilities

Located in `scripts/windows/`:

```bash
# Start bot (clean restart)
.\scripts\windows\start-clean.bat

# Check running processes  
.\scripts\windows\check-processes.bat

# Kill all bot processes
.\scripts\windows\kill-bot.bat
```

---

## Success Indicators

### ✅ In Console
```
🔍 Analyzing leads...
Found 4 leads to analyze
📊 Analyzing: Test Lead (#123456)
  Risk: MEDIUM (45%), Priority: HIGH
  ⚡ Action needed: Create task "Call client"
  📱 Sent to Telegram (action #1)
✅ Analysis complete
```

### ✅ In Telegram
- Action cards received
- Buttons visible: ✅ Execute | ❌ Reject | 📋 Details | ⏰ Snooze
- After clicking ✅ → Message updates to "✅ Action completed"

### ✅ In amoCRM
- New task appears: "Call client" (or similar)
- Note added: "🤖 AI Agent created task..."

### ✅ In Database
```sql
SELECT * FROM pending_actions;  -- has records
SELECT * FROM decisions_log;    -- has decisions
SELECT * FROM lead_scores;      -- has scores
```

---

## Troubleshooting

### Problem: Leads not analyzed
**Solution:**
- Ensure leads were updated within last 24 hours
- Manually change "Modified" date in amoCRM

### Problem: No cards in Telegram
**Solution:**
- Ensure you sent `/start` to bot
- Check `MANAGER_TG_ID` in `.env` matches your Telegram ID
  - Get your ID: Send `/start` to @userinfobot
- Check console for "⚡ Action needed" messages

### Problem: AI always says "wait"
**Solution:**
- Leads are too fresh (just created)
- Wait or manually change date in amoCRM

### Problem: "Bad Request" error
**Solution:**
1. Run `.\scripts\windows\kill-bot.bat`
2. Send `/start` to bot
3. Run `.\scripts\windows\start-clean.bat`

---

## Automated Scheduled Reports

These arrive automatically in Telegram:

- **9:00 AM** - Morning digest (same as `/today`)
- **6:00 PM** - Evening report
- **Mon 10:00 AM** - Weekly overview

To test immediately, use commands manually!

---

## Final Checklist

- [ ] Created test leads (form OR script OR manual)
- [ ] Reduced `POLLING_INTERVAL_MS` to 60000 for testing
- [ ] Sent `/start` to bot in Telegram
- [ ] Started bot: `npm run dev`
- [ ] Waited for analysis (watching console)
- [ ] Received card in Telegram
- [ ] Clicked ✅ Execute
- [ ] Verified amoCRM - task created
- [ ] Checked notes - AI comment exists

**Everything works?** Congratulations! 🎉

**Not working?** Check troubleshooting section above.
