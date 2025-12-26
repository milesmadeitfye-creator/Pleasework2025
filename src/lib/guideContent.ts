export interface GuideArticle {
  id: string;
  title: string;
  category: string;
  slug: string;
  description: string;
  content: string;
  screenshots: string[];
  estimatedMinutes: number;
  tags: string[];
  order: number;
  relatedArticles?: string[];
}

export interface GuideCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
}

export const guideCategories: GuideCategory[] = [
  {
    id: 'start-here',
    name: 'Start Here',
    description: 'Essential guides to get you started',
    icon: 'Rocket',
    order: 1
  },
  {
    id: 'ghoste-studio',
    name: 'Ghoste Studio',
    description: 'Creative tools and AI assistant',
    icon: 'Sparkles',
    order: 2
  },
  {
    id: 'smart-links',
    name: 'Smart Links',
    description: 'All link types: Smart, One-Click, Pre-Saves, Bios, Shows',
    icon: 'Link2',
    order: 3
  },
  {
    id: 'fan-communication',
    name: 'Fan Communication',
    description: 'Inbox, templates, broadcasts, and sequences',
    icon: 'MessageCircle',
    order: 4
  },
  {
    id: 'ads-manager',
    name: 'Ads Manager',
    description: 'Meta campaigns, creative, and optimization',
    icon: 'Target',
    order: 5
  },
  {
    id: 'splits',
    name: 'Split Negotiations',
    description: 'Collaborate on royalty splits',
    icon: 'Users',
    order: 6
  },
  {
    id: 'wallet-credits',
    name: 'Wallet & Credits',
    description: 'Understanding the credit economy',
    icon: 'Wallet',
    order: 7
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Track performance and growth',
    icon: 'BarChart3',
    order: 8
  },
  {
    id: 'account-settings',
    name: 'Account & Settings',
    description: 'Integrations, security, and billing',
    icon: 'Settings',
    order: 9
  }
];

export const guideArticles: GuideArticle[] = [
  {
    id: 'welcome',
    title: 'Welcome to Ghoste One',
    category: 'start-here',
    slug: 'welcome',
    description: 'Your all-in-one platform for music marketing and artist management',
    estimatedMinutes: 5,
    tags: ['getting-started', 'overview'],
    order: 1,
    screenshots: ['welcome_dashboard.svg', 'welcome_studio.svg'],
    content: `# Welcome to Ghoste One

## What is Ghoste One?

Ghoste One is your complete label-in-a-box platform. We combine smart marketing tools, fan communication, AI assistance, and analytics into one powerful system built specifically for independent artists and labels.

## What You Can Do

### Smart Links & Landing Pages
Create beautiful, trackable links for your music across all platforms. Generate One-Click redirect links, Pre-Save campaigns, Link in Bio pages, and Show event pages.

### Fan Communication
Connect directly with your fans through an intelligent inbox. Use templates, send broadcasts, and set up automated sequences that convert listeners into superfans.

### Ads Manager
Run professional Meta (Facebook/Instagram) ad campaigns without an agency. Our system guides you through creative, targeting, budgets, and optimization.

### Split Negotiations
Collaborate with producers, writers, and featured artists. Send split sheet invitations, negotiate terms, and finalize agreements all in one place.

### Ghoste AI
Your AI-powered manager that helps plan releases, suggests content ideas, and answers questions about your marketing strategy.

### Wallet & Credits
Ghoste operates on a credit system. Free users get 7,500 credits per month. Credits are spent on link creation, AI requests, email sends, and more.

## Why Ghoste Exists

Traditional music marketing tools are either too expensive, too complicated, or too fragmented. Ghoste One brings everything together with intelligent automation, fair pricing, and a focus on outcomes that matter: streams, ticket sales, and fan engagement.

## Your First Steps

1. **Check your wallet** - See your credit balance and understand how it works
2. **Create a Smart Link** - Drop your first trackable link
3. **Connect Meta** - Set up tracking pixels (optional but powerful)
4. **Explore Fan Communication** - See how you can automate outreach
5. **Browse Analytics** - Understand what we track

## Getting Help

- **Search this guide** - Use the search bar above
- **Interactive tutorial** - Available on your dashboard
- **Ghoste AI** - Ask questions anytime in Studio

Ready to start? Head to your [Dashboard](/dashboard) or dive into [Creating Your First Smart Link](/help/smart-links/smart-links-overview).
`
  },
  {
    id: 'first-10-minutes',
    title: 'Your First 10 Minutes: Setup Checklist',
    category: 'start-here',
    slug: 'first-10-minutes',
    description: 'The fastest path from signup to your first campaign',
    estimatedMinutes: 10,
    tags: ['getting-started', 'checklist', 'onboarding'],
    order: 2,
    screenshots: ['checklist_dashboard.svg', 'checklist_progress.svg'],
    content: `# Your First 10 Minutes

Get up and running fast with this step-by-step checklist.

## 1. Check Your Wallet (30 seconds)

Navigate to [Wallet](/wallet) in the top nav. You'll see:
- **7,500 credits** (Free plan starting balance)
- **Credit costs** for each feature
- **Monthly reset** schedule (1st of each month)

**Why this matters:** Credits are your fuel. Understanding costs helps you prioritize what to build first.

## 2. Create Your First Smart Link (3 minutes)

Go to [Ghoste Studio → Smart Links](/studio/smart-links):

1. Click **"Smart Link"**
2. Enter your song title
3. Add platform URLs (Spotify, Apple Music, etc.)
4. Customize the slug (URL path)
5. Click **"Create Link"**

**Cost:** 50 credits

You now have a trackable, brandable link that works across all platforms.

## 3. Test Your Link (1 minute)

1. Copy your new link
2. Open it in an incognito window
3. Verify it redirects correctly
4. Check the landing page appearance

**Pro tip:** Share this link instead of raw Spotify URLs. You'll get full analytics and control.

## 4. Create a One-Click Link (2 minutes)

Back in Smart Links, click **"One-Click"**:

1. Title: "Spotify Profile"
2. Target URL: Your Spotify artist profile
3. Slug: "spotify" or "listen"
4. Create

**Use case:** Direct links for Instagram bio, email signatures, or QR codes.

## 5. Explore Fan Communication (2 minutes)

Visit [Fan Communication](/studio/fan-communication):

- Check the **Inbox** (currently empty)
- Browse **Templates** (pre-built responses)
- See **Sequences** (automated follow-ups)

**Why this matters:** When fans DM you, you'll have smart tools ready to convert them.

## 6. Optional: Connect Meta (2 minutes)

If you plan to run ads:

1. Go to [Account → Connected Accounts](/profile/connected-accounts)
2. Click **"Connect Meta"**
3. Authorize access
4. Select your ad account and pixel

**Benefit:** Smart Links will send conversion events to Meta, improving ad targeting.

## What's Next?

You've completed the essentials. Now choose your path:

- **Ready to promote?** Create a Pre-Save campaign
- **Want to run ads?** Go to Ads Manager
- **Need to split royalties?** Start a negotiation
- **Curious about AI?** Chat with Ghoste AI

Check your dashboard for a [Getting Started Checklist](/dashboard) with more guided tasks.
`
  },
  {
    id: 'free-plan-credits',
    title: 'How the Free Plan Works (7,500 Credits)',
    category: 'start-here',
    slug: 'free-plan-credits',
    description: 'Understanding your credit allocation and limits',
    estimatedMinutes: 4,
    tags: ['credits', 'free-plan', 'limits'],
    order: 3,
    screenshots: ['wallet_overview.svg', 'credit_costs.svg'],
    content: `# How the Free Plan Works

## Your Credit Balance

Every Ghoste One account starts with **7,500 credits per month** on the Free plan.

### Monthly Reset
Credits reset on the **1st of each month**. Unused credits do NOT roll over.

### Credit Costs

Here's what you can do with 7,500 credits:

| Feature | Cost | Monthly Capacity |
|---------|------|------------------|
| Smart Link | 50 credits | 150 links |
| One-Click Link | 30 credits | 250 links |
| Pre-Save Link | 75 credits | 100 links |
| Bio Link | 40 credits | 187 links |
| Show Link | 40 credits | 187 links |
| Fan Broadcast | 100 credits | 75 sends |
| AI Request | 20 credits | 375 requests |
| Cover Art Generation | 150 credits | 50 images |
| Meta Campaign | 200 credits | 37 campaigns |

**Real-world example:** You could create 10 Smart Links, 5 One-Click Links, 2 Pre-Saves, send 50 broadcasts, and make 50 AI requests = 6,750 credits used.

## What Happens When You Run Out?

When credits hit zero:
- **Links stay active** (no downtime)
- **Analytics keep working**
- **You can't create new items** until next reset

Options:
1. **Wait for monthly reset**
2. **Upgrade to paid plan** (instant credit refill)
3. **Buy credit top-ups** (coming soon)

## Smart Usage Tips

1. **Create links strategically** - Don't make duplicates
2. **Use One-Click for simple redirects** - They cost less than Smart Links
3. **Batch AI requests** - Ask multiple questions at once
4. **Templates over broadcasts** - Respond to inbound DMs (free) instead of outbound blasts

## Tracking Your Usage

View real-time balance at [Wallet](/wallet):
- Current balance
- Recent transactions
- Cost breakdown by feature
- Next reset date

## When to Upgrade

Consider a paid plan if you:
- Create 20+ links per month
- Send weekly broadcasts to fans
- Run multiple ad campaigns simultaneously
- Need unlimited AI requests
- Want priority support

Compare plans at [Subscriptions](/subscriptions).

## Fair Use Policy

Free credits are designed for:
- Solo artists or small teams
- Testing the platform
- Building your first campaigns

Abuse detection:
- Spam link creation → temporary restrictions
- Automated bot usage → account review
- Reselling services → immediate suspension

Use Ghoste One as intended and you'll never hit these limits.
`
  },
  {
    id: 'upgrading-plans',
    title: 'Upgrading: Artist $9 / Growth $19 / Scale $49',
    category: 'start-here',
    slug: 'upgrading-plans',
    description: 'Choose the right plan for your release schedule',
    estimatedMinutes: 5,
    tags: ['pricing', 'plans', 'upgrade'],
    order: 4,
    screenshots: ['plans_comparison.svg'],
    content: `# Upgrading Your Plan

## Available Plans

### Free
**$0/month** • 7,500 credits/month
- Perfect for getting started
- All core features unlocked
- Monthly credit reset
- Community support

### Artist
**$9/month** • 15,000 credits/month
- 2x Free plan credits
- Best for solo artists
- 1-2 releases per month
- Priority email support

### Growth
**$19/month** • 40,000 credits/month
- 5x Free plan credits
- For active promoters
- Multiple simultaneous campaigns
- Faster AI responses
- Priority support

### Scale
**$49/month** • 120,000 credits/month
- 16x Free plan credits
- For labels & management
- High-volume usage
- Dedicated account manager
- Custom integrations available

## What You Get at Each Tier

| Feature | Free | Artist | Growth | Scale |
|---------|------|--------|--------|-------|
| Monthly Credits | 7,500 | 15,000 | 40,000 | 120,000 |
| Smart Links | Unlimited active | Unlimited | Unlimited | Unlimited |
| Fan Communication | ✓ | ✓ | ✓ | ✓ |
| Ads Manager | ✓ | ✓ | ✓ | ✓ |
| Ghoste AI | ✓ | ✓ | ✓ | ✓ |
| Split Negotiations | ✓ | ✓ | ✓ | ✓ |
| Meta Pixel Tracking | ✓ | ✓ | ✓ | ✓ |
| Support | Community | Email | Priority | Dedicated |

## How to Choose

### Choose Free if:
- You're just exploring
- Release 1 song every 2-3 months
- Don't run paid ads yet
- Want to test before committing

### Choose Artist if:
- Consistent monthly releases
- Building a fanbase actively
- Run occasional ad campaigns
- Need reliable support

### Choose Growth if:
- Label or management company
- 3+ releases per month
- Active ad campaigns weekly
- Multiple artists or projects

### Choose Scale if:
- High-volume operations
- 10+ campaigns per month
- Need custom features
- Want hands-on support

## How Billing Works

1. **Instant credit refill** - Credits apply immediately
2. **Billed monthly** - Recurring on signup date
3. **Cancel anytime** - No penalties, credits remain until period ends
4. **Prorated upgrades** - Switching mid-month? Pay the difference
5. **Downgrade at renewal** - Avoid mid-cycle disruption

## Upgrade Process

1. Go to [Subscriptions](/subscriptions)
2. Click **"Upgrade"** on desired plan
3. Enter payment details (Stripe secure checkout)
4. Confirm purchase
5. Credits apply instantly

**Payment methods:** Credit card, debit card, Apple Pay, Google Pay

## Frequently Asked Questions

**Q: What happens to my existing links if I downgrade?**
A: All links stay active forever. You just can't create new ones if you run out of credits.

**Q: Can I buy credits without subscribing?**
A: Not yet. Subscription is currently the only way to increase your credit allocation.

**Q: Do unused credits roll over?**
A: No. Credits reset monthly and don't accumulate.

**Q: Can I pause my subscription?**
A: Not directly, but you can cancel and re-subscribe anytime. Your links remain active even on Free.

**Q: Is there a team plan?**
A: Scale plan includes multi-user support. Contact us for custom team pricing.

**Q: What if I need more than 120,000 credits?**
A: Email support@ghoste.one for enterprise pricing.

## Try Before You Buy

Not sure? Here's a smart approach:
1. Start on Free
2. Create 5-10 links over 2 weeks
3. Monitor credit usage
4. Estimate monthly needs
5. Upgrade when you're confident

**No pressure.** Most successful artists start on Free and upgrade naturally when they hit limits.

Ready to upgrade? [View Plans](/subscriptions)
`
  },
  {
    id: 'credits-explained',
    title: 'How Credits Are Spent and Refilled',
    category: 'start-here',
    slug: 'credits-explained',
    description: 'Master the credit economy and maximize value',
    estimatedMinutes: 6,
    tags: ['credits', 'wallet', 'economy'],
    order: 5,
    screenshots: ['wallet_dashboard.svg', 'credit_transactions.svg'],
    relatedArticles: ['free-plan-credits', 'upgrading-plans'],
    content: `# How Credits Are Spent and Refilled

## The Credit Economy

Ghoste One uses a **credit system** instead of feature-based limits. This gives you flexibility to use what you need, when you need it.

### Why Credits?

Traditional SaaS models have rigid limits:
- "10 links per month" (but you need 15)
- "100 emails" (but you only use 20)

Credits let you **allocate resources dynamically**:
- Need more links? Spend credits on links.
- Need more AI help? Spend credits on AI.
- Heavy broadcast month? Allocate there.

## Credit Costs

### Link Creation
- **Smart Link:** 50 credits (platform aggregator)
- **One-Click Link:** 30 credits (direct redirect)
- **Pre-Save Link:** 75 credits (pre-save campaign)
- **Bio Link:** 40 credits (link in bio page)
- **Show Link:** 40 credits (event page)

### Fan Communication
- **Broadcast Send:** 100 credits (one-time message to list)
- **Sequence Enrollment:** 50 credits (automated follow-up series)
- **Template Usage:** FREE (reply to inbound DMs)

### Creative Tools
- **Cover Art Generation:** 150 credits (AI-generated artwork)
- **Music Visual:** 200 credits (lyric video / visual)
- **AI Request:** 20 credits (Ghoste AI question)

### Ads Manager
- **Campaign Creation:** 200 credits (Meta campaign setup)
- **Ad Creative Upload:** 50 credits (store creative assets)

### Splits
- **Split Invitation:** 30 credits (send negotiation invite)
- **PDF Generation:** 40 credits (finalize split sheet)

### Always Free
- Viewing analytics
- Editing existing links
- Clicking links (unlimited)
- Receiving fan messages
- Browsing the app

## How Credits Are Refilled

### Monthly Reset (Free Plan)
- Resets on the **1st of every month**
- Returns to 7,500 credits
- Unused credits **do not roll over**

Example:
- March 1: 7,500 credits
- March 15: 3,200 credits remaining
- April 1: **Back to 7,500 credits** (the 3,200 don't carry over)

### Paid Plans (Instant Refill)
When you upgrade:
1. Old balance is cleared
2. New balance applies immediately
3. Monthly reset continues on your billing date

Example:
- Free plan: 2,000 credits remaining
- Upgrade to Artist ($9): **15,000 credits instantly**
- Next refill: 30 days later

## Maximizing Your Credits

### Strategy 1: Batch Actions
Instead of:
- Creating 1 link per day (15 days = 750 credits)

Do this:
- Plan weekly, create 5 links at once
- Reduces AI suggestions and redundant work

### Strategy 2: Use the Right Link Type
- **Quick share?** Use One-Click (30 credits)
- **Full landing page?** Use Smart Link (50 credits)
- Don't overspend on features you don't need

### Strategy 3: Templates > Broadcasts
- **Template reply:** FREE (fan messages you first)
- **Broadcast:** 100 credits (you message fans)
- Encourage inbound engagement when possible

### Strategy 4: Reuse Assets
- Keep a library of cover art (don't regenerate)
- Save successful ad creative
- Clone previous link configs

### Strategy 5: Delete Unused Items
- Old test links? Delete them (no refund, but keeps workspace clean)
- Abandoned campaigns? Archive them
- Focus credits on active projects

## Tracking Usage

### Wallet Dashboard
Visit [Wallet](/wallet) to see:
- **Current balance** (real-time)
- **Transaction history** (last 30 days)
- **Cost breakdown** (by feature)
- **Next reset date**
- **Projected usage** (based on history)

### Transaction Log
Every action is logged:

\`\`\`
Mar 15, 3:42 PM - Smart Link created "Summer Vibes"
Cost: -50 credits
Balance: 6,450 credits
\`\`\`

### Low Balance Alerts
When you hit **1,000 credits remaining**, you'll see:
- Warning banner in app
- Suggested actions (upgrade or wait for reset)
- Usage recommendations

## Common Mistakes

### Mistake 1: Creating Too Many Test Links
**Problem:** "I made 20 test links trying different slugs"
**Cost:** 1,000 credits wasted
**Solution:** Plan your slug first. Use the preview before creating.

### Mistake 2: Over-using AI
**Problem:** "I asked the same question 10 different ways"
**Cost:** 200 credits
**Solution:** Ask comprehensive questions. Read guides first.

### Mistake 3: Broadcasting Too Often
**Problem:** "I sent 3 broadcasts this week"
**Cost:** 300 credits
**Solution:** Batch updates. Send weekly, not daily.

### Mistake 4: Regenerating Cover Art
**Problem:** "I didn't like the first version so I generated 10 more"
**Cost:** 1,500 credits
**Solution:** Be specific in your first prompt. Edit manually if needed.

## Planning Your Month

### Light User (2,000 credits/month)
- 5 Smart Links
- 10 One-Click Links
- 50 AI requests
- 5 broadcasts

**Recommendation:** Free plan is perfect

### Active User (8,000 credits/month)
- 20 Smart Links
- 30 One-Click Links
- 100 AI requests
- 20 broadcasts
- 5 cover art generations

**Recommendation:** Artist plan ($9/month)

### Heavy User (30,000 credits/month)
- 50+ links
- Multiple campaigns
- Daily AI usage
- Weekly broadcasts

**Recommendation:** Growth or Scale plan

## What If I Run Out?

### Options When at Zero
1. **Wait for reset** (Free plan users)
2. **Upgrade plan** (instant refill)
3. **Prioritize essentials** (finish the month with existing assets)

### What Still Works
- All existing links stay active
- Analytics keep tracking
- Fan messages still arrive
- You can edit existing items

### What Doesn't Work
- Creating new links
- Generating new creative
- Sending broadcasts
- Starting new campaigns

## Credits Never Expire

As long as your account is active:
- **Paid plans:** Credits remain until used
- **Free plans:** Reset monthly
- **Canceled plans:** Keep remaining credits until period ends

Example:
- Cancel Artist plan on March 15
- Plan ends April 15
- You keep credits until April 15
- After April 15, revert to Free plan (7,500 credits)

## Fair Use & Abuse Prevention

Ghoste monitors for:
- **Spam creation** (100+ links in an hour)
- **Bot usage** (automated API calls)
- **Reselling services** (creating links for others commercially)

If detected:
1. Warning email
2. Temporary rate limit
3. Account review
4. Possible suspension

**Normal use cases are always fine.** These rules target abuse, not legitimate high-volume users.

## Getting Help

Questions about credits?
- [Search this guide](/help)
- [Ask Ghoste AI](/studio/ghoste-ai)
- Email support@ghoste.one
- Check [Wallet](/wallet) for real-time data

Ready to master your credits? Start by checking your [Wallet balance](/wallet).
`
  },
  {
    id: 'ghoste-ai-manager',
    title: 'Using Ghoste AI Like a Manager',
    category: 'ghoste-studio',
    slug: 'ghoste-ai-manager',
    description: 'Get strategic advice, content ideas, and marketing guidance',
    estimatedMinutes: 7,
    tags: ['ai', 'ghoste-ai', 'strategy', 'manager'],
    order: 1,
    screenshots: ['ghoste_ai_chat.svg', 'ghoste_ai_actions.svg'],
    content: `# Using Ghoste AI Like a Manager

## What is Ghoste AI?

Ghoste AI is your intelligent artist manager, available 24/7. It understands music marketing, fan engagement, and release strategy. Ask questions, get content ideas, plan campaigns, and receive actionable advice.

## How to Access

1. Navigate to [Ghoste Studio](/studio)
2. Click **"Ghoste AI"** in the tabs
3. Start chatting

**Cost:** 20 credits per request

## What Ghoste AI Can Do

### Release Strategy
Ask about:
- "When should I release my next single?"
- "How do I plan a album rollout?"
- "Should I do a pre-save campaign?"

### Content Ideas
Get suggestions for:
- Social media posts
- Email newsletters
- Behind-the-scenes content
- Fan engagement tactics

### Marketing Advice
Questions like:
- "How do I grow my Instagram?"
- "Should I run ads for this release?"
- "What's a good ad budget for indie artists?"

### Technical Help
Ghoste knows the platform:
- "How do I create a Smart Link?"
- "Why isn't my Meta pixel tracking?"
- "What's the difference between Bio Links and One-Click Links?"

### Data Interpretation
Upload or describe your stats:
- "My click-through rate is 2%. Is that good?"
- "I got 500 pre-saves. What's next?"
- "How do I turn streams into ticket sales?"

## How to Ask Better Questions

### Bad Question
"Help me with marketing"

**Problem:** Too vague

### Good Question
"I'm releasing a single on May 1st. I have 5,000 Instagram followers and a $200 budget. What's the best way to maximize streams in the first week?"

**Why it's better:**
- Specific goal (maximize streams)
- Timeline (May 1st release)
- Resources (5k followers, $200)
- Context (single release)

## Example Conversations

### Example 1: Release Planning

**You:** "I'm releasing an EP in 2 months. What should I do first?"

**Ghoste AI:** "Here's your 8-week pre-release plan:

**Weeks 8-7 (Now):**
- Create Smart Links for all tracks
- Design cover art
- Record 3-5 behind-the-scenes videos

**Weeks 6-5:**
- Set up Pre-Save campaign
- Tease snippets on social media
- Email your list with first announcement

**Weeks 4-3:**
- Launch Meta ad campaign (target: pre-saves)
- Post daily content (lyrics, studio clips)
- Reach out to playlist curators

**Weeks 2-1:**
- Ramp up ad spend
- Send reminder emails
- Engage with every comment/DM

**Release Week:**
- Thank everyone who pre-saved
- Encourage playlist adds
- Share streaming links everywhere

Want me to break down any of these steps?"

### Example 2: Campaign Troubleshooting

**You:** "My ad campaign has 1,000 impressions but only 5 clicks. What's wrong?"

**Ghoste AI:** "That's a 0.5% click-through rate, which is low. Here's what to check:

**1. Creative Quality**
- Is your visual eye-catching?
- Does it match your music's vibe?
- Try A/B testing 2-3 versions

**2. Ad Copy**
- Is your headline compelling?
- Does it create urgency? ('New single out now')
- Include a clear call-to-action

**3. Targeting**
- Are you targeting fans of similar artists?
- Age range too broad?
- Geographic focus relevant?

**4. Offer**
- What's the incentive? ('Listen free', 'Pre-save now')
- Make the action easy

I recommend pausing the campaign, updating creative, and re-launching with tighter targeting. Want help with creative ideas?"

### Example 3: Content Strategy

**You:** "I post on Instagram daily but engagement is flat. Ideas?"

**Ghoste AI:** "Here's a proven 2-week content sprint:

**Monday:** Behind-the-scenes studio photo (caption: current project)
**Tuesday:** Poll: 'Which lyric hits hardest?' (snippet video)
**Wednesday:** Fan shoutout (repost a story, tag them)
**Thursday:** 'Ask Me Anything' story series (save answers for content)
**Friday:** New music drop or announcement
**Saturday:** Personal post (day off, show your life)
**Sunday:** Reflective carousel (3 photos + story from the week)

**Key changes:**
- Add more video (Reels > static posts)
- Ask questions (drive comments)
- Respond to every comment within 2 hours
- Use relevant hashtags (10-15 per post)

Try this for 2 weeks and track engagement. Report back?"

## Actions Ghoste AI Can Take

Ghoste AI doesn't just advise—it can execute:

### Create Links
**You:** "Create a Smart Link for my new song 'Midnight Drive'. Spotify URL is [link]"

**Ghoste AI:** "Creating Smart Link now... Done! Here's your link: ghoste.one/s/midnight-drive. I've added the Spotify URL. Want to add Apple Music too?"

### Generate Creative
**You:** "I need cover art for a dark trap beat"

**Ghoste AI:** "Generating now... [Image appears]. Here's a concept with dark purple/black tones, urban textures, and bold typography. Like it or want adjustments?"

### Draft Campaigns
**You:** "Write an email announcing my new single"

**Ghoste AI:** "Here's a draft:

**Subject:** My new single 'Midnight Drive' is here

Hey [Name],

I've been working on this one for months. 'Midnight Drive' is finally live.

It's about late-night clarity, chasing dreams, and not looking back. I think you'll connect with it.

Listen now: [Link]

If you vibe with it, add it to your playlist or share it with someone who needs it.

More coming soon.
- [Your Name]

Want me to adjust the tone?"

## Best Practices

### 1. Be Specific
Instead of: "Help me grow"
Say: "I want to grow from 1,000 to 5,000 Spotify monthly listeners in 3 months. What's the plan?"

### 2. Provide Context
Include:
- Current stats (followers, streams, email list size)
- Budget (if running ads)
- Timeline (release dates)
- Goals (streams, ticket sales, fan growth)

### 3. Ask Follow-Ups
Ghoste AI remembers your conversation:
- "Tell me more about targeting"
- "Break down that budget"
- "Show me an example"

### 4. Use It for Brainstorming
- "Give me 10 social post ideas"
- "What are 5 ways to monetize my fanbase?"
- "How do I stand out in a crowded genre?"

### 5. Let It Challenge You
Ghoste AI will push back if your plan has flaws:
- "That budget might not be enough"
- "Your timeline is too aggressive"
- "Consider this risk..."

## What Ghoste AI Can't Do

### Limitations
- Can't access your personal data (unless you share it in chat)
- Can't log into external platforms (Spotify, Meta) directly
- Can't send emails on your behalf (yet)
- Can't make financial decisions for you

### When to Ignore Advice
Ghoste AI is smart but not perfect:
- Your gut feeling about your art matters
- Cultural context AI might miss
- Unique opportunities only you see

**Use AI as a collaborator, not a dictator.**

## Credit Costs & Efficiency

Each question costs **20 credits**.

### Save Credits
- Ask compound questions: "What's the plan for release, content, and ads?"
- Read guides first (this help center is free)
- Batch questions: "Give me 5 ideas for X"

### When to Spend
- Strategic decisions (release planning)
- Complex troubleshooting (campaign not working)
- Time-sensitive advice (should I post this now?)

## Privacy & Data

Your conversations with Ghoste AI:
- Are **private** to your account
- Are **not sold or shared**
- Are used to **improve AI responses** (anonymized)
- Can be **deleted** anytime

To delete history:
1. Go to Ghoste AI settings
2. Click "Clear conversation history"
3. Confirm

## Getting the Most Value

### Daily Use Cases
- **Morning:** "What should I focus on today?"
- **Planning:** "I have 2 hours. Best use of time?"
- **Stuck:** "I don't know what to post. Ideas?"

### Weekly Check-Ins
- "Review this week's analytics with me"
- "What should I prioritize next week?"
- "Did I miss any opportunities?"

### Release Mode
- "It's release week. What's the hour-by-hour plan?"
- "How do I maximize first-day streams?"
- "What should I post at launch?"

## Combining AI with Human Help

Ghoste AI is tier 1 support. For complex issues:
1. Ask Ghoste AI first (fast, free)
2. If unresolved, email support (human review)
3. For strategic consulting, consider Scale plan (dedicated manager)

**AI for speed. Humans for nuance.**

Ready to ask your first question? Open [Ghoste AI](/studio/ghoste-ai) now.
`
  }
];

// Search function
export function searchGuides(query: string): GuideArticle[] {
  const lowerQuery = query.toLowerCase();
  return guideArticles.filter(article => {
    return (
      article.title.toLowerCase().includes(lowerQuery) ||
      article.description.toLowerCase().includes(lowerQuery) ||
      article.tags.some(tag => tag.includes(lowerQuery)) ||
      article.content.toLowerCase().includes(lowerQuery)
    );
  });
}

// Get articles by category
export function getArticlesByCategory(categoryId: string): GuideArticle[] {
  return guideArticles
    .filter(article => article.category === categoryId)
    .sort((a, b) => a.order - b.order);
}

// Get article by slug
export function getArticleBySlug(categoryId: string, slug: string): GuideArticle | undefined {
  return guideArticles.find(
    article => article.category === categoryId && article.slug === slug
  );
}

// Get related articles
export function getRelatedArticles(articleId: string): GuideArticle[] {
  const article = guideArticles.find(a => a.id === articleId);
  if (!article || !article.relatedArticles) return [];

  return article.relatedArticles
    .map(id => guideArticles.find(a => a.id === id))
    .filter((a): a is GuideArticle => a !== undefined);
}
