// Where to reach MATO (24-10-2026, Xin: "bij settings hulp of contact bij zet dat ze bij mato terechtkomen"). The phone
// number for help is SUPPORT_PHONE in plans.ts: shown only once it is filled in. Pure, without imports.

export const MATO_EMAIL = "info@matoautomaat.be";
export const MATO_CONTACT_URL = "https://www.matoautomaat.be/contact";
/** IJzerlaan 13, 8600 Diksmuide, on a map: opens Google Maps (or its app) wherever one is. */
export const MATO_MAP_URL = "https://www.google.com/maps/search/?api=1&query=IJzerlaan%2013%2C%208600%20Diksmuide";

/** A mail to MATO with a subject and the first line filled in, so a question arrives with who asks it. */
export function mailToMato(subject: string, body: string): string {
  return `mailto:${MATO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n`)}`;
}
