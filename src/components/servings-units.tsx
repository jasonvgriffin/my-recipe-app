import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';
import type { UnitSystem } from '@/types/recipe';

const CHOICES: { id: UnitSystem | 'original'; label: string }[] = [
  { id: 'original', label: 'As written' },
  { id: 'metric', label: 'Metric' },
  { id: 'imperial', label: 'Imperial' },
];

/**
 * Servings scaler and metric/imperial toggle (spec #16). Scaling only changes the
 * ingredient amounts on screen; nutrition stays per serving of the saved recipe.
 */
export function ServingsUnits({
  baseServings,
  targetServings,
  onAdjust,
  unitSystem,
  onUnitSystem,
}: {
  baseServings: number;
  targetServings: number;
  /** Add or subtract servings. Callers should apply this with a functional update so fast taps stack. */
  onAdjust: (delta: number) => void;
  unitSystem: UnitSystem | 'original';
  onUnitSystem: (system: UnitSystem | 'original') => void;
}) {
  const scaled = targetServings !== baseServings;
  return (
    <View style={styles.wrap} testID="servings-units">
      <View style={styles.servingsRow}>
        <Text style={styles.label}>Scale ingredients</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fewer servings"
            testID="servings-minus"
            style={styles.stepBtn}
            onPress={() => onAdjust(-1)}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.servingsValue} testID="servings-value">
            {targetServings}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More servings"
            testID="servings-plus"
            style={styles.stepBtn}
            onPress={() => onAdjust(1)}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      </View>
      {scaled ? (
        <Text style={styles.hint}>Scaled from {baseServings}. Nutrition per serving does not change.</Text>
      ) : (
        <Text style={styles.hint}>Recipe makes {baseServings}.</Text>
      )}
      <View style={styles.units} accessibilityRole="radiogroup">
        {CHOICES.map((c) => {
          const selected = unitSystem === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              testID={`unit-system-${c.id}`}
              style={[styles.unit, selected && styles.unitOn]}
              onPress={() => onUnitSystem(c.id)}>
              <Text style={[styles.unitText, selected && styles.unitTextOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.primary, fontSize: 24, fontWeight: '700' },
  servingsValue: { color: colors.text, fontSize: 20, fontWeight: '700', minWidth: 32, textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 13 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unit: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitText: { color: colors.text, fontWeight: '600' },
  unitTextOn: { color: colors.primaryText },
});
