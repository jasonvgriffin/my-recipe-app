import { Text } from 'react-native';

import { useFeature } from '@/hooks/use-feature';
import { useHousehold } from '@/hooks/use-household';
import { makeStyles } from '@/hooks/use-theme';
import { authorLabel } from '@/sync/authors';

/** Attribution for a synced record. Blank when the author has no display name or sharing is unavailable. */
export function SharedBy({ createdBy }: { createdBy?: string }) {
  const styles = useStyles();
  const access = useFeature('householdSync');
  const { account } = useHousehold();
  if (!access.available) return null;
  const name = authorLabel(createdBy, account);
  if (!name) return null;
  return (
    <Text style={styles.text} testID="shared-by">
      Shared by {name}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  text: { color: colors.muted, marginTop: 4, fontSize: 14 },
}));
