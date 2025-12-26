/**
 * Test script for ai-debug-setup endpoint
 * Run: node scripts/test-ai-debug-setup.js
 *
 * You'll need to provide a valid Supabase access token
 */

async function testDebugSetup() {
  const baseUrl = process.env.TEST_URL || 'https://ghoste.one';
  const token = process.env.SUPABASE_TOKEN;

  if (!token) {
    console.error('ERROR: Please set SUPABASE_TOKEN environment variable');
    console.error('Get it from browser console:');
    console.error('  const session = await supabase.auth.getSession();');
    console.error('  console.log(session.data.session.access_token);');
    process.exit(1);
  }

  console.log('Testing ai-debug-setup endpoint...');
  console.log('URL:', `${baseUrl}/.netlify/functions/ai-debug-setup`);
  console.log('Token:', token.substring(0, 20) + '...');
  console.log('');

  try {
    const response = await fetch(`${baseUrl}/.netlify/functions/ai-debug-setup`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('Status:', response.status);
    console.log('');

    const data = await response.json();
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.ok) {
      console.log('');
      console.log('✅ SUCCESS - Function is working correctly');
      console.log('User ID:', data.userId);
      if (data.setupStatus) {
        console.log('Setup status keys:', Object.keys(data.setupStatus));
      }
    } else {
      console.log('');
      console.log('❌ FAILED - Error:', data.error);
      if (data.details) {
        console.log('Details:', data.details);
      }
    }
  } catch (error) {
    console.error('❌ REQUEST FAILED:', error.message);
    process.exit(1);
  }
}

// Run test
testDebugSetup().catch(console.error);
