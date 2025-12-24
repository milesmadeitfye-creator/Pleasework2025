export const ROUTE_KEY = "__ghoste_last_route_v1";

export function writeRoute(note: string) {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify({
      time: new Date().toISOString(),
      path: location.pathname + location.search + location.hash,
      note
    }));
  } catch {}
}
