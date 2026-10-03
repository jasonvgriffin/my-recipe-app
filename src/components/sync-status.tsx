import { Pressable, StyleSheet, Text, View } from 'react-native';

import { requestHouseholdSync } from '@/household/runtime';
import { colors } from '@/lib/theme';
import { syncStatusLabel, type SyncStatus } from '@/sync/status';

/** Clear sync status. Hidden concerns stay quiet: solo mode is one muted line, errors name the problem. */
export function SyncStatusBanner({ status, inHousehold }: { status: SyncStatus; inHousehold: boolean }) {
  const label = inHousehold ? syncStatusLabel(status) : 'Sync starts after you create or join a household.';
  const problem = status.phase === 'error' || status.phase === 'offline';
  return (
    <View
      style={[styles.box, problem ? styles.problem : null]}
      testID="sync-status"
      accessibilityRole="text"
      accessibilityLabel={label}>
      <Text style={[styles.label, problem ? styles.problemText : null]}>{label}</Text>
      {status.realtime ? <Text style={styles.meta}>Live updates on</Text> : null}
      {inHousehold ? (
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

const styles = StyleSheet.create({
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
});
