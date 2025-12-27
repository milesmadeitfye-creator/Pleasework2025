/**
 * Test script for Ghoste AI debug mode
 *
 * Tests the authenticated debug endpoint that returns setupStatus without calling OpenAI
 *
 * Usage:
 *   node scripts/test-ghoste-debug.js
 */

const GHOSTE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!GHOSTE_URL || !ANON_KEY) {
  console.error('❌ Missing environment variables. Need:');
  console.error('   VITE_SUPABASE_URL');
  console.error('   VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('🧪 Testing Ghoste AI Debug Mode\n');
console.log('This script simulates the frontend calling ghosteAgent with ?debug=1');
console.log('Expected: Returns setupStatus without calling OpenAI\n');

// Simulate a user session token (you'll need to replace this with a real token)
const TEST_TOKEN = process.env.TEST_USER_TOKEN;

if (!TEST_TOKEN) {
  console.error('⚠️  TEST_USER_TOKEN not set. To test with a real user:');
  console.error('   1. Open browser console on ghoste.one');
  console.error('   2. Run: (await supabase.auth.getSession()).data.session.access_token');
  console.error('   3. Copy the token');
  console.error('   4. Run: TEST_USER_TOKEN="<token>" node scripts/test-ghoste-debug.js\n');
  console.error('Alternatively, test in browser console:');
  console.log('\n--- Browser Console Test ---');
  console.log(`
const { data } = await supabase.auth.getSession();
const token = data?.session?.access_token;

const res = await fetch('/.netlify/functions/ghosteAgent?debug=1', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${token}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ messages: [] })
});

const debugData = await res.json();
console.log('Debug Response:', debugData);
console.log('\\nsetupStatus:', debugData.setupStatus);
console.log('\\nMeta connected:', debugData.setupStatus?.meta?.has_meta);
console.log('Resolved assets:', debugData.setupStatus?.resolved);
  `);
  process.exit(1);
}

async function testDebugMode() {
  console.log('📡 Calling /.netlify/functions/ghosteAgent?debug=1\n');

  try {
    const response = await fetch('https://myghoste.netlify.app/.netlify/functions/ghosteAgent?debug=1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: []
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      console.error('Response:', errorText);
      process.exit(1);
    }

    const data = await response.json();

    console.log('✅ Response received\n');
    console.log('--- Full Response ---');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n--- Key Fields ---');
    console.log('ok:', data.ok);
    console.log('debug:', data.debug);
    console.log('userId:', data.userId || 'NOT PRESENT');
    console.log('setupStatus present:', !!data.setupStatus);

    if (data.setupStatus) {
      console.log('\n--- setupStatus ---');
      console.log('meta.has_meta:', data.setupStatus.meta?.has_meta);
      console.log('meta.source_table:', data.setupStatus.meta?.source_table);
      console.log('smart_links_count:', data.setupStatus.smart_links_count);

      if (data.setupStatus.resolved) {
        console.log('\n--- Resolved Assets (Canonical) ---');
        console.log('ad_account_id:', data.setupStatus.resolved.ad_account_id || 'NULL');
        console.log('page_id:', data.setupStatus.resolved.page_id || 'NULL');
        console.log('pixel_id:', data.setupStatus.resolved.pixel_id || 'NULL');
        console.log('destination_url:', data.setupStatus.resolved.destination_url || 'NULL');
      }

      if (data.setupStatus.meta?.instagram_accounts?.length > 0) {
        console.log('\n--- Instagram Accounts ---');
        data.setupStatus.meta.instagram_accounts.forEach((ig, i) => {
          console.log(`${i + 1}. @${ig.username} (ID: ${ig.id})`);
        });
      }
    }

    console.log('\n✅ Debug mode works!');
    console.log('The endpoint returned setupStatus without calling OpenAI.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testDebugMode();
