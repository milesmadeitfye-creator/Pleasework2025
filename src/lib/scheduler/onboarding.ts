export type OnboardingEventInput = {
  userId: string;
  now?: Date;
};

export type SchedulerEventInsert = {
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  source: string;
  scheduled_at: string;
  duration_minutes: number;
  is_completed: boolean;
};

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

export function buildDefaultOnboardingSchedule(
  params: OnboardingEventInput
): SchedulerEventInsert[] {
  const { userId } = params;
  const base = params.now ?? new Date();

  const events: SchedulerEventInsert[] = [];

  const push = (
    hoursOffset: number,
    title: string,
    description: string,
    category: string = "onboarding"
  ) => {
    const scheduledAt = addHours(base, hoursOffset);
    events.push({
      user_id: userId,
      title,
      description,
      category,
      source: "auto_onboarding",
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: 30,
      is_completed: false,
    });
  };

  push(
    0,
    "Welcome to Ghoste One",
    "You're in. Over the next 7 days, we'll help you set up your full music command center."
  );

  push(
    0,
    "Confirm your email",
    "Verify your email to unlock analytics, smart links, and Ghoste AI."
  );
  push(
    1,
    "Complete your artist profile",
    "Set your artist name, genre, profile picture, and socials so Ghoste can brand everything for you."
  );

  push(
    24,
    "Connect your Spotify Artist account",
    "Connect Spotify to activate analytics, pre-save links, and release tracking."
  );
  push(
    27,
    "Connect TikTok / Instagram",
    "Connect socials so Ghoste can track content performance and help with content ideas."
  );

  push(
    48,
    "Create your first Ghoste Smart Link",
    "Build your first music hub with streaming buttons, cover art, and bio in one link."
  );

  push(
    72,
    "Set up Email + SMS capture",
    "Turn your smart link into a fan capture page with email/SMS opt-in."
  );

  push(
    96,
    "Generate your first Ghoste AI campaign",
    "Use Ghoste AI to design your first email or content plan using your artist profile."
  );

  push(
    120,
    "Add your first offer or negotiation",
    "Set up a feature fee, collaboration offer, or split negotiation inside Ghoste."
  );

  push(
    144,
    "Complete your Week 1 review",
    "Review your progress, check your growth, and set goals for the next month."
  );

  return events;
}
