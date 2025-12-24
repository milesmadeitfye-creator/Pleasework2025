// IMPORTANT: Do NOT change your actual marketing flow.
// This file is just an adapter so the scheduler can read the existing steps.

// If you already have a config function/file, import it here and map it.
// For now we provide a simple pattern: return step data for (sequence_key, step).

type Step = {
  subject: string;
  html: string;
  text?: string;
  delay_minutes: number; // delay until next step
};

// Import the existing automation config
import { EMAIL_AUTOMATION_STEPS } from "./_emailAutomationConfig";

export function getMarketingAutomationStep(sequence_key: string, stepNumber: number, context: Record<string, any>): Step | null {
  // The EMAIL_AUTOMATION_STEPS is an array indexed from 0
  // stepNumber is 1-based, so we need to adjust
  const stepIndex = stepNumber - 1;

  if (stepIndex < 0 || stepIndex >= EMAIL_AUTOMATION_STEPS.length) {
    return null; // No more steps
  }

  const step = EMAIL_AUTOMATION_STEPS[stepIndex];
  if (!step) return null;

  // Build subject and body using fallback values
  // In production, you could call AI here to generate personalized content
  const subject = step.fallbackSubject || "Update from Ghoste One";

  // Use fallback body for now (in production, could use AI with bodyPrompt)
  let html = step.fallbackBody || "";
  let text = step.fallbackBody || "";

  // Simple variable replacement
  const firstName = context.first_name || context.firstName || "there";
  html = html.replace(/\{\{first_name\}\}/g, firstName);
  text = text.replace(/\{\{first_name\}\}/g, firstName);

  // Convert plain text to HTML if needed
  if (html && !html.includes("<")) {
    html = html.split("\n").map(line => {
      if (line.trim()) return `<p>${line}</p>`;
      return "<br>";
    }).join("\n");
  }

  return {
    subject,
    html,
    text,
    delay_minutes: step.delayMinutes || 1440, // default 24h if missing
  };
}
