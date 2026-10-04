import { router } from 'expo-router';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { OptionalFeature } from '@/components/optional-feature';
import { useFeatureVisible } from '@/hooks/use-feature';

/**
 * Pantry barcode scan (spec #27). v1.0.7: nothing is saved here — returns to the Pantry tab with the product
 * (name, brand, barcode), which opens the pre-filled Edit item form for review (an existing item with the same
 * barcode/name opens with one more package).
 */
export default function PantryScanScreen() {
  const visible = useFeatureVisible('barcodeScan');
  return (
    <OptionalFeature id="pantry" hiddenLabel="Pantry is turned off in Settings.">
      <BarcodeScanner
        visible={visible}
        hiddenLabel="Pantry is turned off in Settings."
        onProduct={async (product) => {
          router.navigate({
            pathname: '/pantry',
            params: {
              scan: String(Date.now()),
              scanBarcode: product.barcode,
              scanName: product.name,
              scanBrand: product.brand ?? '',
            },
          });
        }}
      />
    </OptionalFeature>
  );
}
