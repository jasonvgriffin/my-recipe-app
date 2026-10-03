import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { StarRating } from '@/components/star-rating';
import { COOKED_RECENTLY_DAYS, type RecipeBrowse, type RecipeSort } from '@/lib/recipe-utils';
import { makeStyles } from '@/hooks/use-theme';
import type { Category } from '@/types/recipe';

const SORTS: { id: RecipeSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'title', label: 'A–Z' },
  { id: 'rating', label: 'Rating' },
  { id: 'lastCooked', label: 'Last cooked' },
];

/**
 * Combinable recipe list filters (spec #9) plus category (#3), tag (#20) and rating (#22).
 * Keyword search stays in the parent so it doesn't scroll away. State lives in the parent
 * so folding the device doesn't clear it.
 */
export function RecipeFilters({
  browse,
  onChange,
  categories,
  showCategories,
  tagNames,
  showTags,
  showRatings,
  showOrganize,
  filtersActive,
  onClear,
}: {
  browse: RecipeBrowse;
  onChange: (next: RecipeBrowse) => void;
  categories: Category[];
  showCategories: boolean;
  tagNames: string[];
  showTags: boolean;
  showRatings: boolean;
  showOrganize: boolean;
  filtersActive: boolean;
  onClear: () => void;
}) {
  const styles = useStyles();
  function patch(partial: Partial<RecipeBrowse>) {
    onChange({ ...browse, ...partial });
  }

  const facetsClear =
    browse.cooked === undefined && !browse.recent && !browse.categoryId && browse.tags.length === 0 && !browse.minRating;

  return (
    <View style={styles.wrap} testID="recipe-filters">
      <View style={styles.row}>
        <Chip
          label="All"
          active={facetsClear}
          testID="filter-all"
          onPress={() =>
            patch({ cooked: undefined, recent: false, categoryId: undefined, tags: [], minRating: undefined })
          }
        />
        <Chip
          label="Cooked"
          active={browse.cooked === true}
          testID="filter-cooked"
          onPress={() => patch({ cooked: browse.cooked === true ? undefined : true })}
        />
        <Chip
          label="Not cooked yet"
          active={browse.cooked === false}
          testID="filter-not-cooked"
          onPress={() => patch({ cooked: browse.cooked === false ? undefined : false })}
        />
        <Chip
          label={`Cooked recently (${COOKED_RECENTLY_DAYS}d)`}
          active={browse.recent}
          testID="filter-recent"
          onPress={() => patch({ recent: !browse.recent })}
        />
        {filtersActive ? (
          <Chip label="Clear" active={false} testID="clear-filters" onPress={onClear} accessibilityLabel="Clear filters" />
        ) : null}
      </View>

      {showCategories && categories.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.row}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={browse.categoryId === c.id}
                testID={`filter-category-${c.id}`}
                accessibilityLabel={`Filter category ${c.name}`}
                onPress={() => patch({ categoryId: browse.categoryId === c.id ? undefined : c.id })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {showTags && tagNames.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.row}>
            {tagNames.map((t) => (
              <Chip
                key={t}
                label={`#${t}`}
                active={browse.tags.includes(t)}
                testID={`filter-tag-${t}`}
                accessibilityLabel={`Filter tag ${t}`}
                onPress={() =>
                  patch({
                    tags: browse.tags.includes(t) ? browse.tags.filter((x) => x !== t) : [...browse.tags, t],
                  })
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      {showRatings ? (
        <View style={styles.block}>
          <Text style={styles.label}>Minimum rating</Text>
          <StarRating
            value={browse.minRating}
            testID="filter-rating"
            onChange={(minRating) => patch({ minRating })}
          />
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.label}>Sort</Text>
        <View style={styles.row}>
          {SORTS.filter((s) => showRatings || s.id !== 'rating').map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              active={browse.sort === s.id}
              testID={`sort-${s.id}`}
              accessibilityLabel={`Sort by ${s.label}`}
              onPress={() => patch({ sort: s.id })}
            />
          ))}
        </View>
      </View>

      {showOrganize ? (
        <Link href="/organize" asChild>
          <Pressable accessibilityRole="button" testID="organize-button" style={styles.manage}>
            <Text style={styles.manageText}>Manage categories & tags</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 12, paddingTop: 10 },
  block: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  manage: { minHeight: 44, justifyContent: 'center' },
  manageText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
}));
