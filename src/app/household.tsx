import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';

import { FeatureGate, FeatureLocked } from '@/components/feature-gate';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout, useBottomInset } from '@/components/layout';
import { SyncStatusBanner } from '@/components/sync-status';
import { householdActions, restoreHouseholdSession, syncHouseholdNow } from '@/household/runtime';
import { useHousehold } from '@/hooks/use-household';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { makeStyles, useColors } from '@/hooks/use-theme';
import type { HouseholdMember } from '@/sync/account';

function confirmAction(title: string, message: string, confirm: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirm, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function memberLabel(member: HouseholdMember, selfId?: string): string {
  if (member.displayName?.trim()) return member.displayName.trim();
  if (member.userId === selfId) return 'You';
  return 'Household member';
}

/**
 * Settings → Household (spec #25). Optional: the app works fully offline when this screen is never opened.
 * Gated by `householdSync`. Compact is one scrolling column; medium/expanded puts members beside the account.
 */
export default function HouseholdScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const { account, sync } = useHousehold();
  // Set by the `/auth` magic-link route after it finishes (success or error).
  const authParams = useLocalSearchParams<{ auth?: string; message?: string }>();
  const { isTwoPane } = useWindowSizeClass();
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [householdName, setHouseholdName] = useState('Our household');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState(account.displayName);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const nameKey = `${account.household?.id ?? ''}:${account.displayName}`;
  const [seenNameKey, setSeenNameKey] = useState(nameKey);
  if (nameKey !== seenNameKey) {
    setSeenNameKey(nameKey);
    setDisplayName(account.displayName);
  }
  const signedIn = !!account.user;
  const [seenSignedIn, setSeenSignedIn] = useState(signedIn);
  if (signedIn !== seenSignedIn) {
    setSeenSignedIn(signedIn);
    if (!signedIn) setCodeSent(false);
  }

  useEffect(() => {
    void restoreHouseholdSession();
  }, []);

  const shownError = localError || account.error;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>): Promise<void> {
    setBusy(true);
    setLocalError(undefined);
    try {
      const result = await fn();
      if (!result.ok) setLocalError(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await householdActions().refresh();
      await syncHouseholdNow('pull');
    } finally {
      setRefreshing(false);
    }
  }

  async function copyCode(): Promise<void> {
    if (!account.household) return;
    await Clipboard.setStringAsync(account.household.inviteCode);
    setCopied(true);
  }

  async function shareCode(): Promise<void> {
    if (!account.household) return;
    const message = `Join my household "${account.household.name}" in My Recipe App. Invite code: ${account.household.inviteCode}`;
    try {
      await Share.share({ message });
    } catch {
      // The share sheet was dismissed.
    }
  }

  async function rotate(): Promise<void> {
    const ok = await confirmAction(
      'Rotate invite code?',
      'The current code will stop working. People who already joined stay in the household.',
      'Rotate',
    );
    if (!ok) return;
    setCopied(false);
    await run(() => householdActions().rotateInvite());
  }

  async function leave(): Promise<void> {
    const ok = await confirmAction(
      'Leave household?',
      'Recipes stay on this device. New changes sync to your personal account until you join a household again.',
      'Leave',
    );
    if (!ok) return;
    await run(() => householdActions().leave());
  }

  async function signOut(): Promise<void> {
    const ok = await confirmAction('Sign out?', 'Recipes stay on this device. You can keep cooking offline.', 'Sign out');
    if (!ok) return;
    await run(() => householdActions().signOut());
  }

  async function remove(member: HouseholdMember): Promise<void> {
    const ok = await confirmAction('Remove member?', `${memberLabel(member)} will lose access to this household.`, 'Remove');
    if (!ok) return;
    await run(() => householdActions().removeMember(member.userId));
  }

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressBackgroundColor={colors.card}
    />
  );

  const accountPane = (
    <ScrollView
      testID="household-scroll"
      contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh}>
      {/* v1.0.4: the “Household” page title comes from SectionLayout (no duplicate heading here). */}
      <Text style={styles.help}>
        Share recipes, the pantry, meal plan and shopping list with people you live with. Optional — recipes work
        without an account, and cloud sync and AI assistants work without a household (Settings → AI assistants).
        Creating or joining a household shares your synced recipes with it.
      </Text>
      {authParams.auth === 'ok' && account.user ? (
        <Text testID="household-auth-ok" style={styles.success}>
          You’re signed in.
        </Text>
      ) : null}
      {authParams.auth === 'error' && !account.user ? (
        <Text testID="household-auth-error" style={styles.error}>
          {authParams.message || 'Sign-in failed. Request a new code and try again.'}
        </Text>
      ) : null}
      {shownError ? (
        <Text testID="household-error" style={styles.error}>
          {shownError}
        </Text>
      ) : null}
      {!account.configured ? (
        <Text testID="household-unconfigured" style={styles.help}>
          Household sharing is not configured on this build. Recipes still work on this device — an account is never
          required.
        </Text>
      ) : null}
      {account.configured && !account.user ? signInForm() : null}
      {account.user ? (
        <Text testID="household-signed-in" style={styles.help}>
          Signed in as {account.user.email ?? account.user.id}
        </Text>
      ) : null}
      {account.user && !account.household ? createOrJoin() : null}
      {account.household ? (
        <>
          <Text testID="household-current-name" style={styles.householdName}>
            {account.household.name}
          </Text>
          <Text testID="household-role" style={styles.help}>
            {account.role === 'owner' ? 'You are the owner' : 'You are a member'}
          </Text>
          <SyncStatusBanner status={sync} scope="household" />
          <Field label="Your name">
            <TextInput
              testID="household-display-name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Shown on recipes you share"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              maxLength={80}
            />
          </Field>
          <Button
            testID="household-save-name"
            label="Save name"
            disabled={busy}
            onPress={() => void run(() => householdActions().setDisplayName(displayName))}
          />
          {!isTwoPane ? membersPaneContent() : null}
          <Button testID="household-leave" label="Leave household" kind="danger" disabled={busy} onPress={() => void leave()} />
        </>
      ) : account.user ? (
        <SyncStatusBanner status={sync} scope="personal" />
      ) : null}
      {!isTwoPane && !account.household ? membersPaneContent() : null}
      {account.user ? (
        <Button testID="household-sign-out" label="Sign out" kind="ghost" disabled={busy} onPress={() => void signOut()} />
      ) : null}
    </ScrollView>
  );

  function signInForm() {
    return (
      <View>
        <Text style={styles.sub}>Sign in</Text>
        <Text style={styles.help}>We email you a 6-digit code. You can also open the sign-in link on this device.</Text>
        <Field label="Email">
          <TextInput
            testID="household-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
        </Field>
        <Button
          testID="household-send-code"
          label={codeSent ? 'Email a new code' : 'Email me a code'}
          disabled={busy || email.trim() === ''}
          onPress={() =>
            void run(async () => {
              const result = await householdActions().sendCode(email);
              if (result.ok) setCodeSent(true);
              return result;
            })
          }
        />
        {codeSent ? (
          <>
            <Field label="6-digit code">
              <TextInput
                testID="household-otp"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                placeholder="123456"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
            </Field>
            <Button
              testID="household-verify"
              label="Verify code"
              disabled={busy || otp.replace(/\D/g, '').length !== 6}
              onPress={() => void run(() => householdActions().verifyCode(email, otp))}
            />
          </>
        ) : null}
      </View>
    );
  }

  function createOrJoin() {
    return (
      <View>
        {account.households.length > 1 ? (
          <View testID="household-picker">
            <Text style={styles.sub}>Your households</Text>
            {account.households.map((h) => (
              <Button
                key={h.id}
                testID={`pick-household-${h.id}`}
                label={h.name}
                kind="ghost"
                disabled={busy}
                onPress={() => void run(() => householdActions().selectHousehold(h.id))}
              />
            ))}
          </View>
        ) : null}
        <Text style={styles.sub}>Create a household</Text>
        <Field label="Name">
          <TextInput
            testID="household-name"
            value={householdName}
            onChangeText={setHouseholdName}
            placeholder="Griffin household"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            maxLength={100}
          />
        </Field>
        <Button
          testID="household-create"
          label="Create household"
          disabled={busy}
          onPress={() => void run(() => householdActions().createHousehold(householdName))}
        />
        <Text style={styles.sub}>Join with a code</Text>
        <Field label="Invite code">
          <TextInput
            testID="household-join-code"
            value={joinCode}
            onChangeText={(value) => setJoinCode(value.toUpperCase())}
            autoCapitalize="characters"
            placeholder="ABCD1234"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
        </Field>
        <Button
          testID="household-join"
          label="Join household"
          disabled={busy}
          onPress={() => void run(() => householdActions().joinWithCode(joinCode))}
        />
      </View>
    );
  }

  function membersPaneContent() {
    if (!account.household) {
      return (
        <Text testID="household-members-empty" style={styles.help}>
          Invite code and members show up here after you create or join a household.
        </Text>
      );
    }
    return (
      <View>
        <Text style={styles.sub}>Invite code</Text>
        <Text testID="household-invite-code" selectable style={styles.code}>
          {account.household.inviteCode}
        </Text>
        <View style={styles.row}>
          <Button
            testID="household-copy-code"
            label={copied ? 'Copied' : 'Copy'}
            kind="ghost"
            onPress={() => void copyCode()}
          />
          <Button testID="household-share-code" label="Share" kind="ghost" onPress={() => void shareCode()} />
          {account.role === 'owner' ? (
            <Button testID="household-rotate-code" label="New code" kind="ghost" disabled={busy} onPress={() => void rotate()} />
          ) : null}
        </View>
        <Text style={styles.sub}>Members</Text>
        <View testID="household-members">
          {account.members.map((member) => (
            <View key={member.userId} testID={`household-member-${member.userId}`} style={styles.member}>
              <View style={styles.flex}>
                <Text style={styles.label}>{memberLabel(member, account.user?.id)}</Text>
                <Text testID={`household-member-role-${member.userId}`} style={styles.help}>
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </Text>
              </View>
              {account.role === 'owner' && member.userId !== account.user?.id ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${memberLabel(member)}`}
                  testID={`remove-member-${member.userId}`}
                  style={styles.remove}
                  onPress={() => void remove(member)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const membersPane = (
    <ScrollView
      testID="household-members-scroll"
      contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}
      refreshControl={refresh}
      keyboardShouldPersistTaps="handled">
      {membersPaneContent()}
    </ScrollView>
  );

  const layout = (
    <TwoPaneLayout
      testID="household-layout"
      primary={accountPane}
      secondary={isTwoPane ? membersPane : null}
      placeholder={<Text style={styles.help}>Invite code and members</Text>}
    />
  );

  return (
    <View style={styles.screen} testID="household-screen">
      <FeatureGate id="householdSync" fallback={<FeatureLocked id="householdSync" />}>
        {isTwoPane ? layout : <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>{layout}</MaxWidthContainer>}
      </FeatureGate>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  testID,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
  kind?: 'primary' | 'ghost' | 'danger';
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, kind === 'ghost' && styles.ghost, kind === 'danger' && styles.danger, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, kind === 'ghost' && styles.ghostText, kind === 'danger' && styles.dangerText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, paddingBottom: 48, gap: 10 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700' },
  sub: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  help: { color: colors.muted, fontSize: 14 },
  householdName: { color: colors.text, fontSize: 22, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 15 },
  success: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  field: { gap: 6 },
  label: { color: colors.text, fontWeight: '600', fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    minHeight: 44,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
  },
  code: { color: colors.primary, fontSize: 28, fontWeight: '700', letterSpacing: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    marginTop: 4,
    backgroundColor: colors.primary,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  ghostText: { color: colors.primary },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.5 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  flex: { flex: 1 },
  remove: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  removeText: { color: colors.danger, fontWeight: '600' },
}));
