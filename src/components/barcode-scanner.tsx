import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { FeatureLocked } from '@/components/feature-gate';
import { TwoPaneLayout, useBottomInset } from '@/components/layout';
import { useFeature } from '@/hooks/use-feature';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { barcodeLookup, type BarcodeProduct } from '@/pantry';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'need-name'; barcode: string; reason: 'not_found' | 'offline' }
  | { kind: 'error'; message: string };

export interface BarcodeScannerProps {
  /** Entry point visibility: barcodeScan gate AND the host screen's feature (pantry / shopping list) shown. */
  visible: boolean;
  hiddenLabel: string;
  /**
   * Called once with the product (Open Food Facts name + brand, or the name the user typed once). The host
   * adds it to its list and navigates back; a thrown error is shown and scanning resumes.
   */
  onProduct: (product: BarcodeProduct) => Promise<void>;
  testID?: string;
}

/**
 * THE barcode scanner (spec #27), shared by the pantry and the shopping list. Camera (EAN-13 / EAN-8 /
 * UPC-A / UPC-E) → `barcodeLookup` (name and brand only, never nutrition) → `onProduct`. Unknown and offline
 * codes ask for a name once; that mapping is saved for the household.
 */
export function BarcodeScanner({ visible, hiddenLabel, onProduct, testID = 'barcode-layout' }: BarcodeScannerProps) {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const access = useFeature('barcodeScan');
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [name, setName] = useState('');
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
        <Text style={styles.muted}>{hiddenLabel}</Text>
      </View>
    );
  }

  async function deliver(product: BarcodeProduct) {
    setState({ kind: 'saving' });
    try {
      await onProduct(product);
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not add that item.' });
      lastCode.current = '';
    }
  }

  async function onBarcodeScanned({ data }: { data: string }) {
    if (busy.current || state.kind === 'need-name' || state.kind === 'saving') return;
    if (lastCode.current === data) return;
    lastCode.current = data;
    busy.current = true;
    try {
      const looked = await barcodeLookup.lookup(data);
      if (looked.status === 'found') {
        await deliver(looked.product);
      } else if (looked.status === 'not_found' || looked.status === 'offline') {
        setName('');
        setState({ kind: 'need-name', barcode: looked.barcode, reason: looked.status });
      } else {
        setState({ kind: 'error', message: looked.error });
        lastCode.current = '';
      }
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not look up that barcode.' });
      lastCode.current = '';
    } finally {
      busy.current = false;
    }
  }

  async function saveName() {
    if (state.kind !== 'need-name') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await deliver(await barcodeLookup.saveUserProduct(state.barcode, trimmed));
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not save that name.' });
    }
  }

  const paused = state.kind === 'need-name' || state.kind === 'saving';
  const camera = !permission ? (
    <View style={styles.center} testID="barcode-permission-loading">
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : permission.granted ? (
    <CameraView
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
      onBarcodeScanned={paused ? undefined : onBarcodeScanned}
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
    <View style={[styles.panel, { paddingBottom: 16 + bottomInset }]} testID="barcode-result">
      {state.kind === 'idle' ? <Text style={styles.muted}>Point the camera at a barcode.</Text> : null}
      {state.kind === 'saving' ? <ActivityIndicator color={colors.primary} testID="barcode-saving" /> : null}
      {state.kind === 'error' ? (
        <>
          <Text style={styles.error} testID="barcode-error">
            {state.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryBtn}
            testID="barcode-scan-another"
            onPress={() => {
              lastCode.current = '';
              setState({ kind: 'idle' });
            }}>
            <Text style={styles.secondaryBtnText}>Try again</Text>
          </Pressable>
        </>
      ) : null}
      {state.kind === 'need-name' ? (
        <View style={styles.form}>
          <Text style={styles.body}>
            {state.reason === 'offline'
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
          />
          <Pressable
            accessibilityRole="button"
            style={styles.primaryBtn}
            testID="barcode-save-button"
            onPress={() => void saveName()}>
            <Text style={styles.primaryBtnText}>Save and add</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return <TwoPaneLayout testID={testID} compact="stack" primary={camera} secondary={panel} primaryWidth={420} />;
}

const useStyles = makeStyles((colors) => ({
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
}));
