/**
 * SEDREX — Supabase Database Backup Script
 * Exports all identified tables into a local JSON file.
 * Requires SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 * 
 * Usage:
 *   node scripts/backup_db.mjs <SERVICE_ROLE_KEY>
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://mzkdocjzwihfywommnid.supabase.co';
const TABLES = [
  'profiles',
  'user_preferences',
  'user_stats',
  'conversations',
  'messages',
  'artifacts',
  'generated_images',
  'generated_diagrams',
  'generated_code',
  'user_sessions',
  'user_events',
  'user_query_log',
  'platform_analytics_daily', // or user_daily_metrics
  'admin_audit_logs',
  'user_storage'
];

async function backup() {
  const serviceRoleKey = process.argv[2] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is required.');
    console.log('Usage: node scripts/backup_db.mjs <key>');
    process.exit(1);
  }

  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups', timestamp);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`📂 Backup directory: ${backupDir}`);

  const results = {};

  for (const table of TABLES) {
    console.log(`⏳ Fetching ${table}...`);
    try {
      let allRows = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          // Check if table exists (case of user_daily_metrics vs platform_analytics_daily)
          if (error.code === '42P01') {
             if (table === 'platform_analytics_daily') {
                 console.warn(`⚠️ Table ${table} not found, trying user_daily_metrics...`);
                 const { data: retryData, error: retryError } = await supabase
                   .from('user_daily_metrics')
                   .select('*')
                   .range(page * pageSize, (page + 1) * pageSize - 1);
                 
                 if (retryError) throw retryError;
                 data = retryData;
             } else {
                 throw error;
             }
          } else {
            throw error;
          }
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          page++;
          if (data.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      const filePath = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(allRows, null, 2));
      console.log(`✅ ${table}: ${allRows.length} rows saved.`);
      results[table] = allRows.length;

    } catch (err) {
      console.error(`❌ Failed to backup ${table}:`, err.message);
      results[table] = { error: err.message };
    }
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    timestamp,
    tables: results,
    supabase_url: SUPABASE_URL
  }, null, 2));

  console.log('\n✨ Database backup complete!');
  console.log(`📍 Saved to: ${backupDir}`);
}

backup();
