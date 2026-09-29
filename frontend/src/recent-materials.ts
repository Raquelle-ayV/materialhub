const LIMIT = 100;
// Never migrate the old shared key into an account: its owner cannot be known.
// Keep it untouched so existing browser data remains recoverable.
const keyFor = (userId: number | null) => `rematerial.recent-material-ids.v2:${userId === null ? 'guest' : `user:${userId}`}`;

export function recentMaterialIds(userId: number | null): number[] {
  try {
    const saved=localStorage.getItem(keyFor(userId));
    const value: unknown = JSON.parse(saved || '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberMaterial(id: number, userId: number | null) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify([id, ...recentMaterialIds(userId).filter(value => value !== id)].slice(0, LIMIT)));
  } catch {
    // Browsing remains usable when browser storage is disabled or full.
  }
}
