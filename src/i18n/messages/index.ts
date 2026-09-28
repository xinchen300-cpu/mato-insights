import type { Locale } from "../config";
import { en, type Messages } from "./en";
import { fr } from "./fr";
import { nl } from "./nl";

export const messages: Record<Locale, Messages> = { en, nl, fr };
export type { Messages };
