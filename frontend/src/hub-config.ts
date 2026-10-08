/**
 * Material Hub details shown in the "Go to the Hub" steps and on material pages.
 * Fill these in yourself. Anything left empty is hidden — nothing shows "coming soon".
 * Put images in public/hub/ and reference them as '/hub/<file>'.
 */
export const hubConfig = {
  name: 'Material Hub',
  /** e.g. 'Building 17, Level 1, next to the model workshop' */
  location: 'Building 17 · L1',
  /** e.g. 'Mon–Fri 9:00–18:00' */
  hours: '',
  /** Route map image, e.g. '/hub/route-map.jpg' */
  routeMap: '',
  /** Photo of each zone, keyed by zone name, e.g. { 'Board & Foam': '/hub/zones/board-foam.jpg' } */
  zonePhotos: {} as Record<string, string>,
};
