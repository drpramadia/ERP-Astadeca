
/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/Dio Pramdia/warehouse-system/.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const anonKey = envVars['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false }
});

async function getTableData(tableName) {
  const { data, error } = await supabase.from(tableName).select('*').limit(100);
  if (error) {
    return { error: error.message, count: 0 };
  }
  return { data, count: data?.length || 0 };
}

async function inspectDatabase() {
  console.log('=== REMOTE DATABASE DATA INSPECTION ===\n');
  
  // Foundation tables
  console.log('=== FOUNDATION TABLES ===');
  const foundationTables = [
    'organizations', 'profiles', 'roles', 'permissions', 
    'role_permissions', 'organization_memberships',
    'approval_requests', 'approval_steps', 'approval_actions', 'audit_logs'
  ];
  
  for (const table of foundationTables) {
    const result = await getTableData(table);
    console.log(`\n${table}:`);
    console.log(`  Count: ${result.count}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else if (result.data && result.data.length > 0) {
      console.log(`  Columns: ${Object.keys(result.data[0]).join(', ')}`);
      console.log(`  Sample:`, JSON.stringify(result.data.slice(0, 2), null, 4));
    }
  }
  
  console.log('\n\n=== MASTER DATA TABLES ===');
  const masterTables = [
    'business_units', 'warehouses', 'cold_storages', 
    'storage_locations', 'product_categories', 'units',
    'products', 'suppliers', 'customers'
  ];
  
  for (const table of masterTables) {
    const result = await getTableData(table);
    console.log(`\n${table}:`);
    console.log(`  Count: ${result.count}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else if (result.data && result.data.length > 0) {
      console.log(`  Columns: ${Object.keys(result.data[0]).join(', ')}`);
      console.log(`  Sample:`, JSON.stringify(result.data.slice(0, 3), null, 4));
    }
  }
}

inspectDatabase().catch(console.error);
