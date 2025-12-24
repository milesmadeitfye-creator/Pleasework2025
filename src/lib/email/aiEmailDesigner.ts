import { renderGhosteServiceEmail } from '../../utils/serviceEmailTemplate';

export type EmailDesignGoal =
  | "new_release"
  | "tour"
  | "newsletter"
  | "announcement"
  | "winback"
  | "generic";

export type EmailTone = "hype" | "chill" | "emotional" | "informative" | "urgent";

export type EmailDesignRequest = {
  userId: string;
  artistName?: string;
  campaignGoal: EmailDesignGoal;
  tone: EmailTone;
  audienceDescription?: string;
  campaignTitleHint?: string;
  mainMessageNotes?: string;

  links?: {
    spotify?: string;
    apple?: string;
    youtube?: string;
    presave?: string;
    website?: string;
  };

  brand?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    accentColor?: string;
    textColor?: string;
    logoUrl?: string;
  };

  heroImageUrl?: string;

  socials?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
  };
};

export type EmailDesignResponse = {
  subject: string;
  previewText: string;
  html: string;
};

/**
 * Fallback HTML generator for system emails when AI generation fails.
 * Uses Ghoste service email template (for emails from noreply@ghoste.one).
 * DO NOT use for artist-to-fan campaigns.
 */
export function fallbackPlainHtmlFromBody(text: string, subject?: string): string {
  // Convert plain text to HTML paragraphs
  const paragraphs = (text || "")
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p style="margin:0 0 12px 0;">${p.trim().replace(/\n/g, '<br />')}</p>`)
    .join('');

  // Use Ghoste service email template for system emails
  return renderGhosteServiceEmail({
    headline: subject || 'Update from Ghoste',
    bodyHtml: paragraphs || '<p>No content</p>',
    ctaLabel: 'Visit Ghoste One',
    ctaUrl: 'https://ghoste.one/dashboard',
    managePrefsUrl: 'https://ghoste.one/account/notifications',
    unsubscribeUrl: 'https://ghoste.one/unsubscribe',
    firstName: null,
  });
}
