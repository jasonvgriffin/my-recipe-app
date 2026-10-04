import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FeatureGate, FeatureLocked } from '@/components/feature-gate';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { SyncStatusBanner } from '@/components/sync-status';
import { MCP_SERVER_URL } from '@/config';
import { useFeatureVisible } from '@/hooks/use-feature';
import { useHousehold } from '@/hooks/use-household';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { householdActions, restoreHouseholdSession } from '@/household/runtime';

/**
 * Settings → AI assistants (MCP) → "Sign in to sync and use with AI assistants" (v1.0.6, docs/SYNC.md
 * "Personal space", docs/MCP.md). An email-code account that syncs YOUR recipes, meal plan, shopping list and
 * pantry to the cloud on its own: no household needed. The same account signs in to the MCP server, so Grok,
 * Claude or ChatGPT see the same data. Household sharing (More → Household) is separate and optional.
 * Gated by `cloudSync` (never by `householdSync`). Recipes still work without an account.
 */
export default function AccountScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const { account, sync } = useHousehold();
  const householdVisible = useFeatureVisible('householdSync');
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const signedIn = !!account.user;
  const [seenSignedIn, setSeenSignedIn] = useState(signedIn);
  if (signedIn !== seenSignedIn) {
    setSeenSignedIn(signedIn);
    if (!signedIn) setCodeSent(false);
  }

  useEffect(() => {
    void restoreHouseholdSession();
  }, []);

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

  function signOut(): void {
    Alert.alert('Sign out?', 'Recipes stay on this device. Sync and AI assistant changes stop until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void run(() => householdActions().signOut()) },
    ]);
  }

  const shownError = localError || account.error;

  return (
    <View style={styles.screen} testID="account-screen">
      <FeatureGate id="cloudSync" fallback={<FeatureLocked id="cloudSync" />}>
        <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
          <ScrollView
            contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.help}>
              Sign in with your email to back up and sync your recipes, meal plan, shopping list and pantry, and to use
              them with AI assistants like Grok, Claude or ChatGPT. No household needed. Optional: recipes work on this
              device without an account.
            </Text>
            {shownError ? (
              <Text testID="account-error" style={styles.error}>
                {shownError}
              </Text>
            ) : null}
            {!account.configured ? (
              <Text testID="account-unconfigured" style={styles.help}>
                Cloud sync is not configured on this build. Recipes still work on this device.
              </Text>
            ) : null}
            {account.configured && !account.user ? (
              <View>
                <Text style={styles.sub}>Sign in</Text>
                <Text style={styles.help}>We email you a 6-digit code. New here? The code creates your account.</Text>
                <Field label="Email">
                  <TextInput
                    testID="account-email"
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
                  testID="account-send-code"
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
                        testID="account-otp"
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
                      testID="account-verify"
                      label="Verify code"
                      disabled={busy || otp.replace(/\D/g, '').length !== 6}
                      onPress={() => void run(() => householdActions().verifyCode(email, otp))}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
            {account.user ? (
              <>
                <Text testID="account-signed-in" style={styles.label}>
                  Signed in as {account.user.email ?? account.user.id}
                </Text>
                <SyncStatusBanner status={sync} scope={account.household ? 'household' : 'personal'} />
                {account.household ? (
                  <Text testID="account-household-note" style={styles.help}>
                    You’re in the household “{account.household.name}”, so sync and AI assistants use its shared
                    recipes.
                  </Text>
                ) : null}
                <Text style={styles.sub}>Connect an AI assistant</Text>
                <Text style={styles.help}>
                  1. Add this server URL as a custom connector in Grok, Claude or ChatGPT.{'\n'}2. Sign in there with
                  the same email ({account.user.email ?? 'this account'}) and the code it sends you.
                </Text>
                <View style={styles.box}>
                  <Text style={styles.url} selectable testID="account-mcp-url">
                    {MCP_SERVER_URL}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copied ? 'Copied' : 'Copy MCP server URL'}
                    hitSlop={8}
                    style={styles.copy}
                    testID="account-mcp-copy"
                    onPress={async () => {
                      await Clipboard.setStringAsync(MCP_SERVER_URL);
                      setCopied(true);
                    }}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.primary} />
                    <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
                  </Pressable>
                </View>
                {householdVisible && !account.household ? (
                  <Text style={styles.help} testID="account-household-hint">
                    Want to share with people you live with?{' '}
                    <Link href="/household" style={styles.link}>
                      More → Household
                    </Link>{' '}
                    (optional).
                  </Text>
                ) : null}
                <Button testID="account-sign-out" label="Sign out" kind="ghost" disabled={busy} onPress={signOut} />
              </>
            ) : null}
          </ScrollView>
        </MaxWidthContainer>
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
  kind?: 'primary' | 'ghost';
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, kind === 'ghost' && styles.ghost, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, kind === 'ghost' && styles.ghostText]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, gap: 10 },
  sub: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  help: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 15 },
  field: { gap: 6 },
  label: { color: colors.text, fontWeight: '600', fontSize: 15 },
  link: { color: colors.primary, fontWeight: '600' },
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
  box: { gap: 4, backgroundColor: colors.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border },
  url: { color: colors.text, fontSize: 14, flexShrink: 1 },
  copy: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, minHeight: 44 },
  copyText: { color: colors.primary, fontWeight: '600' },
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
  disabled: { opacity: 0.5 },
}));
