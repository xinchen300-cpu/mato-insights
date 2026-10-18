import { HAIR_COLORS, SHIRTS, SKINS, type AvatarLook } from "@/lib/avatar";

const INK = "#2A2520";

/**
 * A filler's own figure, head and shoulders, drawn from their choices. Square,
 * so it sits in a round frame; the frame (background, clipping) is the caller's.
 */
export function FillerAvatar({ look, className }: { look: AvatarLook; className?: string }) {
  const skin = SKINS[look.skin];
  const hair = HAIR_COLORS[look.hairColor];
  const shirt = SHIRTS[look.shirt];
  // A collar that shows on any sweater, the white one included.
  const collar = look.shirt === SHIRTS.length - 1 ? "#C9C9CF" : "#F4F4F6";
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      {/* Neck and shoulders */}
      <rect x="51" y="72" width="18" height="24" rx="7" fill={skin} />
      <rect x="51" y="72" width="18" height="10" rx="5" fill="#000" opacity="0.08" />
      <path d="M14 120 C15 102 30 92 48 89 L60 100 L72 89 C90 92 105 102 106 120 Z" fill={shirt} />
      <path d="M47 89 L60 101 L73 89" fill="none" stroke={collar} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Long hair falls behind the head, over the shoulders */}
      {look.hair === "long" && (
        <path d="M31 46 C31 25 45 16 60 16 C75 16 89 25 89 46 L91 92 C85 96 79 95 76 90 L78 56 L42 56 L44 90 C41 95 35 96 29 92 Z" fill={hair} />
      )}
      {look.hair === "bun" && <circle cx="60" cy="13" r="9.5" fill={hair} />}

      {/* Ears and head */}
      <circle cx="32.5" cy="52" r="6" fill={skin} />
      <circle cx="87.5" cy="52" r="6" fill={skin} />
      <ellipse cx="60" cy="50" rx="27" ry="30" fill={skin} />

      {/* Beard, under the face's features */}
      {look.beard === "stubble" && (
        <path d="M34 56 C35 74 46 82 60 82 C74 82 85 74 86 56 C82 68 72 73 60 73 C48 73 38 68 34 56 Z" fill={hair} opacity="0.32" />
      )}
      {look.beard === "full" && (
        <path
          d="M33 50 C33 76 45 86 60 86 C75 86 87 76 87 50 C84 59 80 63 74 61 C70 59 65 59 60 59 C55 59 50 59 46 61 C40 63 36 59 33 50 Z"
          fill={hair}
        />
      )}

      {/* Hair on top */}
      {(look.hair === "short" || look.hair === "bun") && (
        <path d="M33 46 C32 26 45 17 60 17 C76 17 89 26 87 46 C83 36 73 31 60 31 C47 31 37 36 33 46 Z" fill={hair} />
      )}
      {look.hair === "spiky" && (
        <path
          d="M31 50 C27 34 31 21 40 16 L44 9 L50 15 L56 6 L62 14 L69 7 L73 16 L81 12 L82 21 C90 27 92 39 89 50 C85 38 74 32 60 32 C46 32 35 38 31 50 Z"
          fill={hair}
        />
      )}
      {look.hair === "curly" && (
        <g fill={hair}>
          <path d="M32 48 C31 28 45 18 60 18 C75 18 89 28 88 48 C84 38 74 33 60 33 C46 33 36 38 32 48 Z" />
          <circle cx="35" cy="40" r="8" />
          <circle cx="40" cy="28" r="9" />
          <circle cx="51" cy="21" r="9" />
          <circle cx="63" cy="19" r="9" />
          <circle cx="75" cy="23" r="9" />
          <circle cx="83" cy="32" r="8" />
          <circle cx="86" cy="42" r="7" />
        </g>
      )}
      {look.hair === "long" && <path d="M33 48 C33 29 45 21 60 21 C75 21 87 29 87 48 C80 37 70 32 60 32 C50 32 40 37 33 48 Z" fill={hair} />}

      {/* Face */}
      <g fill="none" stroke={look.hair === "none" ? INK : hair} strokeWidth="2.6" strokeLinecap="round" opacity={look.hair === "none" ? 0.6 : 1}>
        <path d="M42 41 Q48 38 54 41" />
        <path d="M66 41 Q72 38 78 41" />
      </g>
      <ellipse cx="48" cy="50" rx="3.2" ry="3.8" fill={INK} />
      <ellipse cx="72" cy="50" rx="3.2" ry="3.8" fill={INK} />
      <circle cx="49.2" cy="48.6" r="1" fill="#fff" />
      <circle cx="73.2" cy="48.6" r="1" fill="#fff" />
      <path d="M60 52 Q57 59 61 60" fill="none" stroke="#000" strokeOpacity="0.2" strokeWidth="2" strokeLinecap="round" />
      {look.beard === "moustache" && <path d="M49 63 Q55 58.5 60 61.5 Q65 58.5 71 63 Q65 66.5 60 64.5 Q55 66.5 49 63 Z" fill={hair} />}
      <path d="M51 66.5 Q60 74 69 66.5 Q60 69.5 51 66.5 Z" fill={look.beard === "full" ? "#D98C7A" : "#8A3A2E"} />

      {look.glasses && (
        <g fill="#fff" fillOpacity="0.18" stroke={INK} strokeWidth="2">
          <rect x="39.5" y="43.5" width="17" height="13" rx="4.5" />
          <rect x="63.5" y="43.5" width="17" height="13" rx="4.5" />
          <path d="M56.5 49 Q60 47 63.5 49" fill="none" />
        </g>
      )}
    </svg>
  );
}
