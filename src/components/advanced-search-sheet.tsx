import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipeFilters } from '@/components/recipe-filters';
import { makeStyles } from '@/hooks/use-theme';
import type { RecipeBrowse } from '@/lib/recipe-utils';

/**
 * “Advanced search” bottom sheet (v1.0.5): the Recipes tab filters (All / Cooked / Not cooked yet / Cooked
 * recently, tags, minimum rating, sort) moved off the page into this sheet, opened by the filter button next to
 * the search box. Changes apply live; Reset returns every option to its default (the typed keyword stays).
 */
export function AdvancedSearchSheet({
  visible,
  onClose,
  browse,
  onChange,
  onReset,
  active,
  tagNames,
  showTags,
  showRatings,
}: {
  visible: boolean;
  onClose: () => void;
  browse: RecipeBrowse;
  onChange: (next: RecipeBrowse) => void;
  onReset: () => void;
  /** Any option away from its default (enables Reset). */
  active: boolean;
  tagNames: string[];
  showTags: boolean;
  showRatings: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close advanced search"
          testID="advanced-search-backdrop"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="advanced-search-sheet">
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Advanced search
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
              accessibilityState={{ disabled: !active }}
              disabled={!active}
              onPress={onReset}
              style={styles.headerBtn}
              testID="clear-filters">
              <Text style={[styles.reset, !active && styles.disabled]}>Reset</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <RecipeFilters
              browse={browse}
              onChange={onChange}
              tagNames={tagNames}
              showTags={showTags}
              showRatings={showRatings}
            />
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.done} testID="advanced-search-done">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
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
    maxHeight: '85%',
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  headerBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  reset: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
  body: { paddingBottom: 12 },
  done: {
    minHeight: 48,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
}));
