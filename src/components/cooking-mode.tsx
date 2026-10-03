import { useEffect, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { TwoPaneLayout, useBottomInset } from '@/components/layout';
import { ServingsUnits } from '@/components/servings-units';
import type { CurrentStep } from '@/cooking';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { formatIngredient, presentIngredient } from '@/lib/ingredients';
import { makeStyles } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/timers';
import type { Recipe, UnitSystem } from '@/types/recipe';

const KEEP_AWAKE_TAG = 'cooking-mode';

function remainingSeconds(endsAt: string, now: number): number {
  return Math.max(0, Math.round((Date.parse(endsAt) - now) / 1000));
}

/**
 * Full-screen cooking mode (spec #19). One step at a time, large type, big controls,
 * inline timers. Expanded widths put ingredients beside the step (spec #23).
 */
export function CookingMode({
  step,
  recipe,
  finished,
  message,
  keepAwake,
  unitSystem,
  targetServings,
  onAdjustServings,
  onUnitSystem,
  unitsEnabled,
  timersEnabled,
  permission,
  onPrevious,
  onNext,
  onRepeat,
  onTimer,
  onGoTo,
  onEnd,
  onMarkCooked,
}: {
  step?: CurrentStep;
  recipe?: Recipe;
  /** Session reached the last step. */
  finished?: boolean;
  message?: string;
  keepAwake: boolean;
  unitSystem: UnitSystem | 'original';
  targetServings: number;
  onAdjustServings: (delta: number) => void;
  onUnitSystem: (system: UnitSystem | 'original') => void;
  unitsEnabled: boolean;
  timersEnabled: boolean;
  permission?: 'granted' | 'denied';
  onPrevious: () => void;
  onNext: () => void;
  onRepeat: () => void;
  onTimer: () => void;
  onGoTo: (index: number) => void;
  onEnd: () => void;
  onMarkCooked?: () => void;
}) {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [keepAwake]);

  const [now, setNow] = useState(() => Date.now());
  const ticking = (step?.activeTimers ?? []).some((t) => Date.parse(t.endsAt) > now);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const { isTwoPane } = useWindowSizeClass();
  const factor = recipe && recipe.servings > 0 ? targetServings / recipe.servings : 1;
  const forStep = new Set(step?.ingredientsForStep ?? []);

  const ingredients = recipe ? (
    <ScrollView contentContainerStyle={[styles.ingPane, { paddingBottom: 48 + bottomInset }]} testID="cook-ingredients">
      <Text style={styles.kicker}>Ingredients</Text>
      {unitsEnabled ? (
        <ServingsUnits
          baseServings={recipe.servings}
          targetServings={targetServings}
          onAdjust={onAdjustServings}
          unitSystem={unitSystem}
          onUnitSystem={onUnitSystem}
        />
      ) : null}
      {recipe.ingredients.map((ing, idx) => {
        const highlighted = forStep.has(formatIngredient(ing));
        return (
          <Text key={`${ing.text}-${idx}`} style={[styles.ingredient, highlighted && styles.ingredientOn]}>
            {highlighted ? '● ' : '• '}
            {presentIngredient(ing, {
              unitSystem: unitsEnabled ? unitSystem : 'original',
              factor: unitsEnabled ? factor : 1,
            })}
          </Text>
        );
      })}
    </ScrollView>
  ) : (
    <View testID="cook-ingredients" />
  );

  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (!step || finished) return;
      if (g.dx <= -70 && !step.isLast) onNext();
      else if (g.dx >= 70 && !step.isFirst) onPrevious();
    },
  });

  const otherTimers = (step?.activeTimers ?? []).filter((t) => !step || t.stepIndex !== step.stepIndex);

  return (
    <View style={styles.fill} {...(step && !finished ? pan.panHandlers : {})}>
      <TwoPaneLayout
        testID="cook-layout"
        compact="primary"
        primary={
          <ScrollView contentContainerStyle={[styles.stepPane, { paddingBottom: 48 + bottomInset }]}>
            {message && !step ? <Text style={styles.message}>{message}</Text> : null}
            {finished ? (
              <View style={styles.done}>
                <Text style={styles.stepText}>All steps done. Enjoy.</Text>
                <Text style={styles.kicker}>Timers you started keep running in the background.</Text>
                {onMarkCooked ? <Btn label="Mark cooked" onPress={onMarkCooked} testID="cook-mark-cooked" /> : null}
                <Btn label="Close" onPress={onEnd} primary testID="cook-end" />
              </View>
            ) : step ? (
              <>
                <Text style={styles.kicker}>
                  Step {step.stepIndex + 1} of {step.totalSteps}
                </Text>
                <Text style={styles.stepText} testID="cook-step-text" accessibilityLiveRegion="polite">
                  {step.text}
                </Text>
                {timersEnabled && step.timer ? (
                  <Text style={styles.timer} testID="cook-timer-remaining">
                    {remainingSeconds(step.timer.endsAt, now) === 0
                      ? 'Timer done'
                      : `⏱ ${formatDuration(remainingSeconds(step.timer.endsAt, now))} left`}
                  </Text>
                ) : timersEnabled && step.durationSeconds ? (
                  <Text style={styles.timer}>⏱ {formatDuration(step.durationSeconds)}</Text>
                ) : null}
                {permission === 'denied' ? (
                  <Text style={styles.kicker} testID="cook-notifications-off">
                    Notifications are off, so this countdown only updates while the app is open.
                  </Text>
                ) : null}
                {otherTimers.length > 0 ? (
                  <View style={styles.otherTimers} testID="cook-other-timers">
                    {otherTimers.map((t) => (
                      <Pressable key={t.stepIndex} accessibilityRole="button" onPress={() => onGoTo(t.stepIndex)}>
                        <Text style={styles.otherTimer}>
                          Step {t.stepIndex + 1} ·{' '}
                          {remainingSeconds(t.endsAt, now) === 0
                            ? 'done'
                            : formatDuration(remainingSeconds(t.endsAt, now))}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.buttons}>
                  <Btn label="‹ Back" onPress={onPrevious} disabled={step.isFirst} testID="cook-back" />
                  <Btn label="Repeat" onPress={onRepeat} testID="cook-repeat" />
                  {timersEnabled && step.durationSeconds ? (
                    <Btn label="Timer" onPress={onTimer} testID="cook-timer" />
                  ) : null}
                  <Btn label={step.isLast ? 'Finish' : 'Next ›'} onPress={onNext} primary testID="cook-next" />
                </View>
                {!isTwoPane ? ingredients : null}
              </>
            ) : null}
          </ScrollView>
        }
        secondary={isTwoPane ? ingredients : null}
        placeholder={<View />}
      />
    </View>
  );
}

function Btn({
  label,
  onPress,
  primary,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1, backgroundColor: colors.background },
  stepPane: { padding: 24, paddingBottom: 48, gap: 16 },
  ingPane: { padding: 20, paddingBottom: 48, gap: 8 },
  done: { gap: 16, paddingTop: 24 },
  message: { color: colors.muted, textAlign: 'center', marginTop: 48, fontSize: 20 },
  kicker: { color: colors.muted, fontSize: 18, fontWeight: '600' },
  stepText: { color: colors.text, fontSize: 32, lineHeight: 42, fontWeight: '600' },
  timer: { color: colors.primary, fontSize: 28, fontWeight: '800' },
  otherTimers: { gap: 6 },
  otherTimer: { color: colors.primary, fontSize: 18, fontWeight: '600' },
  ingredient: { color: colors.text, fontSize: 20, lineHeight: 30 },
  ingredientOn: { color: colors.primary, fontWeight: '700' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  btn: {
    minHeight: 56,
    minWidth: 96,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  btnTextPrimary: { color: colors.primaryText },
}));
