export interface TourChapter {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  navigationPath?: string;
  highlightSelector?: string;
  illustration?: string;
  estimatedMinutes: number;
  actions?: TourAction[];
  beforeNavigation?: string;
  afterCompletion?: string;
  skipable: boolean;
}

export interface TourAction {
  type: 'click' | 'input' | 'acknowledge' | 'wait';
  label: string;
  description?: string;
  selector?: string;
  optional?: boolean;
}

export const tourChapters: TourChapter[] = [
  {
    id: 1,
    title: 'This is your label control center',
    subtitle: 'Everything you need to run your music like a professional label',
    description: `Welcome to Ghoste One — your complete label-in-a-box platform.

Think of Ghoste as your music business operating system. Everything flows together:

**Smart Links** → Turn any song into trackable, shareable links
**Fan Communication** → Build your owned audience (email, SMS)
**Ads Manager** → Run professional campaigns without an agency
**Analytics** → See what's working, double down
**Revenue** → Convert attention into streams, tickets, merch

Ghoste handles the marketing and business infrastructure so you can focus on music.

**Credits** are your usage fuel. Think of them like arcade tokens — you spend them on actions (creating links, sending messages, running AI). Free users get 7,500/month. Paid plans get more.

**Subscription** unlocks higher credit limits and priority support. Start free, upgrade when you're ready.`,
    illustration: 'system-overview',
    estimatedMinutes: 3,
    skipable: false,
    actions: [
      {
        type: 'acknowledge',
        label: 'Got it, show me around',
      },
    ],
  },
  {
    id: 2,
    title: 'Credits are fuel, not a paywall',
    subtitle: 'Understand how usage works before you start creating',
    description: `Before you start creating, let's talk about **credits**.

**What are credits?**
Credits are Ghoste's usage currency. Every action that costs resources (AI, emails, link creation) consumes credits.

**Why credits exist:**
Instead of rigid limits like "10 links per month," credits let YOU allocate resources however you need. Need 50 links but no emails this month? Go for it.

**What drains credits:**
- Creating Smart Links, Pre-Saves, etc. (30-75 credits)
- Sending broadcasts to fans (100 credits)
- AI requests (20 credits)
- Generating cover art (150 credits)
- Running ad campaigns (200 credits)

**What's free:**
- Viewing analytics (unlimited)
- Editing existing links (free)
- Receiving fan messages (free)
- Clicking your links (unlimited)

**Credit Reset:**
Free plan: 7,500 credits reset on the 1st of every month
Paid plans: Higher allocations based on tier

**Pro tip:** Start by creating a few Smart Links and One-Click Links. Save broadcasts and AI for when you really need them.`,
    navigationPath: '/wallet',
    estimatedMinutes: 4,
    skipable: false,
    beforeNavigation: 'Let me show you your wallet...',
    actions: [
      {
        type: 'acknowledge',
        label: 'I understand credits',
      },
    ],
  },
  {
    id: 3,
    title: 'Everything starts with Smart Links',
    subtitle: 'This is how you turn any song into trackable, shareable campaigns',
    description: `**Smart Links** are the foundation of your music marketing on Ghoste.

Instead of sharing raw Spotify/Apple Music URLs, you create ONE link that:
- Works across all platforms
- Looks branded and professional
- Tracks every click with full analytics
- Feeds data into your ad campaigns
- Never breaks (even if you change destinations later)

**When to use Smart Links:**
- Releasing a new song/album
- Need a landing page with album art
- Want detailed analytics
- Running paid ads

**Cost:** 50 credits per Smart Link

**Smart Links vs One-Click Links:**
- Smart Links = full landing page (better for discovery)
- One-Click Links = instant redirect (better for known audiences)

Let's create your first Smart Link together. Don't worry — you can save it as a draft without publishing.`,
    navigationPath: '/studio/smart-links',
    estimatedMinutes: 5,
    skipable: false,
    beforeNavigation: 'Taking you to Smart Links...',
    actions: [
      {
        type: 'acknowledge',
        label: 'Show me how to create one',
      },
    ],
  },
  {
    id: 4,
    title: 'One-click links convert better — here\'s why',
    subtitle: 'Zero friction means more clicks turn into real streams',
    description: `**One-Click Links** are Ghoste's most versatile link type.

Unlike Smart Links (which show a landing page), One-Click Links **redirect instantly** to your destination.

**Why One-Click Links convert better:**
- Zero friction (no "click here to listen")
- Perfect for Instagram bio
- Great for DM replies
- Ideal for ads (faster = better)
- Still tracks everything

**When to use:**
- Instagram/TikTok bio: \`ghoste.one/artist\`
- Reply to fan DMs: "Here's that track → link"
- Retargeting ads: Direct to Spotify
- QR codes: Instant playback

**Cost:** 30 credits (cheaper than Smart Links!)

**Pro tip:** Create a One-Click Link for your Spotify artist profile. Use it everywhere.`,
    navigationPath: '/studio/smart-links',
    estimatedMinutes: 3,
    skipable: false,
    actions: [
      {
        type: 'acknowledge',
        label: 'I get it',
      },
    ],
  },
  {
    id: 5,
    title: 'This is where fans turn into money',
    subtitle: 'Own your audience, control your revenue',
    description: `This is where the money is made.

Streams are great. But **owned audience** (email, SMS) is 10x more valuable:
- You control access (not Spotify's algorithm)
- Direct line to your biggest fans
- Drives ticket sales, merch, Patreon
- Costs nothing to reach them again

**How Ghoste helps:**
- **Inbox:** Centralized place for all fan messages
- **Templates:** Quick replies that convert
- **Broadcasts:** Send updates without spamming
- **Sequences:** Automated follow-ups (drip campaigns)

**The strategy:**
1. Drive clicks to your Smart Links
2. Capture emails via Pre-Saves or forms
3. Send value (new music, BTS, early access)
4. Monetize (tickets, merch, exclusive content)

Let's look at the Inbox and Templates.`,
    navigationPath: '/studio/fan-communication',
    estimatedMinutes: 4,
    skipable: false,
    beforeNavigation: 'Opening Fan Communication...',
    actions: [
      {
        type: 'acknowledge',
        label: 'Show me the Inbox',
      },
    ],
  },
  {
    id: 6,
    title: 'Automation is how you stop doing this manually',
    subtitle: 'Set it once, run it forever',
    description: `**Sequences** are automated message flows.

Instead of manually sending "thanks for pre-saving" emails, create a sequence once and it runs forever.

**Common sequences:**
- **Pre-Save Welcome:** Immediate thank you + story behind the song
- **New Fan Nurture:** 3-email series over 2 weeks
- **Reactivation:** Reach dormant fans with new music
- **Ticket Launch:** Announce tour dates to email list

**How it works:**
1. Fan takes action (pre-saves, signs up, etc.)
2. Ghoste enrolls them in your sequence
3. Messages send automatically based on timing
4. Fan stays engaged without you lifting a finger

**Cost:** 50 credits to enroll someone in a sequence

**Best practice:** Start simple. One welcome email. Then add more steps later.

You don't need to create one now — just know it exists when you're ready.`,
    navigationPath: '/studio/fan-communication',
    estimatedMinutes: 3,
    skipable: true,
    actions: [
      {
        type: 'acknowledge',
        label: 'Makes sense',
      },
    ],
  },
  {
    id: 7,
    title: 'Ads aren\'t scary when the data is right',
    subtitle: 'Reach new fans without guessing',
    description: `Most indie artists avoid ads because they're intimidating.

Ghoste makes them simple.

**Why run ads:**
- Reach NEW fans (not just your existing followers)
- Scale what's working organically
- Control your growth (not algorithm-dependent)
- $50 can get you 5,000+ targeted impressions

**What Ghoste does for you:**
- Pre-built campaign templates
- Creative guidance (what images work)
- Budget recommendations
- Auto-optimization
- Full analytics

**The secret:**
Smart Links feed conversion data into Meta's algorithm. The more data, the smarter your ads get.

**Starting budget:** $5-10/day is enough to test
**Best time to start:** After you have 100+ Smart Link clicks organically

You don't need to connect Meta right now. But when you're ready, it's here.`,
    navigationPath: '/studio/ad-campaigns',
    estimatedMinutes: 4,
    skipable: true,
    beforeNavigation: 'Taking a look at Ads Manager...',
    actions: [
      {
        type: 'acknowledge',
        label: 'Got it',
      },
    ],
  },
  {
    id: 8,
    title: 'Splits are business — Ghoste handles the awkward part',
    subtitle: 'Collaborate without confusion or conflict',
    description: `Most music involves collaboration. Ghoste handles the business.

**What this does:**
- Send split sheet invitations to collaborators
- Negotiate percentages (they can counter)
- Finalize agreements
- Generate PDFs for legal records

**How it works:**
1. Create a split negotiation for a song
2. Add collaborators (producer, co-writer, featured artist)
3. Assign percentage splits
4. They accept, decline, or counter
5. Once agreed, generate PDF

**Why it matters:**
Misunderstandings about splits destroy relationships and cost money. Handle this upfront.

**Cost:** 30 credits to send invitation, 40 credits for final PDF

You don't need to create one now — just know it's here when you collaborate.`,
    navigationPath: '/studio/splits',
    estimatedMinutes: 3,
    skipable: true,
    beforeNavigation: 'Checking out Splits...',
    actions: [
      {
        type: 'acknowledge',
        label: 'Understood',
      },
    ],
  },
  {
    id: 9,
    title: 'Data tells you what\'s working',
    subtitle: 'See everything, optimize what matters',
    description: `Data tells you what's working.

**What Ghoste tracks:**
- Every Smart Link click (location, device, platform)
- Fan engagement (email opens, clicks)
- Ad performance (impressions, conversions, cost)
- Conversion funnels (link → pre-save → stream)

**What to watch:**
- **Click-through rate:** Are people clicking your links?
- **Conversion rate:** Are clicks turning into streams/pre-saves?
- **Geographic data:** Where are your fans?
- **Platform preference:** Spotify or Apple Music?

**How to use analytics:**
1. See what content performs best
2. Double down on what works
3. Cut what doesn't
4. Adjust ad targeting based on real fans

**Pro tip:** Don't obsess over vanity metrics (total clicks). Focus on **conversions** (did they actually listen?).

Let's take a quick look at your analytics dashboard.`,
    navigationPath: '/analytics',
    estimatedMinutes: 3,
    skipable: true,
    beforeNavigation: 'Opening Analytics...',
    actions: [
      {
        type: 'acknowledge',
        label: 'Show me',
      },
    ],
  },
  {
    id: 10,
    title: 'You\'re ready — here\'s where to start',
    subtitle: 'Your roadmap from today to serious growth',
    description: `You now understand how Ghoste works. Here's your roadmap:

**Immediate (Today):**
1. Create your first Smart Link for your latest release
2. Create a One-Click Link for your Spotify artist profile
3. Put the One-Click Link in your Instagram bio

**This Week:**
1. Share your Smart Link everywhere (socials, email sig, Discord)
2. Check analytics after 100 clicks
3. Set up one email template for fan replies

**This Month:**
1. Create a Pre-Save campaign for your next release
2. Send your first broadcast to your email list
3. Consider running a small ad test ($50 budget)

**When You're Ready:**
- Upgrade to Artist plan ($9/mo) for 2x credits
- Connect Meta Ads for serious growth
- Build automated sequences for new fans

**Remember:**
You don't need to do everything at once. Start with Smart Links. Build from there.

Ghoste is here whenever you need it.`,
    illustration: 'action-plan',
    estimatedMinutes: 2,
    skipable: false,
    actions: [
      {
        type: 'acknowledge',
        label: 'Let\'s do this',
      },
    ],
  },
];

// Contextual guides content
export interface ContextualGuide {
  id: string;
  title: string;
  description: string;
  triggerPath: string;
  highlightSelector?: string;
  actions?: TourAction[];
}

export const contextualGuides: ContextualGuide[] = [
  {
    id: 'ads-manager-first-visit',
    title: 'Ads Manager Basics',
    description: 'Meta ads help you reach NEW fans. Start small ($5-10/day), target fans of similar artists, and use Smart Links for tracking. Connect Meta when ready.',
    triggerPath: '/studio/ad-campaigns',
  },
  {
    id: 'analytics-first-visit',
    title: 'Analytics Overview',
    description: 'Track every click, conversion, and campaign. Focus on conversion rate (not just clicks). Use geographic data to plan tours and target ads.',
    triggerPath: '/analytics',
  },
  {
    id: 'wallet-first-visit',
    title: 'Your Wallet',
    description: 'You start with 7,500 credits on the Free plan. They reset monthly. Check your balance here anytime. Upgrade when you need more.',
    triggerPath: '/wallet',
  },
  {
    id: 'splits-first-visit',
    title: 'Split Negotiations',
    description: 'Collaborate without confusion. Send split invitations, negotiate percentages, and finalize agreements. Keeps relationships healthy.',
    triggerPath: '/studio/splits',
  },
  {
    id: 'cover-art-first-visit',
    title: 'AI Cover Art',
    description: 'Generate professional cover art in seconds. Describe your vision, pick a style, and download. Costs 150 credits per generation.',
    triggerPath: '/studio/cover-art',
  },
];

// Action-based coaching triggers
export interface ActionCoaching {
  id: string;
  title: string;
  description: string;
  cta: string;
  ctaPath: string;
  trigger: 'link-created-not-shared' | 'credits-low' | 'draft-not-sent' | 'ad-paused' | 'no-activity-7days';
  priority: 'low' | 'medium' | 'high';
}

export const actionCoachingRules: ActionCoaching[] = [
  {
    id: 'link-created-not-shared',
    title: 'You built this — now activate it',
    description: 'You created a Smart Link but haven\'t shared it yet. Copy the link and post it on social media, add it to your bio, or send it to your email list.',
    cta: 'View My Links',
    ctaPath: '/studio/smart-links',
    trigger: 'link-created-not-shared',
    priority: 'medium',
  },
  {
    id: 'credits-running-low',
    title: 'Credit balance: 20% remaining',
    description: 'You\'re running low on credits. They reset on the 1st of next month, or you can upgrade now for instant refill.',
    cta: 'View Plans',
    ctaPath: '/subscriptions',
    trigger: 'credits-low',
    priority: 'high',
  },
  {
    id: 'draft-sitting-idle',
    title: 'Finish what you started',
    description: 'You drafted a broadcast but never sent it. Either send it now or delete it to keep your workspace clean.',
    cta: 'View Drafts',
    ctaPath: '/studio/fan-communication',
    trigger: 'draft-not-sent',
    priority: 'low',
  },
  {
    id: 'inactive-user-nudge',
    title: 'Miss us?',
    description: 'You haven\'t logged in for a week. Check your analytics to see how your links are performing, or create something new.',
    cta: 'View Dashboard',
    ctaPath: '/dashboard/overview',
    trigger: 'no-activity-7days',
    priority: 'low',
  },
];
