import { router } from 'expo-router';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { OptionalFeature } from '@/components/optional-feature';
import { useFeatureVisible } from '@/hooks/use-feature';
import { pantryStore } from '@/storage/pantry';

/**
 * Pantry barcode scan (spec #27): adds or increments the pantry item (product name as its title, brand
 * secondary), then returns to the Pantry tab, which confirms what was added.
 */
export default function PantryScanScreen() {
  const visible = useFeatureVisible('barcodeScan');
  return (
    <OptionalFeature id="pantry" hiddenLabel="Pantry is turned off in Settings.">
      <BarcodeScanner
        visible={visible}
        hiddenLabel="Pantry is turned off in Settings."
        onProduct={async (product) => {
          const item = await pantryStore.addScanned(product);
          router.navigate({ pathname: '/pantry', params: { added: item.name } });
        }}
      />
    </OptionalFeature>
  );
}
