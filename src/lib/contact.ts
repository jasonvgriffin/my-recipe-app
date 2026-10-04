/** v1.0.7 More → Contact Us: Jason's exact wording and the feedback mailbox (UI-free, tested). */
export const CONTACT_EMAIL = 'eve.chief_of_staff@agentmail.to';
export const CONTACT_SUBJECT = 'My Recipe App feedback';
export const CONTACT_INTRO =
  "Want to report a bug or request a feature? Need something else? Email our AI assistant. She's keeping track and informs us when someone needs help.";

export function contactMailto(email: string = CONTACT_EMAIL, subject: string = CONTACT_SUBJECT): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
