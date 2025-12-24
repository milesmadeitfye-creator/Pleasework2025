/**
 * Ghoste One 30-Email Onboarding Sequence
 *
 * Complete onboarding funnel designed by the Ghoste One team.
 * Each email is delivered via Mailgun with AI-generated content based on these instructions.
 */

export type GhosteOnboardingEmailTemplate = {
  key: string; // unique key per email
  step: number; // 1–30
  dayOffset: number; // days from signup
  defaultSubject: string;
  aiInstruction: string; // prompt for Ghoste AI to generate body
};

export const GHOSTE_ONBOARDING_EMAILS: GhosteOnboardingEmailTemplate[] = [
  // PHASE 1 — Activation (0–3 days)
  {
    key: 'welcome_intro',
    step: 1,
    dayOffset: 0,
    defaultSubject: 'Welcome to Ghoste One — Your AI Manager Just Clocked In',
    aiInstruction: `
Write a short, hype, HTML email from Ghoste AI to a new artist who just created a Ghoste One account.

Tone:
- Friendly, confident, a little slang (but not corny).
- Talk like a manager who actually cares.

Goals:
- Introduce Ghoste AI as their "digital manager".
- Briefly list 3–4 big things Ghoste can help with (Smart Links, content ideas, ads, email, planning).
- Reassure them they don't need to know marketing to win here.

Content rules:
- 3–5 short paragraphs max.
- Include ONE clear CTA button or big link that says something like "Open My Dashboard" and points to {{dashboard_url}}.
- Use the artist's name if provided: {{artist_name}}.
`,
  },
  {
    key: 'connect_accounts',
    step: 2,
    dayOffset: 1,
    defaultSubject: 'Unlock Your Dashboard — Connect Your Accounts',
    aiInstruction: `
Write a motivating HTML email reminding the artist to connect their platforms (Meta, TikTok, Spotify, etc.) to Ghoste One.

Tone:
- Direct but supportive. Light slang is fine: "bet", "let's lock in".

Goals:
- Explain why connecting accounts matters: better tracking, easier automations, smarter AI.
- Reduce friction: mention it only takes a couple minutes.
- Encourage them to let Ghoste AI help once everything is connected.

Content rules:
- 2–3 short paragraphs.
- 3 bullets listing what happens after accounts are connected (better analytics, auto-tasks, ads, etc.).
- ONE CTA button like "Connect My Accounts" linking to {{connections_url}}.
`,
  },
  {
    key: 'first_smart_link',
    step: 3,
    dayOffset: 2,
    defaultSubject: 'Your First Smart Link is 2 Clicks Away',
    aiInstruction: `
Write an email that explains how easy it is to create their first Smart Link in Ghoste One.

Tone:
- Encouraging, slightly playful.

Goals:
- Explain what a Smart Link is in 1–2 simple sentences.
- Give an example: single release, EP, catalog, or listening party.
- Tell them Ghoste AI can set up the basics for them.

Content rules:
- Short intro (1–2 paragraphs), then a tiny "How it works" list with 3 steps.
- ONE CTA button like "Create My Smart Link" linking to {{smart_links_url}}.
`,
  },

  // PHASE 2 — First Wins (Days 3–6)
  {
    key: 'ghoste_ai_intro',
    step: 4,
    dayOffset: 3,
    defaultSubject: 'Meet Your Manager — Ghoste AI Can Run Your Day',
    aiInstruction: `
Introduce Ghoste AI as the artist's day-to-day manager.

Tone:
- Conversational, confident, like you're on their team.
- Use first person ("I can", "I'll help you").

Goals:
- Explain that Ghoste AI can plan releases, brainstorm content, create tasks, and break down data.
- Encourage them to treat it like a real manager and keep it updated.
- Nudge them to send their first real message to Ghoste AI.

Content rules:
- 2–3 paragraphs.
- A small list of 3 example prompts they can send (e.g. "Plan my next 30 days", "Give me 5 TikTok ideas", etc.).
- ONE CTA button like "Open Ghoste AI" linking to {{ghoste_ai_url}}.
`,
  },
  {
    key: 'first_campaign',
    step: 5,
    dayOffset: 4,
    defaultSubject: 'Promote Your Song in 60 Seconds — Let AI Build It',
    aiInstruction: `
Write an email encouraging the artist to let Ghoste AI design a simple promo campaign for a song.

Tone:
- Hype but simple, no tech-speak.

Goals:
- Explain what a "campaign" is in Ghoste One (set of tasks/links/posts).
- Emphasize speed: they can start in under a minute.
- Reduce fear of "doing it wrong" — Ghoste AI handles structure.

Content rules:
- 2 paragraphs + 3 bullet examples of campaigns (new single push, catalog warmup, pre-save push).
- ONE CTA button like "Start My Campaign" linking to {{campaigns_url}}.
`,
  },
  {
    key: 'build_email_list',
    step: 6,
    dayOffset: 5,
    defaultSubject: "Collect Fans Automatically — Let's Build Your List",
    aiInstruction: `
Teach why building an email list matters for artists using streaming + social.

Tone:
- Educational but chill, not lecture-y.

Goals:
- Explain why owning fan contact (email/phone) is powerful.
- Show that Ghoste can auto-collect fans via Smart Links and forms.
- Assure them they don't need to write perfect emails — Ghoste AI can.

Content rules:
- 2 short paragraphs.
- 3 bullets: what a list unlocks (drops, ticket sales, offers).
- ONE CTA button like "Set Up My Fan List" linking to {{fan_list_url}}.
`,
  },
  {
    key: 'listening_party_intro',
    step: 7,
    dayOffset: 6,
    defaultSubject: 'Drop a Listening Party Link — Build Real Hype',
    aiInstruction: `
Explain how Ghoste One listening parties work.

Tone:
- Excited, like you're helping them host an event.

Goals:
- Describe the idea: live session, chat with fans, focused listening.
- Offer 2–3 ideas for what to host (unreleased songs, new EP run-through, track breakdown).
- Nudge them to set up one date/time.

Content rules:
- 2 paragraphs + a mini bullet section with 3 ideas.
- ONE CTA button like "Create Listening Party Link" linking to {{listening_party_url}}.
`,
  },

  // PHASE 3 — Engagement + Habits (Week 2)
  {
    key: 'streak_engine',
    step: 8,
    dayOffset: 7,
    defaultSubject: "Your First Streak Starts Today — Let's Build Momentum",
    aiInstruction: `
Explain the "streak" or daily habit engine inside Ghoste One.

Tone:
- Coaching vibe: positive accountability.

Goals:
- Explain that doing 1–2 small actions every day compounds over time.
- Show that Ghoste AI can assign and track daily tasks.
- Encourage them to start a new streak today.

Content rules:
- 2 paragraphs.
- Short list of 3 "today tasks" examples (e.g. clean your Smart Link, post 1 clip, send 1 email).
- ONE CTA button like "See Today's Tasks" linking to {{tasks_url}}.
`,
  },
  {
    key: 'upload_assets',
    step: 9,
    dayOffset: 8,
    defaultSubject: 'Upload Your Photos, Logo & Branding — AI Will Use Them',
    aiInstruction: `
Encourage the artist to upload their brand assets (photos, logos, cover art).

Tone:
- Practical, reassuring.

Goals:
- Explain that better input = better AI output.
- Mention that Ghoste AI can reuse these assets in emails, covers, and content.
- Push them to upload at least 3–5 key images.

Content rules:
- 2 paragraphs.
- 3 bullets listing suggested assets (logo, press photo, cover art).
- ONE CTA button like "Upload My Brand Kit" linking to {{assets_url}}.
`,
  },
  {
    key: 'ghoste_studio_overview',
    step: 10,
    dayOffset: 9,
    defaultSubject: 'Create Covers, Lyric Videos & More — Inside Ghoste Studio',
    aiInstruction: `
Give a quick tour of Ghoste Studio tools.

Tone:
- Show-offy but grounded, like "look what you have now".

Goals:
- Highlight 3–4 tools: cover art, lyric video, hooks, content packs (adjust based on real tools).
- Emphasize "no design skills needed".
- Nudge them to try ONE thing today.

Content rules:
- 2 paragraphs.
- 4 bullets for key tools.
- ONE CTA button like "Open Ghoste Studio" linking to {{studio_url}}.
`,
  },
  {
    key: 'viral_hooks_tool',
    step: 11,
    dayOffset: 10,
    defaultSubject: 'Need TikTok Ideas? Use the Viral Hooks Tool Today.',
    aiInstruction: `
Explain the Viral Hooks / content idea generator.

Tone:
- Energetic, creator-friendly.

Goals:
- Show how it can turn a song into short-form ideas.
- Remove the pressure of being "creative every day" — AI helps.
- Suggest specific prompts they can ask the tool.

Content rules:
- 2 paragraphs.
- 3–4 bullet examples of hooks it can generate.
- ONE CTA button like "Generate Hooks" linking to {{viral_hooks_url}}.
`,
  },
  {
    key: 'ai_fan_emails',
    step: 12,
    dayOffset: 11,
    defaultSubject: "Ghoste AI Just Wrote You 3 Fan Emails — Want Them?",
    aiInstruction: `
Explain that Ghoste AI can write email campaigns for fans.

Tone:
- Casual but persuasive.

Goals:
- Take away fear of "I don't know what to say".
- Suggest 2–3 types of emails they can send (new drop, behind-the-scenes, exclusive link).
- Encourage them to auto-generate a small campaign.

Content rules:
- 2 paragraphs.
- Short list of 3 example email themes.
- ONE CTA button like "Create My Emails" linking to {{emails_url}}.
`,
  },
  {
    key: 'blueprint_download',
    step: 13,
    dayOffset: 12,
    defaultSubject: "Here's Your Music Marketing Blueprint — Don't Sleep On This",
    aiInstruction: `
Tell the user their Music Marketing Blueprint is ready to open.

Tone:
- Direct, slightly urgent (but not fear-based).

Goals:
- Explain what's inside the blueprint in 3–4 bullets (planner, ideas, hooks, structure).
- Encourage them to skim it TONIGHT and pick 1 action.
- Position it as their personal gameplan, not generic.

Content rules:
- 2 paragraphs.
- 3–4 bullet highlights.
- ONE CTA button like "Open My Blueprint" linking to {{blueprint_url}}.
`,
  },
  {
    key: 'pro_tease',
    step: 14,
    dayOffset: 13,
    defaultSubject: "You're Doing Good… Unlock the Full Power of PRO",
    aiInstruction: `
Soft-sell Ghoste PRO.

Tone:
- Encouraging, not pushy. Like a coach saying "You're ready for the next level".

Goals:
- Highlight 3–4 PRO perks relevant to marketing (more AI actions, extra tools, deeper analytics, priority features).
- Acknowledge what they've already done so far.
- Invite them to at least CHECK the PRO page, no hard commitment.

Content rules:
- 2 paragraphs.
- 3–4 bullet perks.
- ONE CTA button like "See PRO Features" linking to {{pro_url}}.
`,
  },

  // PHASE 4 — Conversion Window (Week 3)
  {
    key: 'smart_link_analytics',
    step: 15,
    dayOffset: 14,
    defaultSubject: 'Let Ghoste AI Break Down Your Traffic',
    aiInstruction: `
Encourage the artist to look at their Smart Link analytics and have Ghoste AI interpret them.

Tone:
- Helpful analyst vibe.

Goals:
- Explain that the numbers only matter if someone explains them.
- Suggest they ask Ghoste AI what to do next based on their clicks.
- Push them to check at least one Smart Link today.

Content rules:
- 2 paragraphs.
- Small list of 3 questions they can ask Ghoste AI about analytics.
- ONE CTA button like "View My Analytics" linking to {{smart_links_url}}.
`,
  },
  {
    key: 'ads_intro',
    step: 16,
    dayOffset: 15,
    defaultSubject: 'Ready for Meta & TikTok Ads? Your Account Is Set Up',
    aiInstruction: `
Introduce the ads manager in a very simple way.

Tone:
- Calm, confidence-building. This is for non-technical artists.

Goals:
- Explain what running small-budget ads can do for them.
- Clarify that Ghoste AI can help build and adjust campaigns.
- Suggest starting with one low daily budget test.

Content rules:
- 2 paragraphs.
- 3 bullets: discovery, testing, consistency.
- ONE CTA button like "Open Ads Manager" linking to {{ads_url}}.
`,
  },
  {
    key: 'first_ad',
    step: 17,
    dayOffset: 16,
    defaultSubject: 'Ghoste AI Can Build a Full Campaign in 2 Minutes',
    aiInstruction: `
Push them to launch their very first ad campaign through Ghoste.

Tone:
- Hyped, but also safety-first ("start small").

Goals:
- Emphasize that Ghoste AI will structure the campaign.
- Encourage them to test one song / one audience first.
- Remind them they can always turn it off or edit later.

Content rules:
- 2 paragraphs.
- 3-step mini flow (pick song, choose budget, let AI build and launch).
- ONE CTA button like "Launch My First Ad" linking to {{ads_url}}.
`,
  },
  {
    key: 'budget_optimization',
    step: 18,
    dayOffset: 17,
    defaultSubject: 'How to Spend $5/Day the Smart Way',
    aiInstruction: `
Give a super simple budget strategy for artists using small ad spends.

Tone:
- Straightforward, practical, like an older artist giving game.

Goals:
- Explain how $5–10/day can still be useful for testing.
- Mention focusing on ONE goal at a time (streams, followers, clicks).
- Encourage them to review and tweak budgets inside Ghoste.

Content rules:
- 2 short paragraphs.
- 3–4 bullet tips (rotate creatives, kill bad ads, move budget).
- ONE CTA button like "Review My Budgets" linking to {{ads_url}}.
`,
  },
  {
    key: 'automation_engine',
    step: 19,
    dayOffset: 18,
    defaultSubject: 'Ghoste Can Run Weekly Tasks for You Automatically',
    aiInstruction: `
Explain Ghoste's automation engine.

Tone:
- Lazy-friendly: "let the system do the boring stuff."

Goals:
- Show that they can schedule recurring tasks or reports.
- Give examples: weekly stats email, content reminders, email blasts.
- Encourage them to set up at least one automation.

Content rules:
- 2 paragraphs.
- 3 bullets of automation examples.
- ONE CTA button like "Set Up Automations" linking to {{automations_url}}.
`,
  },
  {
    key: 'invite_team',
    step: 20,
    dayOffset: 19,
    defaultSubject: 'Add Managers, Producers & Co-Writers — Collaborate Easily',
    aiInstruction: `
Invite the artist to add their team into Ghoste.

Tone:
- Inclusive, community-energy.

Goals:
- Explain that they don't have to run everything alone.
- Suggest who to invite (manager, producer, co-writers).
- Mention features like splits or shared dashboards if relevant.

Content rules:
- 2 paragraphs.
- 3 bullet examples of team roles.
- ONE CTA button like "Invite My Team" linking to {{team_url}}.
`,
  },
  {
    key: 'pro_offer_1',
    step: 21,
    dayOffset: 20,
    defaultSubject: 'Unlock Unlimited Tools — Try PRO Today',
    aiInstruction: `
First stronger PRO offer.

Tone:
- Confident and respectful: assume they're serious about their career.

Goals:
- Tie PRO to their goals (more consistency, more reach, better data).
- List 3–4 concrete reasons PRO helps serious artists specifically.
- Encourage them to start a trial or upgrade.

Content rules:
- 2 paragraphs.
- 3–4 bullet benefits.
- ONE CTA button like "Upgrade to PRO" linking to {{pro_url}}.
`,
  },

  // PHASE 5 — Power User Mode (Week 4)
  {
    key: 'splits_feature',
    step: 22,
    dayOffset: 21,
    defaultSubject: 'Handle Your Splits in Minutes — No More Spreadsheet Stress',
    aiInstruction: `
Explain the split negotiation / PDF feature.

Tone:
- Business-friendly but still casual.

Goals:
- Explain why clean splits protect relationships and money.
- Show how Ghoste can generate PDFs and invite collaborators.
- Encourage them to run splits for at least one key song.

Content rules:
- 2 paragraphs.
- 3 bullet benefits (clarity, professionalism, less drama).
- ONE CTA button like "Set Up My Splits" linking to {{splits_url}}.
`,
  },
  {
    key: 'release_strategy',
    step: 23,
    dayOffset: 22,
    defaultSubject: 'Ghoste AI Can Build a 30-Day Release Plan',
    aiInstruction: `
Invite the artist to have Ghoste AI build a full 30-day release plan.

Tone:
- Strategic, like a label planner.

Goals:
- Explain what a release plan is (before / during / after).
- Encourage them to give Ghoste AI specifics (song, date, platforms).
- Suggest this becomes their roadmap for the next month.

Content rules:
- 2 paragraphs.
- 3 bullets: pre-release, launch day, post-release follow-up.
- ONE CTA button like "Generate My Release Plan" linking to {{ghoste_ai_url}}.
`,
  },
  {
    key: 'calendar_sync',
    step: 24,
    dayOffset: 23,
    defaultSubject: 'Add Tasks and Drops Straight to Your Calendar',
    aiInstruction: `
Explain the calendar integration.

Tone:
- Organized manager energy.

Goals:
- Show that they can sync Ghoste tasks/events to Google Calendar.
- Explain how this keeps their music life in front of them daily.
- Encourage them to connect their calendar or check that it's working.

Content rules:
- 2 paragraphs.
- 3 bullets on what shows up in calendar (releases, content tasks, check-ins).
- ONE CTA button like "Sync My Calendar" linking to {{calendar_url}}.
`,
  },
  {
    key: 'fan_funnels',
    step: 25,
    dayOffset: 24,
    defaultSubject: 'Turn Streams Into Real Fans — Funnels 101',
    aiInstruction: `
Teach a simple funnel concept: strangers → listeners → followers → superfans.

Tone:
- Clear, easy-to-follow.

Goals:
- Show how Smart Links, email, and content combine into a funnel.
- Encourage them to think of their next 30 days in funnel steps.
- Point out where Ghoste tools fit in each step.

Content rules:
- Short intro paragraph.
- Funnel bullet list (top, middle, bottom).
- ONE CTA button like "Optimize My Funnel" linking to {{smart_links_url}} or {{funnels_url}}.
`,
  },
  {
    key: 'link_in_bio',
    step: 26,
    dayOffset: 25,
    defaultSubject: 'Make Your Profile Convert — Optimize Your Link in Bio',
    aiInstruction: `
Explain how to use Ghoste Smart Links as a "link in bio" hub.

Tone:
- Aesthetic + practical.

Goals:
- Explain why a clean link in bio matters on IG/TikTok.
- Suggest how to organize their main link (latest release, key links, signup).
- Nudge them to clean their profile today.

Content rules:
- 2 paragraphs.
- 3 bullet tips for a good link in bio.
- ONE CTA button like "Update My Link in Bio" linking to {{smart_links_url}}.
`,
  },
  {
    key: 'advanced_ads',
    step: 27,
    dayOffset: 26,
    defaultSubject: 'How Artists Scale to 100K Streams with Ads',
    aiInstruction: `
Share slightly more advanced ad game for artists who are already running campaigns.

Tone:
- "Insider tips" energy.

Goals:
- Give 3–5 short tactics (creative rotation, retargeting, lookalikes, etc.).
- Emphasize "learn from data, not feelings".
- Encourage them to use Ghoste AI to evaluate active ads.

Content rules:
- 2 short paragraphs.
- 4–5 bullet tactics.
- ONE CTA button like "Review My Ads with Ghoste" linking to {{ads_url}}.
`,
  },
  {
    key: 'pro_offer_2',
    step: 28,
    dayOffset: 27,
    defaultSubject: "You're Ready — Unlock Everything With PRO",
    aiInstruction: `
Final PRO push.

Tone:
- Confident, no desperation. Like "you've proven you're serious, now act like it."

Goals:
- Acknowledge how far they've come in the first month.
- Position PRO as the natural next step for serious artists.
- Push for an actual upgrade click.

Content rules:
- 2 paragraphs.
- 3 bullet reminders of what they get with PRO.
- ONE CTA button like "Go PRO" linking to {{pro_url}}.
`,
  },

  // PHASE 6 — Retention + Check-in (Week 5)
  {
    key: 'personal_checkin',
    step: 29,
    dayOffset: 28,
    defaultSubject: 'Hey, Everything Going Smooth? Your Manager Checking In',
    aiInstruction: `
Send a personal-feeling check-in from Ghoste AI.

Tone:
- Very human, caring, not corporate.
- Can use nicknames like "gang" lightly, if it fits.

Goals:
- Ask how things are going.
- Offer help with whatever feels stuck (content, ads, planning, mindset).
- Encourage them to reply in the app with a quick update.

Content rules:
- 2–3 short paragraphs.
- ONE CTA button like "Talk to Ghoste AI" linking to {{ghoste_ai_url}}.
`,
  },
  {
    key: 'achievement_summary',
    step: 30,
    dayOffset: 29,
    defaultSubject: "Here's What You've Done — Here's What's Next",
    aiInstruction: `
Celebrate the artist for making it through the first month.

Tone:
- Celebratory, affirming, but honest.

Goals:
- Summarize typical wins from using Ghoste One for a month (even if we only have partial data).
- Encourage them to keep going and not fall off.
- Suggest 2–3 "next stage" moves (tightening funnels, scaling ads, dropping new music).

Content rules:
- 2 paragraphs.
- 3 bullet "next moves" they can choose from.
- ONE CTA button like "Keep Building with Ghoste" linking to {{dashboard_url}}.
`,
  },
];
