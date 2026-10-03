import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useFeatureVisible } from '@/hooks/use-feature';
import { colors } from '@/lib/theme';
import { pantryStore } from '@/storage/pantry';
import type { PantryItem } from '@/types/recipe';

/**
 * Read-only "on hand" pane for the shopping list (spec #12 / #23).
 * The pantry screen itself belongs to the pantry feature; this only shows why lines were skipped.
 * Hidden pantry stays quiet — no prompt to open it.
 */
export function PantryOnHand() {
  const visible = useFeatureVisible('pantry');
  const [items, setItems] = useState<PantryItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!visible) return undefined;
      let active = true;
      pantryStore.list().then((next) => {
        if (active) setItems(next);
      });
      return () => {
        active = false;
      };
    }, [visible]),
  );

  if (!visible) {
    return (
      <ScrollView contentContainerStyle={styles.box} testID="pantry-pane-hidden">
        <Text style={styles.muted}>Pantry is hidden.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.box} testID="pantry-on-hand">
      <Text style={styles.heading}>On hand</Text>
      <Text style={styles.muted}>These are left off the shopping list.</Text>
      {items.length === 0 ? <Text style={styles.muted}>Nothing on hand.</Text> : null}
      {items.map((item) => (
        <Text key={item.id} style={styles.item}>
          {item.name}
          {item.quantity !== undefined ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : ''}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 8 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted },
  item: { color: colors.text, fontSize: 16, paddingVertical: 6 },
});
