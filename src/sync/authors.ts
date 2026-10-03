/** "Shared by <name>" (docs/SYNC.md). Unknown authors stay blank — never show a raw user id. */
export function authorLabel(
  createdBy: string | undefined,
  account: {
    user: { id: string } | null;
    displayName: string;
    members: { userId: string; displayName: string | null }[];
  },
): string | null {
  if (!createdBy) return null;
  const member = account.members.find((m) => m.userId === createdBy);
  const fromMember = member?.displayName?.trim();
  if (fromMember) return fromMember;
  if (account.user?.id === createdBy && account.displayName.trim()) return account.displayName.trim();
  return null;
}
