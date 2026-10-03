import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { FeatureLocked } from '@/components/feature-gate';
import { TwoPaneLayout } from '@/components/layout';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { colors } from '@/lib/theme';
import { barcodeLookup } from '@/pantry';
import { pantryStore } from '@/storage/pantry';

type ScanResult =
  | { kind: 'idle' }
  | { kind: 'added'; name: string; quantity: number }
  | { kind: 'need-name'; barcode: string; reason: 'not_found' | 'offline' }
  | { kind: 'error'; message: string };

/**
 * Barcode camera (spec #27). Looks up EAN/UPC via `barcodeLookup`, then adds or increments a pantry item.
 * Unknown and offline codes ask for a name once; that mapping is saved for the household.
 */
export default function BarcodeScanScreen() {
  const access = useFeature('barcodeScan');
  const visible = useFeatureVisible('barcodeScan');
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult>({ kind: 'idle' });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const lastCode = useRef('');
  const asked = useRef(false);

  useEffect(() => {
    if (!permission || asked.current || !access.available || !visible) return;
    if (!permission.granted && permission.canAskAgain) {
      asked.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission, access.available, visible]);

  if (!access.available) return <FeatureLocked id="barcodeScan" />;
  if (!visible) {
    return (
      <View style={styles.center} testID="barcode-hidden">
        <Text style={styles.muted}>Pantry is turned off in Settings.</Text>
      </View>
    );
  }

  async function onBarcodeScanned({ data }: { data: string }) {
    if (busy.current || result.kind === 'need-name') return;
    if (lastCode.current === data) return;
    lastCode.current = data;
    busy.current = true;
    try {
      const looked = await barcodeLookup.lookup(data);
      if (looked.status === 'found') {
        const item = await pantryStore.addScanned({
          barcode: looked.product.barcode,
          name: looked.product.name,
        });
        setResult({ kind: 'added', name: item.name, quantity: item.quantity ?? 1 });
      } else if (looked.status === 'not_found' || looked.status === 'offline') {
        setName('');
        setResult({ kind: 'need-name', barcode: looked.barcode, reason: looked.status });
      } else {
        setResult({ kind: 'error', message: looked.error });
        lastCode.current = '';
      }
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Could not look up that barcode.' });
      lastCode.current = '';
    } finally {
      busy.current = false;
    }
  }

  async function saveName() {
    if (result.kind !== 'need-name') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const product = await barcodeLookup.saveUserProduct(result.barcode, trimmed);
      const item = await pantryStore.addScanned({
        barcode: product.barcode,
        name: product.name,
      });
      setResult({ kind: 'added', name: item.name, quantity: item.quantity ?? 1 });
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Could not save that name.' });
    } finally {
      setSaving(false);
    }
  }

  const camera = !permission ? (
    <View style={styles.center} testID="barcode-permission-loading">
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : permission.granted ? (
    <CameraView
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
      onBarcodeScanned={result.kind === 'need-name' ? undefined : onBarcodeScanned}
    />
  ) : (
    <View style={styles.center} testID="barcode-permission">
      <Text style={styles.body}>Camera access is needed to scan barcodes.</Text>
      <Pressable
        accessibilityRole="button"
        style={styles.primaryBtn}
        testID="barcode-allow-camera"
        onPress={() => {
          if (permission.canAskAgain) void requestPermission();
          else void Linking.openSettings();
        }}>
        <Text style={styles.primaryBtnText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
      </Pressable>
    </View>
  );

  const panel = (
    <View style={styles.panel} testID="barcode-result">
      {result.kind === 'idle' ? <Text style={styles.muted}>Point the camera at a barcode.</Text> : null}
      {result.kind === 'added' ? (
        <Text style={styles.body} testID="barcode-added">
          Added {result.name}. You now have {result.quantity}.
        </Text>
      ) : null}
      {result.kind === 'error' ? (
        <Text style={styles.error} testID="barcode-error">
          {result.message}
        </Text>
      ) : null}
      {result.kind === 'need-name' ? (
        <View style={styles.form}>
          <Text style={styles.body}>
            {result.reason === 'offline'
              ? 'Couldn’t reach the product database. Type a name and we’ll remember it.'
              : 'No product found for this barcode. Type a name once — it’s saved for next time.'}
          </Text>
          <TextInput
            testID="barcode-name-input"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Product name"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
          />
          <Pressable
            accessibilityRole="button"
            style={styles.primaryBtn}
            testID="barcode-save-button"
            disabled={saving}
            onPress={() => void saveName()}>
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save and add'}</Text>
          </Pressable>
        </View>
      ) : null}
      {result.kind !== 'idle' && result.kind !== 'need-name' ? (
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryBtn}
          testID="barcode-scan-another"
          onPress={() => {
            lastCode.current = '';
            setResult({ kind: 'idle' });
          }}>
          <Text style={styles.secondaryBtnText}>Scan another</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <TwoPaneLayout testID="barcode-layout" compact="stack" primary={camera} secondary={panel} primaryWidth={420} />
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, minHeight: 240, backgroundColor: colors.background },
  center: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: colors.background,
  },
  panel: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.background },
  form: { gap: 10 },
  body: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 16 },
  error: { color: colors.danger, fontSize: 16 },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: colors.primaryText, fontWeight: '700' },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600' },
});
