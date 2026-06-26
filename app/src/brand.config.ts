/**
 * Brand + product configuration.
 *
 * This is the single seam for per-device builds and white-labeling. The Inspire
 * fork ships the same code with a different brand object; a partner re-skin is a
 * token + string swap here. Nothing else in the UI hard-codes a product name.
 */
export interface Brand {
  maker: string;
  product: string;
  device: string;
  tagline: string;
  /** Short support / docs URL shown in the about + help surfaces. */
  supportUrl: string;
}

export const brand: Brand = {
  maker: "RoboStore",
  product: "RoboStore Studio",
  device: "BrainCo Revo2",
  tagline: "Control, learn, and develop with your hand.",
  supportUrl: "https://robostore.com/support",
};
