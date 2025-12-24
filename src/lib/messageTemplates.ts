export type EmailTemplate = {
  id: string;
  label: string;
  subject: string;
  html: string;
};

export type SmsTemplate = {
  id: string;
  label: string;
  text: string;
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "welcome_list",
    label: "Welcome / Thanks for Joining",
    subject: "Welcome to the {{artist_name}} inner circle 💿",
    html: `
      <p>Hey {{first_name}},</p>
      <p>Thanks for joining the official {{artist_name}} list! You'll be the first to know about new music, shows, and exclusive drops.</p>
      <p>To say thanks, here's something just for you: <a href="{{link}}">tap here to unlock your exclusive content</a>.</p>
      <p>Talk soon,<br/>{{artist_name}}</p>
    `,
  },
  {
    id: "new_release",
    label: "New Release Announcement",
    subject: "New music just dropped: {{release_title}} 🎧",
    html: `
      <p>Hey {{first_name}},</p>
      <p>My new {{release_type}} <strong>{{release_title}}</strong> is officially out now.</p>
      <p>Listen here: <a href="{{link}}">stream it on your favorite platform</a>.</p>
      <p>Reply and let me know your favorite track.</p>
      <p>Appreciate you,<br/>{{artist_name}}</p>
    `,
  },
  {
    id: "tour_announce",
    label: "Tour / Show Announcement",
    subject: "{{city_name}} – I'm pulling up 🎟️",
    html: `
      <p>What's good {{first_name}}?</p>
      <p>I just announced a new show in <strong>{{city_name}}</strong> on <strong>{{date}}</strong>.</p>
      <p>Grab your tickets here before they're gone: <a href="{{link}}">get tickets</a>.</p>
      <p>Can't wait to see you in person.<br/>{{artist_name}}</p>
    `,
  },
  {
    id: "exclusive_drop",
    label: "Exclusive Content Drop",
    subject: "Early access just for you 🔑",
    html: `
      <p>Hey {{first_name}},</p>
      <p>You're getting this before anyone else. I just dropped something exclusive for the list.</p>
      <p><a href="{{link}}">Click here for early access</a> to unreleased music, behind-the-scenes, and more.</p>
      <p>Keep this between us 😉<br/>{{artist_name}}</p>
    `,
  },
  {
    id: "merch_drop",
    label: "Merch / Sale Announcement",
    subject: "New {{artist_name}} merch just landed 🛒",
    html: `
      <p>Hey {{first_name}},</p>
      <p>New {{artist_name}} merch just went live.</p>
      <p>Shop the drop here: <a href="{{link}}">view the collection</a>.</p>
      <p>Use code <strong>FAN10</strong> at checkout for a special discount.</p>
      <p>Thank you for supporting,<br/>{{artist_name}}</p>
    `,
  },
];

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: "sms_new_release",
    label: "New Release",
    text:
      "Yo {{first_name}}, my new {{release_type}} '{{release_title}}' just dropped 🎧 Listen here: {{link}}",
  },
  {
    id: "sms_show",
    label: "Show / Tour Stop",
    text:
      "{{first_name}}! I'm live in {{city_name}} on {{date}} 🎟️ Grab your ticket: {{link}}",
  },
  {
    id: "sms_exclusive",
    label: "Exclusive Drop",
    text:
      "Exclusive for you {{first_name}}: early access to new {{artist_name}} music 🔑 Tap in: {{link}}",
  },
  {
    id: "sms_merch",
    label: "Merch / Store",
    text:
      "New {{artist_name}} merch just went live 🛒 Shop now + code FAN10 at checkout: {{link}}",
  },
  {
    id: "sms_reminder",
    label: "Release / Show Reminder",
    text:
      "Reminder {{first_name}}: {{event_name}} is happening {{date_or_time}}. Don't miss it 👉 {{link}}",
  },
];
