import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeatureLocked } from '@/components/feature-gate';
import type { FeatureId } from '@/entitlements';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { colors } from '@/lib/theme';

/**
 * Entry point for an optional feature: locked features show a neutral message, hidden ones a quiet line.
 * No prompt to turn the feature on and no payment UI (recipes-first + paywall-ready gating).
 */
export function OptionalFeature({
  id,
  hiddenLabel,
  children,
}: {
  id: FeatureId;
  hiddenLabel: string;
  children: ReactNode;
}) {
  const access = useFeature(id);
  const shown = useFeatureVisible(id);
  if (!access.available) return <FeatureLocked id={id} />;
  if (!shown) {
    return (
      <View style={styles.box} testID={`feature-hidden-${id}`}>
        <Text style={styles.text}>{hiddenLabel}</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  text: { color: colors.muted, fontSize: 16, textAlign: 'center' },
});
