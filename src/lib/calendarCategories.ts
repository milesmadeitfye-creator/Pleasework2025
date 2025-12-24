/**
 * Calendar Event Category Styles
 *
 * Maps event categories to default colors and icons.
 * Used by Calendar UI and Ghoste AI for consistent event styling.
 */

export type EventCategory = 'content' | 'release' | 'ads' | 'tour' | 'admin' | 'promo' | 'meeting';

export interface CategoryStyle {
  color: string;
  bg: string;
  icon: string;
  label: string;
}

export const CATEGORY_STYLES: Record<EventCategory, CategoryStyle> = {
  content: {
    color: '#e5e7eb',
    bg: '#4c1d95',
    icon: '🎬',
    label: 'Content',
  },
  release: {
    color: '#e5e7eb',
    bg: '#db2777',
    icon: '💿',
    label: 'Release',
  },
  ads: {
    color: '#e5e7eb',
    bg: '#1d4ed8',
    icon: '📈',
    label: 'Ads',
  },
  tour: {
    color: '#e5e7eb',
    bg: '#16a34a',
    icon: '🎤',
    label: 'Tour',
  },
  admin: {
    color: '#e5e7eb',
    bg: '#4b5563',
    icon: '📋',
    label: 'Admin',
  },
  promo: {
    color: '#e5e7eb',
    bg: '#ea580c',
    icon: '📣',
    label: 'Promo',
  },
  meeting: {
    color: '#e5e7eb',
    bg: '#0891b2',
    icon: '👥',
    label: 'Meeting',
  },
};

/**
 * Get style for a category, with fallback to default
 */
export function getCategoryStyle(category: string | null | undefined): CategoryStyle {
  if (!category) {
    return CATEGORY_STYLES.content;
  }

  const normalizedCategory = category.toLowerCase() as EventCategory;
  return CATEGORY_STYLES[normalizedCategory] ?? CATEGORY_STYLES.content;
}

/**
 * Get all available categories for dropdowns
 */
export function getAllCategories(): Array<{ value: EventCategory; style: CategoryStyle }> {
  return Object.entries(CATEGORY_STYLES).map(([value, style]) => ({
    value: value as EventCategory,
    style,
  }));
}
