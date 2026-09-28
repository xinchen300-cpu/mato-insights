"use server";

import { isInvited } from "@/lib/signup";

/**
 * Checked before the account is created, so an uninvited address never ends up
 * as a stray user. Says only yes or no — never who is invited.
 */
export async function checkInvite(email: string): Promise<boolean> {
  return isInvited(email);
}
