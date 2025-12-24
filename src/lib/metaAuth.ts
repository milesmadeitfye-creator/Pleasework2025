import { FACEBOOK_APP_ID, FACEBOOK_REDIRECT_URI } from '../config/meta';

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const state = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('meta_oauth_state', state);
  return state;
}

export function buildMetaLoginUrl(): string {
  if (!FACEBOOK_APP_ID) {
    return '#';
  }

  const state = generateState();

  const scope = 'ads_read,ads_management,business_management,pages_read_engagement,pages_show_list';

  return `https://www.facebook.com/v22.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}`;
}

export function verifyState(receivedState: string): boolean {
  const savedState = localStorage.getItem('meta_oauth_state');
  if (savedState && savedState === receivedState) {
    localStorage.removeItem('meta_oauth_state');
    return true;
  }
  return false;
}
