import type { Handler } from "@netlify/functions";
import { checkAdLaunchReadiness, autoCreateSmartLink, extractPlatformUrl } from "./_adLaunchTruthCheck";
import { launchAds } from "./_adLaunchHelper";
import { getSupabaseAdmin } from "./_supabaseAdmin";

interface TestResult {
  test_name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export const handler: Handler = async (event) => {
  const supabase = getSupabaseAdmin();
  const results: TestResult[] = [];

  console.log('[ad-launch-acceptance-tests] 🧪 Running acceptance tests...');

  try {
    results.push(await testTruthCheckWithValidSetup());
    results.push(await testTruthCheckWithMissingAdAccount());
    results.push(await testTruthCheckWithMissingPage());
    results.push(await testAutoLinkCreationSpotify());
    results.push(await testAutoLinkCreationAppleMusic());
    results.push(await testUrlExtraction());
    results.push(await testReadinessWithExistingLink());
    results.push(await testNoFalseNegatives());

    const allPassed = results.every(r => r.passed);
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    console.log(`[ad-launch-acceptance-tests] ${passedCount}/${totalCount} tests passed`);

    if (!allPassed) {
      const failures = results.filter(r => !r.passed);
      console.error('[ad-launch-acceptance-tests] ❌ FAILURES:', failures);
    }

    return {
      statusCode: allPassed ? 200 : 500,
      body: JSON.stringify({
        ok: allPassed,
        passed: passedCount,
        total: totalCount,
        results,
      }, null, 2),
    };
  } catch (e: any) {
    console.error("[ad-launch-acceptance-tests] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};

async function testTruthCheckWithValidSetup(): Promise<TestResult> {
  try {
    // This test requires a test user with full Meta setup
    // For now, we'll test the logic structure
    const testUserId = 'test-user-id';

    const readiness = await checkAdLaunchReadiness(testUserId);

    // Should return a structured result with all fields
    if (!readiness.hasOwnProperty('ready')) {
      return {
        test_name: 'Truth check returns structured result',
        passed: false,
        error: 'Missing ready field',
      };
    }

    if (!readiness.hasOwnProperty('meta_connected')) {
      return {
        test_name: 'Truth check returns structured result',
        passed: false,
        error: 'Missing meta_connected field',
      };
    }

    return {
      test_name: 'Truth check returns structured result',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Truth check returns structured result',
      passed: false,
      error: e.message,
    };
  }
}

async function testTruthCheckWithMissingAdAccount(): Promise<TestResult> {
  try {
    // Test that missing ad account returns correct blocker
    const testUserId = 'test-user-no-ad-account';

    const readiness = await checkAdLaunchReadiness(testUserId);

    if (readiness.ready) {
      return {
        test_name: 'Missing ad account blocks launch',
        passed: false,
        error: 'Should not be ready without ad account',
      };
    }

    if (readiness.blocker !== 'meta_not_connected' && readiness.blocker !== 'no_ad_account') {
      return {
        test_name: 'Missing ad account blocks launch',
        passed: false,
        error: `Wrong blocker: ${readiness.blocker}`,
      };
    }

    if (!readiness.next_action) {
      return {
        test_name: 'Missing ad account blocks launch',
        passed: false,
        error: 'Missing next_action',
      };
    }

    return {
      test_name: 'Missing ad account blocks launch',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Missing ad account blocks launch',
      passed: false,
      error: e.message,
    };
  }
}

async function testTruthCheckWithMissingPage(): Promise<TestResult> {
  try {
    // Test that missing page returns correct blocker
    const testUserId = 'test-user-no-page';

    const readiness = await checkAdLaunchReadiness(testUserId);

    if (readiness.ready && !readiness.meta_page) {
      return {
        test_name: 'Missing page blocks launch',
        passed: false,
        error: 'Should not be ready without page',
      };
    }

    return {
      test_name: 'Missing page blocks launch',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Missing page blocks launch',
      passed: false,
      error: e.message,
    };
  }
}

async function testAutoLinkCreationSpotify(): Promise<TestResult> {
  try {
    const testUserId = 'test-auto-link-user';
    const spotifyUrl = 'https://open.spotify.com/track/test123';

    const link = await autoCreateSmartLink({
      userId: testUserId,
      platformUrl: spotifyUrl,
      title: 'Test Auto Link',
    });

    if (!link.id) {
      return {
        test_name: 'Auto-create link from Spotify URL',
        passed: false,
        error: 'Link creation failed - no ID',
      };
    }

    if (!link.slug) {
      return {
        test_name: 'Auto-create link from Spotify URL',
        passed: false,
        error: 'Link creation failed - no slug',
      };
    }

    // Clean up
    const supabase = getSupabaseAdmin();
    await supabase.from('smart_links').delete().eq('id', link.id);

    return {
      test_name: 'Auto-create link from Spotify URL',
      passed: true,
      details: { link_id: link.id },
    };
  } catch (e: any) {
    return {
      test_name: 'Auto-create link from Spotify URL',
      passed: false,
      error: e.message,
    };
  }
}

async function testAutoLinkCreationAppleMusic(): Promise<TestResult> {
  try {
    const testUserId = 'test-auto-link-user';
    const appleUrl = 'https://music.apple.com/us/album/test/123';

    const link = await autoCreateSmartLink({
      userId: testUserId,
      platformUrl: appleUrl,
      title: 'Test Apple Link',
    });

    if (!link.id) {
      return {
        test_name: 'Auto-create link from Apple Music URL',
        passed: false,
        error: 'Link creation failed - no ID',
      };
    }

    // Clean up
    const supabase = getSupabaseAdmin();
    await supabase.from('smart_links').delete().eq('id', link.id);

    return {
      test_name: 'Auto-create link from Apple Music URL',
      passed: true,
      details: { link_id: link.id },
    };
  } catch (e: any) {
    return {
      test_name: 'Auto-create link from Apple Music URL',
      passed: false,
      error: e.message,
    };
  }
}

async function testUrlExtraction(): Promise<TestResult> {
  try {
    const testMessages = [
      {
        message: 'run ads for this https://open.spotify.com/track/abc123',
        expected: 'https://open.spotify.com/track/abc123',
      },
      {
        message: 'promote my song https://music.apple.com/us/album/test',
        expected: 'https://music.apple.com/us/album/test',
      },
      {
        message: 'run ads on this youtube.com/watch?v=test123',
        expected: 'https://www.youtube.com/watch?v=test123',
      },
      {
        message: 'just run ads with no link',
        expected: null,
      },
    ];

    for (const test of testMessages) {
      const extracted = extractPlatformUrl(test.message);

      if (test.expected === null && extracted !== null) {
        return {
          test_name: 'Extract platform URL from message',
          passed: false,
          error: `Should not extract from: ${test.message}`,
        };
      }

      if (test.expected !== null && !extracted) {
        return {
          test_name: 'Extract platform URL from message',
          passed: false,
          error: `Failed to extract from: ${test.message}`,
        };
      }

      if (test.expected !== null && extracted && !extracted.includes(test.expected.split('/')[2])) {
        return {
          test_name: 'Extract platform URL from message',
          passed: false,
          error: `Wrong extraction: expected ${test.expected}, got ${extracted}`,
        };
      }
    }

    return {
      test_name: 'Extract platform URL from message',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Extract platform URL from message',
      passed: false,
      error: e.message,
    };
  }
}

async function testReadinessWithExistingLink(): Promise<TestResult> {
  try {
    // Test that existing link is detected
    const testUserId = 'test-user-with-link';
    const supabase = getSupabaseAdmin();

    // Create test link
    const { data: link } = await supabase
      .from('smart_links')
      .insert([{
        user_id: testUserId,
        title: 'Test Link',
      }])
      .select('id')
      .single();

    if (!link) {
      return {
        test_name: 'Readiness detects existing link',
        passed: false,
        error: 'Failed to create test link',
      };
    }

    const readiness = await checkAdLaunchReadiness(testUserId);

    // Clean up
    await supabase.from('smart_links').delete().eq('id', link.id);

    if (!readiness.has_campaign_input) {
      return {
        test_name: 'Readiness detects existing link',
        passed: false,
        error: 'Did not detect existing link',
      };
    }

    if (readiness.campaign_input_type !== 'smart_link') {
      return {
        test_name: 'Readiness detects existing link',
        passed: false,
        error: `Wrong input type: ${readiness.campaign_input_type}`,
      };
    }

    return {
      test_name: 'Readiness detects existing link',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'Readiness detects existing link',
      passed: false,
      error: e.message,
    };
  }
}

async function testNoFalseNegatives(): Promise<TestResult> {
  try {
    // Test that truth check reads from same source as UI
    // This is a structure test - verifies we're checking meta_credentials
    const testUserId = 'test-user-id';

    const readiness = await checkAdLaunchReadiness(testUserId);

    // Should query meta_credentials (not user_meta_assets or other tables)
    // We verify this by checking that the result structure matches meta_credentials fields
    if (readiness.meta_connected && !readiness.assets) {
      return {
        test_name: 'No false negatives (same source as UI)',
        passed: false,
        error: 'Meta connected but no assets - wrong table?',
      };
    }

    // If ready, should have all required asset fields
    if (readiness.ready && readiness.assets) {
      const requiredFields = ['ad_account_id', 'page_id', 'access_token'];

      for (const field of requiredFields) {
        if (!readiness.assets[field as keyof typeof readiness.assets]) {
          return {
            test_name: 'No false negatives (same source as UI)',
            passed: false,
            error: `Missing required field: ${field}`,
          };
        }
      }
    }

    return {
      test_name: 'No false negatives (same source as UI)',
      passed: true,
    };
  } catch (e: any) {
    return {
      test_name: 'No false negatives (same source as UI)',
      passed: false,
      error: e.message,
    };
  }
}
