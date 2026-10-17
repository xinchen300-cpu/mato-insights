"use client";

/**
 * Signing out asks first: one stray tap next to the settings icon must not log
 * anyone out, the very thing Televend's users complain about most.
 */
export function SignOutForm({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
