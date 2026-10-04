import { Pressable, Text, View } from 'react-native';

import { requestHouseholdSync } from '@/household/runtime';
import { makeStyles } from '@/hooks/use-theme';
import { syncStatusLabel, type SyncStatus } from '@/sync/status';

/**
 * Clear sync status. Hidden concerns stay quiet: solo mode is one muted line, errors name the problem.
 * `scope`: 'household' = shared with the household; 'personal' = the signed-in user's own space (v1.0.6:
 * signing in syncs on its own, no household needed).
 */
export function SyncStatusBanner({ status, scope }: { status: SyncStatus; scope: 'household' | 'personal' }) {
  const styles = useStyles();
  const syncing = status.phase !== 'solo';
  const label = syncStatusLabel(status);
  const where = scope === 'household' ? 'Shared with your household' : 'Your personal space: only you can see it';
  const problem = status.phase === 'error' || status.phase === 'offline';
  return (
    <View
      style={[styles.box, problem ? styles.problem : null]}
      testID="sync-status"
      accessibilityRole="text"
      accessibilityLabel={label}>
      <Text style={[styles.label, problem ? styles.problemText : null]}>{label}</Text>
      {syncing ? (
        <Text style={styles.meta} testID="sync-scope">
          {where}
        </Text>
      ) : null}
      {status.realtime ? <Text style={styles.meta}>Live updates on</Text> : null}
      {syncing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sync now"
          testID="sync-now"
          style={styles.button}
          onPress={() => requestHouseholdSync('pull')}>
          <Text style={styles.buttonText}>Sync now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  problem: { borderColor: colors.danger },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  problemText: { color: colors.danger },
  meta: { color: colors.muted, fontSize: 13 },
  button: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonText: { color: colors.primary, fontWeight: '700' },
}));
