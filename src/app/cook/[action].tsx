import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { CookingMode } from '@/components/cooking-mode';
import { FeatureGate, FeatureLocked } from '@/components/feature-gate';
import { cookSession, parseCookDeepLink, runCookCommand, type CookCommand, type CookResult } from '@/cooking';
import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { effectiveUnitSystem } from '@/lib/units';
import { colors } from '@/lib/theme';
import { armStepTimer, cancelStepTimerNotifications } from '@/notifications/step-timers';
import { recipeStore } from '@/storage/recipes';
import { setCooked } from '@/lib/recipe-utils';
import type { Recipe, UnitSystem } from '@/types/recipe';

/**
 * Cooking mode (spec #19) and cook-with-me deep links (spec #24).
 * myrecipeapp://cook/{recipeId} | next | previous | current | repeat | timer | end
 * Both the buttons and the links call `cookSession`, so they stay on the same step.
 */
export default function CookScreen() {
  const { via } = useLocalSearchParams<{ via?: string }>();
  const feature = via === 'app' ? 'cookingMode' : 'cookWithMe';
  return (
    <FeatureGate id={feature} fallback={<FeatureLocked id={feature} />}>
      <CookSessionScreen via={via === 'app' ? 'app' : 'deep_link'} />
    </FeatureGate>
  );
}

function CookSessionScreen({ via }: { via: 'app' | 'deep_link' }) {
  const params = useLocalSearchParams<{ action: string; step?: string }>();
  const action = String(params.action);
  const stepQuery = typeof params.step === 'string' ? params.step : undefined;
  const settings = useSettings();
  const timersEnabled = useFeature('timers').available;
  const unitsEnabled = useFeature('unitConversion').available;
  const [result, setResult] = useState<CookResult | undefined>();
  const [recipe, setRecipe] = useState<Recipe | undefined>();
  const [scaled, setScaled] = useState<{ id: string; value: number } | undefined>();
  const [permission, setPermission] = useState<'granted' | 'denied' | undefined>();

  const viaRef = useRef(via);
  useEffect(() => {
    viaRef.current = via;
  }, [via]);

  const perform = useCallback(
    async (cmd: CookCommand) => {
      const prev = cmd.action === 'start' ? await cookSession.getState() : undefined;
      const next = await runCookCommand(cookSession, cmd, { via: viaRef.current });
      // A successful start replaces the session and drops its timers, so drop their notifications too.
      if (cmd.action === 'start' && next.ok && prev?.timers.length) {
        await cancelStepTimerNotifications(
          prev.recipeId,
          prev.timers.map((t) => t.stepIndex),
        );
      }
      if (next.ok && next.event === 'timer_started' && 'step' in next && next.step.timer && timersEnabled) {
        const armed = await armStepTimer({
          recipeId: next.step.recipeId,
          recipeTitle: next.step.title,
          stepIndex: next.step.timer.stepIndex,
          endsAt: next.step.timer.endsAt,
        });
        setPermission(armed.permission);
      }
      setResult(next);
    },
    [timersEnabled],
  );

  const performRef = useRef(perform);
  useEffect(() => {
    performRef.current = perform;
  }, [perform]);

  useEffect(() => {
    const link = stepQuery
      ? `myrecipeapp://cook/${encodeURIComponent(action)}?step=${encodeURIComponent(stepQuery)}`
      : `myrecipeapp://cook/${encodeURIComponent(action)}`;
    const cmd = parseCookDeepLink(link);
    if (!cmd) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      if (!cancelled) void performRef.current(cmd);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [action, stepQuery]);

  const step = result?.ok && 'step' in result ? result.step : undefined;
  const finished = result?.ok && result.event === 'finished';
  const recipeId = step?.recipeId ?? (result?.ok && 'recipeId' in result ? result.recipeId : undefined);

  useEffect(() => {
    if (!recipeId) return;
    let active = true;
    recipeStore.get(recipeId).then((r) => {
      if (active) setRecipe(r);
    });
    return () => {
      active = false;
    };
  }, [recipeId]);

  const system: UnitSystem | 'original' = effectiveUnitSystem(recipe, settings);
  const targetServings = scaled && recipe && scaled.id === recipe.id ? scaled.value : undefined;
  const servings = targetServings ?? recipe?.servings ?? 1;

  async function setUnit(next: UnitSystem | 'original') {
    if (!recipe) return;
    const saved = await recipeStore.save({ ...recipe, unitSystem: next });
    setRecipe(saved);
  }

  async function markCooked() {
    if (!recipe) return;
    const saved = await recipeStore.save(setCooked(recipe, true));
    setRecipe(saved);
  }

  const message = !result
    ? undefined
    : !result.ok
      ? result.message
      : result.event === 'ended'
        ? 'Session ended.'
        : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: step?.title ?? recipe?.title ?? 'Cooking' }} />
      {!result ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <CookingMode
          step={finished ? undefined : step}
          recipe={recipe}
          finished={finished}
          message={message}
          keepAwake={settings.cookingModeKeepAwake}
          unitSystem={system}
          targetServings={servings}
          onAdjustServings={(delta) =>
            setScaled((prev) => {
              if (!recipe) return prev;
              const base = prev?.id === recipe.id ? prev.value : recipe.servings;
              return { id: recipe.id, value: Math.max(1, base + delta) };
            })
          }
          onUnitSystem={(u) => void setUnit(u)}
          unitsEnabled={unitsEnabled}
          timersEnabled={timersEnabled}
          permission={permission}
          onPrevious={() => void perform({ action: 'previous' })}
          onNext={() => void perform({ action: 'next' })}
          onRepeat={() => void perform({ action: 'repeat' })}
          onTimer={() => void perform({ action: 'timer' })}
          onGoTo={(index) => {
            void cookSession.goTo(index).then(setResult);
          }}
          onEnd={() => {
            void perform({ action: 'end' }).then(() => {
              if (router.canGoBack()) router.back();
            });
          }}
          onMarkCooked={recipe && !recipe.cooked ? () => void markCooked() : undefined}
        />
      )}
    </View>
  );
}
