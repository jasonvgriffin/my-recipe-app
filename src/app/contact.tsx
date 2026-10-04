import { Linking, ScrollView, Text, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { makeStyles } from '@/hooks/use-theme';
import { CONTACT_EMAIL, CONTACT_INTRO, contactMailto } from '@/lib/contact';

/**
 * More → Contact Us (v1.0.7). Exactly Jason's text; the address is tappable and opens the mail app (mailto:, subject
 * "My Recipe App feedback"). Nothing is sent from the app itself.
 */
export default function ContactScreen() {
  const styles = useStyles();
  const bottomInset = useBottomInset();
  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + bottomInset }]} testID="contact-screen">
      <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.text}>
        <View style={styles.card}>
          <Text style={styles.body} testID="contact-text">
            {CONTACT_INTRO} Send email to{' '}
            <Text
              style={styles.link}
              accessibilityRole="link"
              accessibilityHint="Opens your email app"
              onPress={() => void Linking.openURL(contactMailto()).catch(() => undefined)}
              testID="contact-email">
              {CONTACT_EMAIL}
            </Text>
          </Text>
        </View>
      </MaxWidthContainer>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  scroll: { padding: 16, flexGrow: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  body: { color: colors.text, fontSize: 18, lineHeight: 27 },
  link: { color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
}));
