import type { AdsContext } from './getAdsContext';

export function summarizeMetaInsights(context: AdsContext): string {
  const { meta, summary } = context;

  if (!meta.connected) {
    return 'Meta Ads not connected. Connect to track campaign performance.';
  }

  if (meta.errors.length > 0 && meta.campaigns.length === 0) {
    return `Meta connected but data unavailable: ${meta.errors[0]}`;
  }

  if (meta.campaigns.length === 0) {
    return 'Meta connected. No campaigns found yet - ready to launch your first campaign.';
  }

  const activeCampaigns = meta.campaigns.filter(c => c.status === 'ACTIVE').length;
  const totalSpend = summary.spend7d.toFixed(2);
  const avgCtr = summary.ctr7d.toFixed(2);
  const avgCpc = summary.cpc7d.toFixed(2);

  return `Meta Ads: ${activeCampaigns} active campaigns, $${totalSpend} spent (7d), ${avgCtr}% CTR, $${avgCpc} CPC avg. ${summary.topWinners.length} winners, ${summary.topLosers.length} need attention.`;
}

export function summarizeGhosteAds(context: AdsContext): string {
  const { ghoste } = context;

  if (ghoste.adsCreatedInGhoste.length === 0) {
    return 'No Ghoste-created ad campaigns yet.';
  }

  const activeDrafts = ghoste.drafts.length;
  const total = ghoste.adsCreatedInGhoste.length;
  const lastCreated = ghoste.lastCreatedAt
    ? new Date(ghoste.lastCreatedAt).toLocaleDateString()
    : 'Unknown';

  return `Ghoste Ads: ${total} total campaigns (${activeDrafts} drafts). Last created: ${lastCreated}. ${ghoste.rules.length} autopilot rules configured.`;
}

export function summarizeSmartlinkPerformance(context: AdsContext): string {
  const { performance } = context;

  if (performance.smartlinkClicksByDay.length === 0) {
    return 'No SmartLink activity in the last 7 days.';
  }

  const totalClicks = performance.smartlinkClicksByDay.reduce((sum, d) => sum + d.clicks, 0);
  const avgDaily = (totalClicks / 7).toFixed(0);
  const topLinks = performance.smartlinkTopLinks.slice(0, 3).map(l => l.slug).join(', ');

  return `SmartLinks: ${totalClicks} clicks (7d), ~${avgDaily}/day avg. Top: ${topLinks}`;
}

export function formatAdsContextForAI(context: AdsContext): string {
  const sections: string[] = [];

  // Meta section
  sections.push('=== META ADS DATA ===');
  if (context.meta.connected) {
    sections.push(`Status: CONNECTED (${context.meta.adAccounts.length} ad accounts)`);

    if (context.meta.campaigns.length > 0) {
      sections.push(`\nCampaigns (${context.meta.campaigns.length} total):`);
      context.meta.campaigns.slice(0, 10).forEach(c => {
        sections.push(
          `- ${c.name} (${c.status}): ${c.impressions || 0} imp, ${c.clicks || 0} clicks, ${c.ctr?.toFixed(2) || 0}% CTR, $${c.cpc?.toFixed(2) || 0} CPC, $${c.spend?.toFixed(2) || 0} spent`
        );
      });

      if (context.meta.campaigns.length > 10) {
        sections.push(`... and ${context.meta.campaigns.length - 10} more campaigns`);
      }
    } else {
      sections.push('No campaigns found. User may need to create their first campaign.');
    }

    if (context.meta.errors.length > 0) {
      sections.push(`\nIssues: ${context.meta.errors.join(', ')}`);
    }

    sections.push(`\nLast sync: ${context.meta.lastSyncAt || 'Never'}`);
  } else {
    sections.push('Status: NOT CONNECTED');
    sections.push('User should connect Meta Ads to unlock campaign tracking.');
    if (context.meta.errors.length > 0) {
      sections.push(`Errors: ${context.meta.errors.join(', ')}`);
    }
  }

  // Ghoste Ads section
  sections.push('\n=== GHOSTE ADS (Internal) ===');
  if (context.ghoste.adsCreatedInGhoste.length > 0) {
    sections.push(`${context.ghoste.adsCreatedInGhoste.length} campaigns created in Ghoste`);
    sections.push(`${context.ghoste.drafts.length} drafts pending`);
    if (context.ghoste.rules.length > 0) {
      sections.push(`${context.ghoste.rules.length} autopilot rules active`);
    }
  } else {
    sections.push('No Ghoste-created campaigns yet.');
  }

  // Performance section
  sections.push('\n=== SMARTLINK PERFORMANCE ===');
  if (context.performance.smartlinkClicksByDay.length > 0) {
    const totalClicks = context.performance.smartlinkClicksByDay.reduce((sum, d) => sum + d.clicks, 0);
    sections.push(`${totalClicks} clicks in last 7 days`);

    if (context.performance.smartlinkTopLinks.length > 0) {
      sections.push(`Top links: ${context.performance.smartlinkTopLinks.map(l => `${l.slug} (${l.clicks})`).join(', ')}`);
    }
  } else {
    sections.push('No SmartLink activity in last 7 days.');
  }

  // Summary section
  sections.push('\n=== SUMMARY ===');
  sections.push(`7-day totals: $${context.summary.spend7d.toFixed(2)} spend, ${context.summary.clicks7d} clicks`);
  if (context.summary.ctr7d > 0) {
    sections.push(`Average: ${context.summary.ctr7d.toFixed(2)}% CTR, $${context.summary.cpc7d.toFixed(2)} CPC`);
  }

  if (context.summary.topWinners.length > 0) {
    sections.push(`\nTop Performers:`);
    context.summary.topWinners.forEach(w => {
      sections.push(`- ${w.name}: ${w.ctr.toFixed(2)}% CTR, $${w.cpc.toFixed(2)} CPC`);
    });
  }

  if (context.summary.topLosers.length > 0) {
    sections.push(`\nNeed Attention:`);
    context.summary.topLosers.forEach(l => {
      sections.push(`- ${l.name}: ${l.ctr.toFixed(2)}% CTR, $${l.cpc.toFixed(2)} CPC`);
    });
  }

  if (context.summary.opportunities.length > 0) {
    sections.push(`\nOpportunities:`);
    context.summary.opportunities.forEach(o => sections.push(`- ${o}`));
  }

  return sections.join('\n');
}

export function getConnectionStatusMessage(context: AdsContext): {
  meta: string;
  ghoste: string;
  tracking: string;
} {
  return {
    meta: context.meta.connected
      ? `Connected (${context.meta.campaigns.length} campaigns, ${context.meta.adAccounts.length} accounts)`
      : 'Not connected',
    ghoste: `${context.ghoste.adsCreatedInGhoste.length} campaigns (${context.ghoste.drafts.length} drafts)`,
    tracking: `${context.performance.smartlinkClicksByDay.reduce((sum, d) => sum + d.clicks, 0)} events (7d)`,
  };
}
