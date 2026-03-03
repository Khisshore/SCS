const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual .env parser
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const config = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      config[match[1]] = value;
    }
  });
  return config;
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPing() {
  console.log(`📡 Pinging Supabase at ${supabaseUrl}...`);
  try {
    const { data, error, status } = await supabase.from('settings').select('key').limit(1);
    
    if (error) {
      console.error('❌ Ping failed:', error.message);
      process.exit(1);
    } else {
      console.log(`✅ Ping successful (settings table)! Status: ${status}`);
    }
  } catch (err) {
    console.error('❌ Unexpected error during ping:', err.message);
    process.exit(1);
  }
}

testPing();
