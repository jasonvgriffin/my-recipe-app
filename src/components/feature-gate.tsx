import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { makeStyles } from '@/hooks/use-theme';

/**
 * Renders children only when the feature is available (docs/DESIGN.md §8). `fallback` defaults to nothing —
 * locked features simply disappear (no nagging, no payment UI in v1). Pass `fallback={<FeatureLocked id=… />}`
 * for routes reached by deep link so the user sees why.
 */
export function FeatureGate({
  id,
  children,
  fallback = null,
}: {
  id: FeatureId;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const access = useFeature(id);
  return <>{access.available ? children : fallback}</>;
}

/** Neutral "not available" message for gated routes. No purchase buttons (billing is a later decision). */
export function FeatureLocked({ id }: { id: FeatureId }) {
  const styles = useStyles();
  const access = useFeature(id);
  return (
    <View style={styles.box} testID={`feature-locked-${id}`}>
      <Text style={styles.text}>{access.available ? '' : access.message}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  text: { color: colors.muted, fontSize: 16, textAlign: 'center' },
}));
