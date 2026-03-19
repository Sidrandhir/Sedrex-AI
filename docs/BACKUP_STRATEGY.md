# Supabase Backup & Data Recovery Strategy

## ⚠️ THE PROBLEM

Without backups, data loss means:
- Users lose all conversations
- No way to recover deleted data
- Business reputation damaged
- Potential legal liability

---

## ✅ THE SOLUTION: Automated Backups

---

## Option 1: Supabase Built-in Backups (Recommended)

### For Free Tier
- ❌ No automated backups
- ✅ You can manually export data

### For Paid Tier (Pro+)
- ✅ Automatic daily backups
- ✅ 30-day retention
- ✅ One-click restore
- ✅ Automatic encryption

### How to Enable

1. Go to Supabase Dashboard
2. Click **Settings** → **Backups**
3. Check if backups are enabled
4. For free tier: Upgrade to Pro ($25/month)

### Manual Backup (Free Tier)

#### Backup Database

In Supabase SQL Editor, run:
```sql
-- Export all tables as SQL dump
-- This creates a backup you can restore
pg_dump -Fc \
  --host mzkdocjzwihfywommnid.supabase.co \
  --username postgres \
  --password \
  --db postgres > backup_$(date +%Y%m%d).sql
```

#### Or Use Supabase CLI

```bash
# Install CLI
npm install -g @supabase/cli

# Login
supabase login

# Backup database
supabase db pull

# This creates a migrations folder with schema
```

---

## Option 2: Scheduled Backups with Vercel Cron

Automatically backup your database every day:

### Step 1: Create Backup Function

Create `api/backup.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Verify cron secret
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  // Verify this is a legitimate cron request
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Backup all conversations
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*');

    // Backup all messages
    const { data: messages } = await supabase
      .from('messages')
      .select('*');

    // Create timestamp
    const timestamp = new Date().toISOString();

    // Store backup (option A: in Supabase storage)
    const backupData = {
      timestamp,
      conversations,
      messages,
    };

    await supabase.storage
      .from('backups')
      .upload(`backup_${timestamp}.json`, JSON.stringify(backupData));

    return NextResponse.json({
      success: true,
      message: 'Backup completed',
      timestamp,
    });
  } catch (error) {
    console.error('Backup failed:', error);
    return NextResponse.json(
      { error: 'Backup failed' },
      { status: 500 }
    );
  }
}
```

### Step 2: Enable Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/backup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

This runs backup every day at 2 AM UTC.

### Step 3: Add Environment Variable

In Vercel dashboard, add:
```
CRON_SECRET=your_random_secret_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Option 3: GitHub as Backup

Store periodic database exports in your GitHub repo:

```bash
#!/bin/bash
# scripts/backup-db.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/database_$TIMESTAMP.sql"

# Export from Supabase
pg_dump -Fc \
  --host $SUPABASE_HOST \
  --username postgres \
  --password \
  --db postgres > $BACKUP_FILE

# Commit to GitHub
git add $BACKUP_FILE
git commit -m "Database backup: $TIMESTAMP"
git push

echo "Backup complete: $BACKUP_FILE"
```

Run weekly:
```bash
# Add to crontab
0 3 * * 0 cd /path/to/project && bash scripts/backup-db.sh
```

---

## Testing Your Backups

**CRITICAL**: Test restore process monthly!

### 1. Create Test Database
- Create separate Supabase project for testing
- Name it: `nexus-ai-test-db`

### 2. Restore Backup
```bash
# Restore from backup file
psql -h test-db.supabase.co -U postgres -d postgres < backup_20260204.sql
```

### 3. Verify Data
- Run queries to confirm data is there
- Check message counts match production
- Verify user accounts exist

### 4. Document Results
- Keep restore test log
- Record restore time
- Note any issues

---

## Disaster Recovery Plan

### If Database Becomes Unavailable

**Step 1: Identify Issue** (5 mins)
- Check Supabase status page
- Check Sentry for errors
- Verify database connection

**Step 2: Alert Users** (5 mins)
- Update status page
- Send email notification
- Post on social media

**Step 3: Restore Backup** (15 mins)
- Get latest backup file
- Restore to recovery database
- Verify data integrity

**Step 4: Switch Traffic** (5 mins)
- Update connection string
- Restart app servers
- Verify users can access

**Step 5: Post-Mortem** (30 mins)
- Analyze root cause
- Implement fix
- Update runbook

---

## Backup Checklist

### Weekly
- [ ] Verify backup completed successfully
- [ ] Check backup file size is reasonable
- [ ] Monitor storage used

### Monthly
- [ ] Test restore process
- [ ] Verify restored data is correct
- [ ] Document restore time
- [ ] Update disaster recovery plan

### Before Major Changes
- [ ] Create full backup
- [ ] Store backup location in safe place
- [ ] Document rollback procedure

---

## 📋 Backup Locations

Document your backup locations:

```
PRIMARY BACKUP:
- Location: Supabase (paid tier automatic)
- Retention: 30 days
- Recovery Time: 15 minutes

SECONDARY BACKUP:
- Location: GitHub backups/ folder
- Retention: 90 days
- Recovery Time: 30 minutes

EMERGENCY BACKUP:
- Location: External hard drive (monthly export)
- Retention: 1 year
- Recovery Time: 1 hour
```

---

## 💰 Cost Breakdown

| Method | Cost | Effort | Recovery Time |
|--------|------|--------|-------|
| **Supabase Free** | Free | 30 mins | Manual |
| **Supabase Pro** | $25/mo | 5 mins | Automatic |
| **Vercel Cron** | Included | 2 hours setup | 15 mins |
| **GitHub** | Free | 1 hour setup | 30 mins |
| **External Drive** | $50 once | 30 mins/month | 1 hour |

---

## ✅ Backup Strategy Summary

### For Beta Launch
- Use free manual backups (monthly)
- Keep backup files in GitHub
- Test restore quarterly

### For Public Launch
- Upgrade Supabase to Pro ($25/month)
- Get automatic daily backups
- Test restore monthly
- Keep secondary GitHub backups

### For Enterprise
- Supabase Pro + daily backups
- Vercel cron additional backups
- GitHub archive
- External drive monthly
- Implement RTO/RPO targets

---

## 🆘 If Disaster Happens

### Database Corrupted
```sql
-- Restore from backup
-- Kill all connections to old database
-- Restore to new database
-- Update connection string
-- Verify data
```

### Data Accidentally Deleted
```sql
-- Check backup files
-- Find most recent backup BEFORE deletion
-- Restore that specific backup
-- Merge any data from after deletion
```

### Ransomware Attack
```
1. Isolate database (disconnect from internet)
2. Don't pay ransom
3. Restore from clean backup
4. Scan for vulnerabilities
5. Implement additional security
```

---

**Status**: With daily backups, your data is protected!

Next: Set up cost monitoring to prevent unexpected bills.
