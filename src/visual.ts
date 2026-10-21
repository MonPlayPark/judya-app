// Typed access to the visual-refresh images in src/assets/visual (spec 3). SVG is the main format.
// To change the format later, only the glob patterns below change.

export const ICON_NAMES = [
  'nav-home', 'nav-medicines', 'nav-members', 'nav-settings', 'today-meds', 'restock', 'add-medicine',
  'expired', 'expiring-soon', 'allergy', 'insurance', 'prepare-meds', 'order', 'share-doctor',
  'rx-medicine', 'household-medicine', 'adjust-dose', 'stop-medicine', 'history', 'line-message',
  'copy', 'call-shop', 'delivery-fee', 'expiry-alert', 'shops', 'order-template', 'backup', 'delete',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const AVATAR_NAMES = [
  'avatar-01', 'avatar-02', 'avatar-03', 'avatar-04', 'avatar-05', 'avatar-06',
  'avatar-07', 'avatar-08', 'avatar-09', 'avatar-10', 'avatar-11', 'avatar-12',
] as const;
export type AvatarName = (typeof AVATAR_NAMES)[number];

export const MASCOT_POSES = ['wave', 'pill', 'list', 'heart', 'point', 'ok', 'phone', 'sleep'] as const;
export type MascotPose = (typeof MASCOT_POSES)[number];

type UrlMap = Record<string, string>;
const icons: UrlMap = import.meta.glob<string>('./assets/visual/icons/*.svg', { eager: true, query: '?url', import: 'default' });
const avatars: UrlMap = import.meta.glob<string>('./assets/visual/avatars/*.svg', { eager: true, query: '?url', import: 'default' });
const mascot: UrlMap = import.meta.glob<string>('./assets/visual/mascot/*.svg', { eager: true, query: '?url', import: 'default' });

function pick(map: UrlMap, folder: string, name: string): string {
  const url = map[`./assets/visual/${folder}/${name}.svg`];
  if (!url) throw new Error(`missing image ${folder}/${name}`);
  return url;
}

export const iconUrl = (name: IconName): string => pick(icons, 'icons', name);
export const avatarUrl = (name: AvatarName): string => pick(avatars, 'avatars', name);
export const mascotUrl = (pose: MascotPose): string => pick(mascot, 'mascot', pose);

/** Avatar of the n-th member in the list (0-based): first member = avatar-01, wraps after 12. Nothing is stored. */
export const avatarForIndex = (index: number): AvatarName => AVATAR_NAMES[index % AVATAR_NAMES.length] as AvatarName;
