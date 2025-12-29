/**
 * Phone number utilities for E.164 formatting and validation
 * Supports US and international phone numbers
 */

export interface PhoneValidationResult {
  isValid: boolean;
  e164?: string;
  error?: string;
}

/**
 * Normalize a phone number to E.164 format
 * Supports:
 * - 10-digit US numbers: 5551234567 -> +15551234567
 * - Numbers with country code: +15551234567 -> +15551234567
 * - Numbers with 1 prefix: 15551234567 -> +15551234567
 */
export function normalizeToE164(phone: string, defaultCountryCode: string = '1'): PhoneValidationResult {
  if (!phone || phone.trim() === '') {
    return {
      isValid: false,
      error: 'Phone number is required',
    };
  }

  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.length === 0) {
    return {
      isValid: false,
      error: 'Invalid phone number',
    };
  }

  let e164: string;

  if (digitsOnly.length === 10) {
    e164 = `+${defaultCountryCode}${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    e164 = `+${digitsOnly}`;
  } else if (digitsOnly.startsWith(defaultCountryCode) && digitsOnly.length === 11) {
    e164 = `+${digitsOnly}`;
  } else if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    e164 = digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly}`;
  } else {
    return {
      isValid: false,
      error: `Invalid phone number length (${digitsOnly.length} digits)`,
    };
  }

  if (!isValidE164(e164)) {
    return {
      isValid: false,
      error: 'Invalid phone number format',
    };
  }

  return {
    isValid: true,
    e164,
  };
}

/**
 * Validate E.164 format
 * Must start with + and have 7-15 digits
 */
export function isValidE164(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  return e164Regex.test(phone);
}

/**
 * Format phone number for display
 * +15551234567 -> (555) 123-4567
 */
export function formatPhoneForDisplay(e164: string): string {
  if (!e164) return '';

  const digitsOnly = e164.replace(/\D/g, '');

  if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
    const areaCode = digitsOnly.slice(1, 4);
    const prefix = digitsOnly.slice(4, 7);
    const lineNumber = digitsOnly.slice(7, 11);
    return `(${areaCode}) ${prefix}-${lineNumber}`;
  }

  return e164;
}

/**
 * Check if phone number is US/Canada (+1)
 */
export function isUSPhone(e164: string): boolean {
  return e164.startsWith('+1') && e164.length === 12;
}

/**
 * Extract country code from E.164
 * +15551234567 -> 1
 */
export function extractCountryCode(e164: string): string {
  if (!e164.startsWith('+')) return '';

  if (e164.startsWith('+1')) return '1';

  const match = e164.match(/^\+(\d{1,3})/);
  return match ? match[1] : '';
}
