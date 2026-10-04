import { Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { StarRating } from '@/components/star-rating';
import { COOKED_RECENTLY_DAYS, type RecipeBrowse, type RecipeSort } from '@/lib/recipe-utils';
import { makeStyles } from '@/hooks/use-theme';

const SORTS: { id: RecipeSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'title', label: 'A–Z' },
  { id: 'rating', label: 'Rating' },
  { id: 'lastCooked', label: 'Last cooked' },
];

/**
 * Combinable recipe list filters (spec #9) plus tag (#20) and rating (#22) and sort. v1.0.5: shown inside the
 * “Advanced search” sheet opened from the filter button beside the search box (`AdvancedSearchSheet`), not on the
 * page; categories are the Recipes tab's own grouping and are managed there. State lives in the parent so folding
 * the device doesn't clear it.
 */
export function RecipeFilters({
  browse,
  onChange,
  tagNames,
  showTags,
  showRatings,
}: {
  browse: RecipeBrowse;
  onChange: (next: RecipeBrowse) => void;
  tagNames: string[];
  showTags: boolean;
  showRatings: boolean;
}) {
  const styles = useStyles();
  function patch(partial: Partial<RecipeBrowse>) {
    onChange({ ...browse, ...partial });
  }

  const facetsClear =
    browse.cooked === undefined && !browse.recent && browse.tags.length === 0 && !browse.minRating;

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
      </View>

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

    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 12, paddingTop: 10 },
  block: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
}));
