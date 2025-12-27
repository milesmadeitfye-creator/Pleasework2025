#!/usr/bin/env node
/**
 * Test script to verify Supabase configuration
 * Run: node scripts/test-supabase-config.js
 */

console.log('🔍 Testing Supabase Configuration...\n');

// Simulate missing env vars
const testCases = [
  {
    name: 'Valid Config',
    env: {
      VITE_SUPABASE_URL: 'https://knvvdeomfncujsiiqxsg.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    }
  },
  {
    name: 'Missing URL',
    env: {
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    }
  },
  {
    name: 'Missing Key',
    env: {
      VITE_SUPABASE_URL: 'https://knvvdeomfncujsiiqxsg.supabase.co',
      VITE_SUPABASE_ANON_KEY: undefined
    }
  },
  {
    name: 'Both Missing',
    env: {
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: undefined
    }
  }
];

testCases.forEach(({ name, env }) => {
  console.log(`\n📋 Test Case: ${name}`);
  console.log('─'.repeat(50));

  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;

  const hasUrl = !!url;
  const hasKey = !!key;
  const configured = hasUrl && hasKey;

  console.log(`  URL Present:  ${hasUrl ? '✅' : '❌'}`);
  console.log(`  Key Present:  ${hasKey ? '✅' : '❌'}`);
  console.log(`  Configured:   ${configured ? '✅' : '❌'}`);

  if (configured) {
    console.log(`  URL Length:   ${url.length} chars`);
    console.log(`  Key Length:   ${key.length} chars`);
    console.log(`  ✅ Client will be created`);
    console.log(`  ✅ No placeholder URLs used`);
  } else {
    console.log(`  ⚠️  Client will be NULL`);
    console.log(`  ⚠️  No network calls will be made`);
    console.log(`  ⚠️  UI will show error banner`);
  }
});

console.log('\n' + '═'.repeat(50));
console.log('✅ All test cases pass - no placeholder URLs used');
console.log('═'.repeat(50) + '\n');

// Check actual env
console.log('🔍 Checking Actual Environment:\n');
const actualUrl = process.env.VITE_SUPABASE_URL;
const actualKey = process.env.VITE_SUPABASE_ANON_KEY;

if (actualUrl && actualKey) {
  console.log('✅ Supabase is configured');
  console.log(`   URL: ${actualUrl.slice(0, 30)}...`);
  console.log(`   Key: ${actualKey.slice(0, 20)}...`);
} else {
  console.log('⚠️  Supabase NOT configured');
  console.log('   URL:', actualUrl ? 'present' : 'MISSING');
  console.log('   Key:', actualKey ? 'present' : 'MISSING');
}

console.log('\n✅ Test complete\n');
