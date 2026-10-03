import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MaxWidthContainer, TwoPaneLayout } from '@/components/layout';
import { cookSession, parseCookDeepLink, runCookCommand, type CookResult, type CurrentStep } from '@/cooking';
import { colors } from '@/lib/theme';
import { formatDuration } from '@/lib/timers';

/**
 * Deep-link target for cook-with-me (spec #24): myrecipeapp://cook/{recipeId} | next | previous | current | ...
 * Minimal cooking view driven entirely by the shared `cookSession` module.
 * TODO(spec #19): full-screen cooking mode (keep-awake via expo-keep-awake, larger type, swipe between steps,
 * inline timers with notifications) — build it on this route + cookSession, not a separate state store.
 */
export default function CookScreen() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const [result, setResult] = useState<CookResult | undefined>();

  const run = useCallback(async (p: Promise<CookResult>) => setResult(await p), []);

  useEffect(() => {
    const cmd = parseCookDeepLink(`myrecipeapp://cook/${encodeURIComponent(String(action))}`);
    if (!cmd) return;
    let active = true;
    runCookCommand(cookSession, cmd).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [action]);

  const step: CurrentStep | undefined = result?.ok && 'step' in result ? result.step : undefined;

  return (
    <MaxWidthContainer maxWidth={1100}>
      <Stack.Screen options={{ title: step?.title ?? 'Cook with me' }} />
      {!result ? null : !result.ok ? (
        <Text style={styles.message}>{result.message}</Text>
      ) : !step ? (
        <Text style={styles.message}>{result.event === 'finished' ? 'All steps done. Enjoy!' : 'Session ended.'}</Text>
      ) : (
        <TwoPaneLayout
          testID="cook-layout"
          compact="stack"
          primary={
            <ScrollView contentContainerStyle={styles.pane}>
              <Text style={styles.counter}>
                Step {step.stepIndex + 1} of {step.totalSteps}
              </Text>
              <Text style={styles.stepText} testID="cook-step-text">
                {step.text}
              </Text>
              {step.timer ? (
                <Text style={styles.timer}>⏱ {formatDuration(step.timer.remainingSeconds)} left</Text>
              ) : step.durationSeconds ? (
                <Text style={styles.timer}>⏱ {formatDuration(step.durationSeconds)}</Text>
              ) : null}
              <View style={styles.buttons}>
                <Btn label="‹ Back" onPress={() => run(cookSession.previous())} disabled={step.isFirst} />
                <Btn label="Repeat" onPress={() => run(cookSession.repeat())} />
                {step.durationSeconds ? <Btn label="Timer" onPress={() => run(cookSession.startStepTimer())} /> : null}
                <Btn label={step.isLast ? 'Finish' : 'Next ›'} onPress={() => run(cookSession.next())} primary />
              </View>
            </ScrollView>
          }
          secondary={
            step.ingredientsForStep?.length ? (
              <View style={styles.pane}>
                <Text style={styles.counter}>For this step</Text>
                {step.ingredientsForStep.map((i) => (
                  <Text key={i} style={styles.ingredient}>
                    • {i}
                  </Text>
                ))}
              </View>
            ) : null
          }
          placeholder={<View />}
        />
      )}
    </MaxWidthContainer>
  );
}

function Btn({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]}
      accessibilityRole="button">
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: { padding: 20, gap: 12 },
  message: { color: colors.muted, textAlign: 'center', marginTop: 48, fontSize: 18 },
  counter: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  stepText: { color: colors.text, fontSize: 28, lineHeight: 38 },
  timer: { color: colors.primary, fontSize: 22, fontWeight: '700' },
  ingredient: { color: colors.text, fontSize: 20, lineHeight: 30 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  btn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.primary },
  btnPrimary: { backgroundColor: colors.primary },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  btnTextPrimary: { color: colors.primaryText },
});
