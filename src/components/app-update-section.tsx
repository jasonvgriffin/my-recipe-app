/**
 * Settings → Updates (v1.1.2). Manual only: nothing runs until Check for updates.
 * On web, Update does not download or open an installer.
 */
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';

import { appVersion } from '@/config';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { checkForUpdate, UPDATE_MESSAGES, updateErrorMessage, type UpdateCheck } from '@/lib/app-update';
import { canInstallPackages, openInstallPermissionSettings, startApkInstall } from '@/lib/app-update-install';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; notes: string; apkUrl: string }
  | { kind: 'downloading'; percent: number | null }
  | { kind: 'needs-permission' }
  | { kind: 'handed-off' }
  | { kind: 'error'; message: string };

function previewPhase(value: string | string[] | undefined): Phase | null {
  if (!__DEV__) return null;
  const id = Array.isArray(value) ? value[0] : value;
  switch (id) {
    case 'up-to-date':
      return { kind: 'up-to-date' };
    case 'available':
      return {
        kind: 'available',
        version: '1.2.0',
        notes: 'Purple is the default accent for new installs.\nCheck for updates from Settings.',
        apkUrl: 'https://example.com/my-recipe-app-1.2.0.apk',
      };
    case 'downloading':
      return { kind: 'downloading', percent: 42 };
    case 'error':
      return { kind: 'error', message: UPDATE_MESSAGES.offline };
    default:
      return null;
  }
}

export function AppUpdateSection() {
  const styles = useStyles();
  const colors = useColors();
  const params = useLocalSearchParams<{ updatePreview?: string }>();
  const [phase, setPhase] = useState<Phase>(() => previewPhase(params.updatePreview) ?? { kind: 'idle' });
  const pending = useRef<{ apkUrl: string } | null>(null);
  const checking = useRef(false);
  const running = useRef(false);
  const busy = phase.kind === 'checking' || phase.kind === 'downloading';

  const runInstall = useCallback(async (apkUrl: string) => {
    if (Platform.OS !== 'android' || running.current) return;
    running.current = true;
    try {
      const allowed = await canInstallPackages();
      if (!allowed) {
        setPhase({ kind: 'needs-permission' });
        return;
      }
      setPhase({ kind: 'downloading', percent: null });
      const result = await startApkInstall(apkUrl, (percent) => {
        setPhase({ kind: 'downloading', percent });
      });
      if (result.kind === 'installed') {
        pending.current = null;
        setPhase({ kind: 'handed-off' });
        return;
      }
      if (result.kind === 'needs-permission') {
        setPhase({ kind: 'needs-permission' });
        return;
      }
      if (result.kind === 'error') {
        setPhase({ kind: 'error', message: result.message });
        return;
      }
      setPhase({ kind: 'error', message: UPDATE_MESSAGES.installerFailed });
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (phase.kind !== 'needs-permission') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !pending.current) return;
      void runInstall(pending.current.apkUrl);
    });
    return () => sub.remove();
  }, [phase.kind, runInstall]);

  async function onCheck() {
    if (checking.current || running.current) return;
    checking.current = true;
    setPhase({ kind: 'checking' });
    try {
      const result = await checkForUpdate(appVersion());
      setPhase(phaseFromCheck(result));
    } catch {
      setPhase({ kind: 'error', message: UPDATE_MESSAGES.offline });
    } finally {
      checking.current = false;
    }
  }

  async function onUpdate(apkUrl: string) {
    if (Platform.OS !== 'android') return;
    pending.current = { apkUrl };
    await runInstall(apkUrl);
  }

  const showUpdate = phase.kind === 'available';
  return (
    <View testID="settings-updates" style={styles.wrap}>
      <Text style={styles.section}>Updates</Text>
      <Text style={styles.help}>Look for a newer version when you want one. Nothing checks in the background.</Text>
      {phase.kind === 'up-to-date' ? (
        <Text style={styles.status} testID="settings-update-status" accessibilityLiveRegion="polite">
          {UPDATE_MESSAGES.upToDate}
        </Text>
      ) : null}
      {phase.kind === 'available' ? (
        <View testID="settings-update-available">
          <Text style={styles.status} accessibilityLiveRegion="polite">
            Version {phase.version}
          </Text>
          {phase.notes ? (
            <Text style={styles.notes} testID="settings-update-notes">
              {phase.notes}
            </Text>
          ) : null}
        </View>
      ) : null}
      {phase.kind === 'downloading' ? (
        <View testID="settings-update-progress" accessibilityRole="progressbar">
          <Text style={styles.status}>
            {phase.percent == null ? 'Downloading…' : `Downloading ${phase.percent}%`}
          </Text>
          {phase.percent != null ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${phase.percent}%`, backgroundColor: colors.primary }]} />
            </View>
          ) : null}
        </View>
      ) : null}
      {phase.kind === 'needs-permission' ? (
        <Text style={styles.error} testID="settings-update-permission">
          {UPDATE_MESSAGES.needsPermission}
        </Text>
      ) : null}
      {phase.kind === 'handed-off' ? (
        <Text style={styles.status} testID="settings-update-status">
          {UPDATE_MESSAGES.handedOff}
        </Text>
      ) : null}
      {phase.kind === 'error' ? (
        <Text style={styles.error} testID="settings-update-error" accessibilityLiveRegion="polite">
          {phase.message}
        </Text>
      ) : null}
      {phase.kind === 'checking' ? (
        <Text style={styles.help} testID="settings-update-status">
          Checking…
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        testID="settings-check-updates"
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={() => {
          void onCheck();
        }}>
        <Text style={styles.buttonText}>Check for updates</Text>
      </Pressable>
      {showUpdate ? (
        <Pressable
          accessibilityRole="button"
          testID="settings-install-update"
          style={styles.button}
          onPress={() => {
            void onUpdate(phase.apkUrl);
          }}>
          <Text style={styles.buttonText}>Update</Text>
        </Pressable>
      ) : null}
      {phase.kind === 'needs-permission' ? (
        <Pressable
          accessibilityRole="button"
          testID="settings-allow-installs"
          style={styles.button}
          onPress={() => {
            void openInstallPermissionSettings();
          }}>
          <Text style={styles.buttonText}>Allow installs</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function phaseFromCheck(result: UpdateCheck): Phase {
  if (result.kind === 'up-to-date') return { kind: 'up-to-date' };
  if (result.kind === 'error') return { kind: 'error', message: updateErrorMessage(result.reason) };
  return { kind: 'available', version: result.latest, notes: result.notes, apkUrl: result.apkUrl };
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 8 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  help: { color: colors.muted },
  status: { color: colors.text, fontSize: 16, fontWeight: '600' },
  notes: { color: colors.text, fontSize: 15 },
  error: { color: colors.danger },
  button: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.primary,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8 },
}));
