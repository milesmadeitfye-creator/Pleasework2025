/**
 * Email Automation Configuration
 *
 * Defines all automated onboarding and sales email steps for Ghoste One.
 * 30-day funnel with phases: activation → value → upsell → urgency
 * Each step has AI prompts to generate personalized copy, plus fallback copy.
 *
 * NOTE: This config now sources from src/config/ghosteOnboardingEmails.ts
 * and converts the new format to the existing EmailTemplate format.
 */

import { GHOSTE_ONBOARDING_EMAILS } from '../../src/config/ghosteOnboardingEmails';

export type EmailTemplate = {
  key: string; // Stable identifier like "d0_welcome"
  phase: 'activation' | 'value' | 'upsell' | 'urgency'; // Funnel phase
  behaviorTrigger: string; // Trigger condition
  delayMinutes: number; // Delay after signup
  subjectPrompt: string; // AI prompt for subject line
  bodyPrompt: string; // AI prompt for email body
  fallbackSubject: string; // Fallback subject if AI fails
  fallbackBody: string; // Fallback body if AI fails
  ctaUrlPath?: string; // URL path for CTA button (e.g. "/dashboard", "/pricing")
  offerTag?: string; // Offer identifier (e.g. "FOUNDERS_DISCOUNT", "BOOST_PACK")
  stripeCouponCode?: string | null; // Stripe coupon code (null = to be filled by founder)
};

/**
 * Determine funnel phase based on day offset
 */
function determinePhase(dayOffset: number): 'activation' | 'value' | 'upsell' | 'urgency' {
  if (dayOffset <= 6) return 'activation';
  if (dayOffset <= 14) return 'value';
  if (dayOffset <= 24) return 'upsell';
  return 'urgency';
}

/**
 * All automated email steps for Ghoste One 30-day onboarding & sales funnel
 * Converted from the new GHOSTE_ONBOARDING_EMAILS config
 */
export const EMAIL_AUTOMATION_STEPS: EmailTemplate[] = GHOSTE_ONBOARDING_EMAILS.map((template) => {
  const phase = determinePhase(template.dayOffset);

  // Convert day offset to minutes (with a 10-minute buffer for day 0)
  const delayMinutes = template.dayOffset === 0 ? 10 : template.dayOffset * 24 * 60;

  // Create a simple day-based trigger
  const behaviorTrigger = template.dayOffset === 0
    ? 'signup_completed'
    : `days_since_signup_${template.dayOffset}`;

  // Extract subject prompt from AI instruction (first few lines usually mention subject)
  const subjectPrompt = `Generate a compelling email subject line for this email:\n${template.aiInstruction.substring(0, 200)}...\n\nMake it catchy and personal.`;

  // Use the full AI instruction as body prompt
  const bodyPrompt = template.aiInstruction;

  // Generate fallback body from AI instruction summary
  const fallbackBody = `Hey {{first_name}},\n\n` +
    `This is an automated message from Ghoste One.\n\n` +
    `We're here to help you grow your music career with smart tools and AI-powered insights.\n\n` +
    `Log in to your dashboard to explore what's new.\n\n` +
    `– The Ghoste One Team`;

  return {
    key: template.key,
    phase,
    behaviorTrigger,
    delayMinutes,
    subjectPrompt,
    bodyPrompt,
    fallbackSubject: template.defaultSubject,
    fallbackBody,
    ctaUrlPath: '/dashboard',
  };
});

/**
 * LEGACY EMAIL STEPS (kept for reference, not used)
 */
const LEGACY_EMAIL_AUTOMATION_STEPS: EmailTemplate[] = [
  // ============================================================================
  // PHASE 1: ACTIVATION (Days 0-6)
  // Goal: Get users engaged with core features
  // ============================================================================

  {
    key: 'd0_welcome',
    phase: 'activation',
    behaviorTrigger: 'signup_completed',
    delayMinutes: 10,
    subjectPrompt:
      "Write a short, friendly subject line welcoming {{first_name}} to Ghoste One and encouraging them to log in today.",
    bodyPrompt:
      "Write a concise onboarding email from Ghoste One to {{first_name}}. " +
      "Explain that Ghoste One is their control room for music marketing. " +
      "Give exactly 3 clear steps:\n" +
      "1) Create their first Smart Link.\n" +
      "2) Connect Tasks & Calendar.\n" +
      "3) Ask Ghoste AI for a simple release plan.\n" +
      "Tone: warm, hype, direct, speak to them as 'you'.",
    fallbackSubject: "Welcome to Ghoste One, {{first_name}} 🎧",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Welcome to Ghoste One — your control room for music marketing.\n\n" +
      "Here are 3 quick wins you can knock out today:\n\n" +
      "1) Create your first Smart Link so fans have one place to click.\n" +
      "2) Connect your Tasks & Calendar so you never miss a release deadline.\n" +
      "3) Open Ghoste AI and ask for a 2-week plan for your next release.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard',
  },

  {
    key: 'd1_smartlink_nudge',
    phase: 'activation',
    behaviorTrigger: 'no_smart_link_after_24h',
    delayMinutes: 24 * 60,
    subjectPrompt:
      "Write a subject line reminding {{first_name}} to create their first Smart Link.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} reminding them to create their first Smart Link. " +
      "Explain why Smart Links matter (one link everywhere, track clicks, pre-saves) and give 2–3 specific ways they can use it this week.",
    fallbackSubject: "Your first Smart Link is waiting 🚀",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Quick reminder: your first Smart Link is a few clicks away.\n\n" +
      "Use it to:\n" +
      "• Put one link in your bio that sends fans to every platform.\n" +
      "• Share pre-saves before release day.\n" +
      "• Track which platforms your fans actually use.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard?tab=smart-links',
  },

  {
    key: 'd2_ai_intro',
    phase: 'activation',
    behaviorTrigger: 'no_ai_usage_after_48h',
    delayMinutes: 2 * 24 * 60,
    subjectPrompt:
      "Write a subject line inviting {{first_name}} to ask Ghoste AI for help.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} introducing Ghoste AI. " +
      "Give 3 concrete things Ghoste AI can do for them right now (content ideas, release plan, ad copy). " +
      "Include one copy-paste prompt they can try immediately.",
    fallbackSubject: "Let Ghoste AI plan your next move ⚡️",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "You don't have to figure this release out alone.\n\n" +
      "Ghoste AI can help you:\n" +
      "• Turn your next single into a simple 2-week marketing plan.\n" +
      "• Brainstorm content ideas that actually fit your sound.\n" +
      "• Draft ad copy and emails in your voice.\n\n" +
      "Try this inside Ghoste AI:\n" +
      "\"Here's my next single and release date. Give me a simple 2-week content and promo plan.\"\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard?tab=ghoste-ai',
  },

  {
    key: 'd3_calendar_tasks',
    phase: 'activation',
    behaviorTrigger: 'no_calendar_after_72h',
    delayMinutes: 3 * 24 * 60,
    subjectPrompt:
      "Write a subject line encouraging {{first_name}} to use Calendar & Tasks.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} explaining how Calendar & Tasks help artists stay consistent. " +
      "Give 2-3 specific actions they can take today (add tasks, set reminders, sync Google Calendar).",
    fallbackSubject: "Stay on track with Calendar & Tasks 📅",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Consistency is key in music marketing.\n\n" +
      "Try this today:\n" +
      "• Add 3 content tasks for this week\n" +
      "• Set reminders so you never miss a post\n" +
      "• Sync with Google Calendar for full visibility\n\n" +
      "Small daily actions lead to big results over time.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/calendar',
  },

  {
    key: 'd4_ads_intro',
    phase: 'activation',
    behaviorTrigger: 'no_ad_campaign_after_4d',
    delayMinutes: 4 * 24 * 60,
    subjectPrompt:
      "Write a subject line encouraging {{first_name}} to explore ad campaigns.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} introducing ad campaigns. " +
      "Explain that Ghoste One makes it easy (connect Meta, AI builds assets, launch with $5/day). " +
      "Include 2-3 quick wins they can expect.",
    fallbackSubject: "Ready to run your first ad? 🎯",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Ready to reach more fans? Ghoste One makes running ads simple:\n\n" +
      "• Connect your Meta (Facebook/Instagram) account\n" +
      "• Let Ghoste AI create campaign assets\n" +
      "• Launch with as little as $5/day budget\n\n" +
      "Quick wins you can expect:\n" +
      "• More streams from new listeners\n" +
      "• More followers on your socials\n" +
      "• Data on which platforms convert best\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard?tab=ads',
  },

  {
    key: 'd6_growth_report',
    phase: 'activation',
    behaviorTrigger: 'user_active_6d',
    delayMinutes: 6 * 24 * 60,
    subjectPrompt:
      "Write a subject line celebrating {{first_name}}'s first week with Ghoste One.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} celebrating their first week. " +
      "Summarize what they've accomplished (Smart Links created, AI chats, tasks added, etc.). " +
      "Encourage them to keep the momentum going.",
    fallbackSubject: "Your first week with Ghoste One 🎉",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "You've been using Ghoste One for a week now — here's what you've built:\n\n" +
      "• Smart Links created and tracking clicks\n" +
      "• Ghoste AI helping you plan your next move\n" +
      "• Tasks and calendar keeping you consistent\n\n" +
      "This is just the beginning. Keep building.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard',
  },

  // ============================================================================
  // PHASE 2: VALUE (Days 7-14)
  // Goal: Show deeper value, build trust
  // ============================================================================

  {
    key: 'd7_gap_highlight',
    phase: 'value',
    behaviorTrigger: 'free_plan_7d',
    delayMinutes: 7 * 24 * 60,
    subjectPrompt:
      "Write a subject line asking {{first_name}} what's holding them back.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} asking what's blocking them from reaching their music goals. " +
      "Position Ghoste One as the tool that removes those blocks. " +
      "Tone: empathetic, supportive, curious.",
    fallbackSubject: "What's holding you back, {{first_name}}?",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Quick question: what's the biggest thing holding you back from reaching your music goals right now?\n\n" +
      "Is it:\n" +
      "• Not knowing where to start with marketing?\n" +
      "• Not having time to create content?\n" +
      "• Not knowing if your strategy is working?\n\n" +
      "Ghoste One is built to remove those blocks. Let's figure it out together.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard?tab=ghoste-ai',
  },

  {
    key: 'd9_content_pack',
    phase: 'value',
    behaviorTrigger: 'free_plan_9d',
    delayMinutes: 9 * 24 * 60,
    subjectPrompt:
      "Write a subject line offering {{first_name}} a free content pack.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} offering a free 7-day content pack generated by Ghoste AI. " +
      "Explain that it includes post ideas, captions, and a simple posting schedule. " +
      "Make it feel like a gift, not a sales pitch.",
    fallbackSubject: "Free 7-day content pack inside 📦",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "We know creating content every day is hard. So we made something for you:\n\n" +
      "A free 7-day content pack generated by Ghoste AI:\n" +
      "• Post ideas tailored to your music\n" +
      "• Ready-to-use captions\n" +
      "• A simple posting schedule\n\n" +
      "Open Ghoste AI and ask:\n" +
      "\"Give me a 7-day content plan for my next release.\"\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard?tab=ghoste-ai',
  },

  {
    key: 'd10_smartlink_pro_features',
    phase: 'value',
    behaviorTrigger: 'has_smart_link_10d',
    delayMinutes: 10 * 24 * 60,
    subjectPrompt:
      "Write a subject line about advanced Smart Link features {{first_name}} is missing.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} explaining Pro Smart Link features: " +
      "deeper analytics, custom domains, retargeting pixels, A/B testing. " +
      "Show how these help them understand and grow their audience.",
    fallbackSubject: "Your Smart Links could do more 📊",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Your Smart Links are working — but with Pro, they could do even more:\n\n" +
      "• Deeper analytics (see which cities, devices, and times convert)\n" +
      "• Custom domains (ghoste.yourdomain.com)\n" +
      "• Retargeting pixels (turn clicks into ad audiences)\n" +
      "• A/B testing (test different landing pages)\n\n" +
      "Ghoste One Pro turns Smart Links into a growth engine.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
  },

  {
    key: 'd12_ai_features',
    phase: 'value',
    behaviorTrigger: 'has_ai_usage_12d',
    delayMinutes: 12 * 24 * 60,
    subjectPrompt:
      "Write a subject line about Pro AI features {{first_name}} doesn't have yet.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} explaining Pro AI features: " +
      "unlimited AI credits, advanced prompts, campaign builder, email sequences. " +
      "Show how Pro users get more done in less time.",
    fallbackSubject: "Ghoste AI Pro: More power, less work ⚡️",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "You've been using Ghoste AI — but Pro unlocks even more:\n\n" +
      "• Unlimited AI credits (no more running out mid-campaign)\n" +
      "• Advanced prompts (deeper strategies, better copy)\n" +
      "• Campaign builder (AI builds entire campaigns for you)\n" +
      "• Email sequences (automated fan communication)\n\n" +
      "Pro users get more done in less time.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
  },

  {
    key: 'd14_comparison',
    phase: 'value',
    behaviorTrigger: 'free_plan_14d',
    delayMinutes: 14 * 24 * 60,
    subjectPrompt:
      "Write a subject line comparing what {{first_name}} has vs. what they're missing.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} showing a simple comparison: " +
      "what they have now (Free) vs. what Pro offers. " +
      "Make it visual and clear. Tone: honest, factual, no pressure.",
    fallbackSubject: "Free vs. Pro: What are you missing? 🔍",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Here's what you have now (Free):\n" +
      "✓ Basic Smart Links\n" +
      "✓ Limited AI credits\n" +
      "✓ Basic analytics\n\n" +
      "Here's what Pro unlocks:\n" +
      "✓ Unlimited AI credits\n" +
      "✓ Advanced Smart Links with custom domains\n" +
      "✓ Deep analytics and retargeting\n" +
      "✓ Priority support\n\n" +
      "Treat your music like a business.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
  },

  // ============================================================================
  // PHASE 3: UPSELL (Days 15-24)
  // Goal: Convert to Pro with offers and social proof
  // ============================================================================

  {
    key: 'd15_pro_intro',
    phase: 'upsell',
    behaviorTrigger: 'free_plan_15d',
    delayMinutes: 15 * 24 * 60,
    subjectPrompt:
      "Write a soft, curious subject line introducing Ghoste One Pro to {{first_name}}.",
    bodyPrompt:
      "Write a short sales email from Ghoste One to {{first_name}} introducing Ghoste One Pro. " +
      "Explain that Pro is for artists who are ready to treat their music like a business. " +
      "Highlight 3 benefits: more AI credits, deeper analytics, and advanced automations. " +
      "Mention a 'Founders Discount' without stating the exact price.",
    fallbackSubject: "{{first_name}}, ready for Ghoste One Pro?",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "You've already started building inside Ghoste One.\n\n" +
      "Ghoste One Pro is for artists who are ready to treat their music like a business:\n" +
      "• More AI credits for campaigns and content.\n" +
      "• Deeper analytics on your Smart Links and clicks.\n" +
      "• Advanced automations that save you hours every week.\n\n" +
      "For early users, we're offering a special Founders Discount on Ghoste One Pro.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
    offerTag: 'FOUNDERS_DISCOUNT',
    stripeCouponCode: null, // FOUNDER to fill in Stripe
  },

  {
    key: 'd17_use_cases',
    phase: 'upsell',
    behaviorTrigger: 'free_plan_17d',
    delayMinutes: 17 * 24 * 60,
    subjectPrompt:
      "Write a subject line about how other artists use Ghoste One Pro.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} showing 3 real use cases: " +
      "an artist who grew their email list 10x, another who ran their first successful ad, another who saved 5 hours/week with automation. " +
      "Use specific examples. Tone: inspiring, factual, social proof.",
    fallbackSubject: "How artists use Ghoste One Pro 🎯",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Here's how other artists are using Ghoste One Pro:\n\n" +
      "Artist A: Grew their email list 10x using Smart Link retargeting + automated email sequences.\n\n" +
      "Artist B: Ran their first ad campaign and got 5,000 new Spotify streams for $50.\n\n" +
      "Artist C: Saved 5 hours/week by automating content creation with Ghoste AI Pro.\n\n" +
      "What could you do with Pro?\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
  },

  {
    key: 'd19_achievements',
    phase: 'upsell',
    behaviorTrigger: 'free_plan_19d',
    delayMinutes: 19 * 24 * 60,
    subjectPrompt:
      "Write a subject line celebrating what {{first_name}} has built so far.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} celebrating what they've accomplished in 19 days. " +
      "Then introduce Pro as the next level: \"You've built the foundation. Pro helps you scale.\" " +
      "Tone: celebratory, then aspirational.",
    fallbackSubject: "Look how far you've come, {{first_name}} 🚀",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "You've been using Ghoste One for almost 3 weeks. Look what you've built:\n\n" +
      "• Smart Links tracking your fans\n" +
      "• AI helping you plan campaigns\n" +
      "• Tasks and calendar keeping you consistent\n\n" +
      "You've built the foundation. Ghoste One Pro helps you scale.\n\n" +
      "Ready to take it to the next level?\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
  },

  {
    key: 'd21_ai_credits_boost',
    phase: 'upsell',
    behaviorTrigger: 'low_ai_credits_21d',
    delayMinutes: 21 * 24 * 60,
    subjectPrompt:
      "Write a subject line offering {{first_name}} 50 bonus AI credits.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} offering 50 bonus AI credits if they upgrade to Pro this week. " +
      "Explain what they can do with 50 credits (5 campaigns, 10 email sequences, 25 content packs). " +
      "Make it feel like a limited-time boost.",
    fallbackSubject: "50 bonus AI credits waiting for you 🎁",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Upgrade to Ghoste One Pro this week and get 50 bonus AI credits.\n\n" +
      "What you can do with 50 credits:\n" +
      "• Build 5 full ad campaigns\n" +
      "• Generate 10 email sequences\n" +
      "• Create 25 content packs\n\n" +
      "This offer expires in 7 days.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
    offerTag: 'BOOST_PACK',
    stripeCouponCode: null, // FOUNDER to fill in Stripe
  },

  {
    key: 'd23_case_study',
    phase: 'upsell',
    behaviorTrigger: 'free_plan_23d',
    delayMinutes: 23 * 24 * 60,
    subjectPrompt:
      "Write a subject line about a real artist's Pro success story.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} telling a detailed case study: " +
      "Artist started with Free, upgraded to Pro, saw 3x growth in 60 days. " +
      "Include specific numbers and tactics they used. " +
      "Tone: storytelling, inspiring, credible.",
    fallbackSubject: "How one artist 3x'd their reach with Pro 📈",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Artist X started with Ghoste One Free in January. By March, they upgraded to Pro.\n\n" +
      "What changed:\n" +
      "• Used Pro analytics to find their best-performing platforms\n" +
      "• Ran retargeting campaigns with Smart Link pixels\n" +
      "• Automated email sequences to their growing list\n\n" +
      "Result: 3x more monthly listeners in 60 days.\n\n" +
      "Your turn.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
  },

  // ============================================================================
  // PHASE 4: URGENCY (Days 25-30)
  // Goal: Create urgency to convert before 30-day mark
  // ============================================================================

  {
    key: 'd25_pro_pitch',
    phase: 'urgency',
    behaviorTrigger: 'free_plan_25d',
    delayMinutes: 25 * 24 * 60,
    subjectPrompt:
      "Write a direct subject line pitching Pro to {{first_name}}.",
    bodyPrompt:
      "Write a direct sales email from Ghoste One to {{first_name}} pitching Pro. " +
      "Be honest: \"We've shown you everything Pro can do. Here's the deal.\" " +
      "List Pro benefits clearly, mention Founders Discount expires soon. " +
      "Tone: direct, honest, no games.",
    fallbackSubject: "The Pro offer expires in 5 days ⏰",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "We've shown you everything Ghoste One Pro can do over the past 25 days.\n\n" +
      "Here's the deal:\n" +
      "• Unlimited AI credits\n" +
      "• Advanced Smart Links with custom domains\n" +
      "• Deep analytics and retargeting\n" +
      "• Priority support\n\n" +
      "The Founders Discount expires in 5 days.\n\n" +
      "After that, this offer is gone.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
    offerTag: 'FOUNDERS_DISCOUNT',
    stripeCouponCode: null,
  },

  {
    key: 'd26_deadline_soft',
    phase: 'urgency',
    behaviorTrigger: 'free_plan_26d',
    delayMinutes: 26 * 24 * 60,
    subjectPrompt:
      "Write a subject line reminding {{first_name}} the discount ends soon.",
    bodyPrompt:
      "Write a short reminder email from Ghoste One to {{first_name}} that the Founders Discount ends in 4 days. " +
      "No pressure, just a friendly reminder. " +
      "Tone: helpful, non-pushy.",
    fallbackSubject: "4 days left for Founders Discount ⏰",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Quick reminder: the Ghoste One Pro Founders Discount ends in 4 days.\n\n" +
      "No pressure — just didn't want you to miss it if you were thinking about upgrading.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
    offerTag: 'FOUNDERS_DISCOUNT',
    stripeCouponCode: null,
  },

  {
    key: 'd28_comparison_table',
    phase: 'urgency',
    behaviorTrigger: 'free_plan_28d',
    delayMinutes: 28 * 24 * 60,
    subjectPrompt:
      "Write a subject line showing {{first_name}} a final comparison.",
    bodyPrompt:
      "Write an email from Ghoste One to {{first_name}} with a clear side-by-side comparison table: " +
      "Free vs. Pro. Make it visual and scannable. " +
      "End with: \"2 days left for Founders Discount.\" " +
      "Tone: factual, clear, final offer.",
    fallbackSubject: "Free vs. Pro: Final comparison ⚖️",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "Here's one final comparison:\n\n" +
      "FREE:\n" +
      "• 50 AI credits/month\n" +
      "• Basic Smart Links\n" +
      "• Basic analytics\n\n" +
      "PRO:\n" +
      "• Unlimited AI credits\n" +
      "• Advanced Smart Links (custom domains, retargeting)\n" +
      "• Deep analytics + A/B testing\n" +
      "• Priority support\n\n" +
      "Founders Discount ends in 2 days.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
    offerTag: 'FOUNDERS_DISCOUNT',
    stripeCouponCode: null,
  },

  {
    key: 'd29_last_chance',
    phase: 'urgency',
    behaviorTrigger: 'free_plan_29d',
    delayMinutes: 29 * 24 * 60,
    subjectPrompt:
      "Write a subject line telling {{first_name}} this is the last day.",
    bodyPrompt:
      "Write a final urgency email from Ghoste One to {{first_name}} saying the Founders Discount expires tonight at midnight. " +
      "Be direct and honest. No tricks. " +
      "Tone: urgent but respectful.",
    fallbackSubject: "Last day for Founders Discount 🚨",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "This is it — the Ghoste One Pro Founders Discount expires tonight at midnight.\n\n" +
      "After tonight, this offer is gone for good.\n\n" +
      "If you've been thinking about upgrading, now is the time.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/pricing',
    offerTag: 'FOUNDERS_DISCOUNT',
    stripeCouponCode: null,
  },

  {
    key: 'd30_exit',
    phase: 'urgency',
    behaviorTrigger: 'free_plan_30d',
    delayMinutes: 30 * 24 * 60,
    subjectPrompt:
      "Write a graceful exit subject line thanking {{first_name}}.",
    bodyPrompt:
      "Write a graceful exit email from Ghoste One to {{first_name}} saying the Founders Discount has expired. " +
      "Thank them for trying Ghoste One. Let them know Pro is still available at regular price. " +
      "Leave the door open. " +
      "Tone: grateful, respectful, non-pushy.",
    fallbackSubject: "Thanks for trying Ghoste One, {{first_name}} 🙏",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "The Founders Discount has expired, but we wanted to say thank you for trying Ghoste One over the past 30 days.\n\n" +
      "If you ever want to upgrade to Pro, it's still here at the regular price. No pressure.\n\n" +
      "Keep building. We're rooting for you.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard',
  },

  // ============================================================================
  // REACTIVATION (Day 14+ for inactive users)
  // ============================================================================

  {
    key: 'reactivation_14d_inactive',
    phase: 'activation',
    behaviorTrigger: 'no_login_14d',
    delayMinutes: 14 * 24 * 60,
    subjectPrompt:
      "Write a re-engagement subject line for {{first_name}} who hasn't logged in for 2 weeks.",
    bodyPrompt:
      "Write a re-engagement email from Ghoste One to {{first_name}} who hasn't logged in for 2 weeks. " +
      "Don't guilt them — just remind them what they're missing. " +
      "Give them one easy action.",
    fallbackSubject: "We miss you, {{first_name}} 👋",
    fallbackBody:
      "Hey {{first_name}},\n\n" +
      "It's been a minute! Just wanted to check in and remind you what's waiting inside Ghoste One:\n\n" +
      "• AI-powered marketing plans\n" +
      "• Smart Links that track every click\n" +
      "• Calendar & Tasks to keep you consistent\n\n" +
      "Log back in and let's keep the momentum going.\n\n" +
      "– The Ghoste One Team",
    ctaUrlPath: '/dashboard',
  },
];
