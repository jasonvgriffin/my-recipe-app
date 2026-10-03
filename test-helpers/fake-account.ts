import type { AccountBackend, AccountUser, HouseholdMember, HouseholdSummary } from '@/sync/account';
import { readMagicLink } from '@/sync/auth-url';

/** In-memory Supabase stand-in for household tests. Never talks to the network. */
export function createFakeAccountBackend() {
  let seq = 1;
  let session: AccountUser | null = null;
  let sessionError: Error | null = null;
  let rotateCode = 'ROTATED1';
  const otp = new Map<string, string>();
  const users = new Map<string, AccountUser>();
  const households = new Map<string, HouseholdSummary>();
  const members: HouseholdMember[] = [];
  const sent: string[] = [];

  function requireSession(): AccountUser {
    if (!session) throw new Error('not signed in');
    return session;
  }

  const api: AccountBackend = {
    async getSession() {
      if (sessionError) throw sessionError;
      return session;
    },
    async sendEmailOtp(email) {
      const key = email.trim().toLowerCase();
      sent.push(key);
      otp.set(key, '123456');
    },
    async verifyEmailOtp(email, token) {
      const key = email.trim().toLowerCase();
      if (otp.get(key) !== token) throw new Error('Invalid code');
      let user = users.get(key);
      if (!user) {
        user = { id: `user-${seq++}`, email: email.trim() };
        users.set(key, user);
      }
      session = user;
      return user;
    },
    async completeMagicLink(url) {
      const parsed = readMagicLink(url);
      if (!parsed?.accessToken || !parsed.refreshToken) return null;
      const user = { id: 'user-magic', email: 'magic@example.com' };
      users.set(user.email, user);
      session = user;
      return user;
    },
    async signOut() {
      session = null;
    },
    async createHousehold(name) {
      const user = requireSession();
      const id = `hh-${seq++}`;
      const household: HouseholdSummary = {
        id,
        name,
        inviteCode: `CODE${seq.toString(16).toUpperCase()}`,
        createdBy: user.id,
      };
      households.set(id, household);
      members.push({
        householdId: id,
        userId: user.id,
        role: 'owner',
        displayName: null,
        joinedAt: '2026-10-03T00:00:00.000Z',
      });
      return { id, inviteCode: household.inviteCode };
    },
    async joinHousehold(code) {
      const user = requireSession();
      const household = [...households.values()].find((h) => h.inviteCode === code.trim().toUpperCase());
      if (!household) throw new Error('invalid invite code');
      if (!members.some((m) => m.householdId === household.id && m.userId === user.id)) {
        members.push({
          householdId: household.id,
          userId: user.id,
          role: 'member',
          displayName: null,
          joinedAt: '2026-10-03T01:00:00.000Z',
        });
      }
      return household.id;
    },
    async rotateInviteCode(householdId) {
      const user = requireSession();
      const me = members.find((m) => m.householdId === householdId && m.userId === user.id);
      if (!me || me.role !== 'owner') throw new Error('only the owner can rotate the code');
      const household = households.get(householdId);
      if (!household) throw new Error('missing household');
      household.inviteCode = rotateCode;
      return rotateCode;
    },
    async getHousehold(id) {
      const user = session;
      if (!user || !members.some((m) => m.householdId === id && m.userId === user.id)) return null;
      return households.get(id) ?? null;
    },
    async listHouseholds() {
      const user = session;
      if (!user) return [];
      return [...households.values()].filter((h) => members.some((m) => m.householdId === h.id && m.userId === user.id));
    },
    async listMembers(householdId) {
      const user = session;
      if (!user || !members.some((m) => m.householdId === householdId && m.userId === user.id)) return [];
      return members.filter((m) => m.householdId === householdId);
    },
    async updateDisplayName(householdId, userId, displayName) {
      const member = members.find((m) => m.householdId === householdId && m.userId === userId);
      if (!member) throw new Error('not a member');
      member.displayName = displayName.trim() || null;
    },
    async removeMember(householdId, userId) {
      const user = requireSession();
      const me = members.find((m) => m.householdId === householdId && m.userId === user.id);
      if (!me) throw new Error('not a member');
      if (userId !== user.id && me.role !== 'owner') throw new Error('only the owner can remove members');
      const index = members.findIndex((m) => m.householdId === householdId && m.userId === userId);
      if (index >= 0) members.splice(index, 1);
    },
  };

  return {
    api,
    sent,
    members,
    households,
    setSessionError(error: Error | null) {
      sessionError = error;
    },
    setRotateCode(code: string) {
      rotateCode = code;
    },
    addMember(member: HouseholdMember) {
      members.push(member);
    },
    seedHousehold(name: string, inviteCode: string, owner: AccountUser, displayName?: string) {
      const id = `hh-${seq++}`;
      households.set(id, { id, name, inviteCode, createdBy: owner.id });
      if (owner.email) users.set(owner.email.toLowerCase(), owner);
      members.push({
        householdId: id,
        userId: owner.id,
        role: 'owner',
        displayName: displayName ?? null,
        joinedAt: '2026-10-03T00:00:00.000Z',
      });
      return id;
    },
  };
}
