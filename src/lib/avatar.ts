// A filler's own little figure next to their level (Xin, 19-10-2026), put
// together from a few choices. It is kept on the person's account
// (user_metadata.avatar): theirs to change, read back through cleanLook so a
// stored value from an older version or a hand-made one can never break a page.

export const SKINS = ["#F6D3B8", "#ECBC95", "#D9A274", "#B97B51", "#8D5A3A", "#5E3B26"] as const;
export const HAIR_COLORS = ["#1F1A17", "#4A2E1F", "#7A4B2A", "#D2AC62", "#A8461F", "#A3A3A3"] as const;
export const SHIRTS = ["#1E1E22", "#B5862A", "#2F5E9E", "#2E7D5B", "#C24638", "#ECECEF"] as const;
export const HAIR_STYLES = ["short", "spiky", "curly", "long", "bun", "none"] as const;
export const BEARDS = ["none", "stubble", "full", "moustache"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Beard = (typeof BEARDS)[number];

export type AvatarLook = {
  /** Indexes into SKINS, HAIR_COLORS and SHIRTS. */
  skin: number;
  hair: HairStyle;
  hairColor: number;
  beard: Beard;
  shirt: number;
  glasses: boolean;
};

/** Where the editor starts for someone who never chose. */
export const DEFAULT_LOOK: AvatarLook = { skin: 1, hair: "short", hairColor: 0, beard: "none", shirt: 1, glasses: false };

const index = (value: unknown, length: number) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) < length ? (value as number) : null);

/** A stored look, made safe; null when nothing (usable) was ever chosen. */
export function cleanLook(raw: unknown): AvatarLook | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const skin = index(value.skin, SKINS.length);
  if (skin === null) return null;
  return {
    skin,
    hair: HAIR_STYLES.includes(value.hair as HairStyle) ? (value.hair as HairStyle) : DEFAULT_LOOK.hair,
    hairColor: index(value.hairColor, HAIR_COLORS.length) ?? DEFAULT_LOOK.hairColor,
    beard: BEARDS.includes(value.beard as Beard) ? (value.beard as Beard) : DEFAULT_LOOK.beard,
    shirt: index(value.shirt, SHIRTS.length) ?? DEFAULT_LOOK.shirt,
    glasses: value.glasses === true,
  };
}
