import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { makeStyles, useColors } from '@/hooks/use-theme';

/** Add and remove free-form tags on one recipe (spec #20). */
export function TagEditor({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (text: string) => void;
  onRemove: (tag: string) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [draft, setDraft] = useState('');

  function add() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  }

  return (
    <View>
      <View style={styles.row}>
        {tags.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${t}`}
            onPress={() => onRemove(t)}
            testID={`remove-tag-${t}`}
            style={styles.tag}>
            <Text style={styles.tagText}>#{t}  ×</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          placeholder="Add a tag"
          placeholderTextColor={colors.placeholder}
          testID="add-tag-input"
          onSubmitEditing={add}
        />
        <Pressable accessibilityRole="button" onPress={add} style={styles.add} testID="add-tag-button">
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.tagBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: { color: colors.primary, fontSize: 14 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
  },
  add: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.primaryText, fontWeight: '700' },
}));
