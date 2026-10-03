import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FeatureId } from '@/entitlements';
import { useFeatureVisible } from '@/hooks/use-feature';
import { addMenuHref, visibleAddMenuItems, type AddMenuItem } from '@/lib/add-menu';
import { toIsoDate } from '@/lib/dates';
import { makeStyles, useColors } from '@/hooks/use-theme';

/**
 * Bottom sheet raised by the center “+” tab button (v1.0.2, like Cronometer's add menu): a 3-column grid of
 * round icon buttons. Items come from `src/lib/add-menu.ts`; anything locked or hidden in Settings is left
 * out, and a partial last row is centered (v1.0.3). Tapping outside the sheet or Android back closes it.
 */
export function AddMenuSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const shown: Partial<Record<FeatureId, boolean>> = {
    linkImport: useFeatureVisible('linkImport'),
    shoppingList: useFeatureVisible('shoppingList'),
    pantry: useFeatureVisible('pantry'),
    mealPlan: useFeatureVisible('mealPlan'),
    householdSync: useFeatureVisible('householdSync'),
  };
  const items = visibleAddMenuItems((id) => shown[id] ?? false);

  const open = (item: AddMenuItem) => {
    onClose();
    const href = addMenuHref(item.id, { today: toIsoDate(new Date()) });
    router.push(href as Href);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close add menu"
          testID="add-menu-backdrop"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} testID="add-menu-sheet">
          <View style={styles.handle} />
          <View style={styles.grid}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => open(item)}
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                testID={`add-menu-${item.id}`}>
                <View style={styles.circle}>
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={28} color={colors.accent} />
                </View>
                <Text style={styles.label} numberOfLines={2}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.backdrop },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  cell: { width: '33.333%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 8 },
  pressed: { opacity: 0.6 },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
}));
