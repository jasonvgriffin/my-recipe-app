import { useEffect, useRef } from 'react';

import { onDataChange } from '@/storage/writes';

/** Reload a screen when local edits or a finished sync change on-device records. */
export function useOnDataChange(onChange: () => void): void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => onDataChange(() => onChangeRef.current()), []);
}
