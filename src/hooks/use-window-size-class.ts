import { useWindowDimensions } from 'react-native';

/**
 * Material window size classes by WIDTH (spec #23, docs/DESIGN.md):
 *   compact  < 600dp   (phones, folded foldables)
 *   medium   600–839dp (unfolded book-style foldables in portrait, small tablets)
 *   expanded >= 840dp  (unfolded foldables in landscape, tablets)
 * `useWindowDimensions` re-renders on fold/unfold/rotate/multi-window resize, so layouts adapt live
 * without an Activity restart and without losing React state.
 */
export type WindowSizeClass = 'compact' | 'medium' | 'expanded';

export const SIZE_CLASS_BREAKPOINTS = { medium: 600, expanded: 840 } as const;

export function getWindowSizeClass(widthDp: number): WindowSizeClass {
  if (widthDp >= SIZE_CLASS_BREAKPOINTS.expanded) return 'expanded';
  if (widthDp >= SIZE_CLASS_BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

export interface WindowLayout {
  sizeClass: WindowSizeClass;
  width: number;
  height: number;
  /** medium or expanded: use side-by-side panes instead of stacked screens. */
  isTwoPane: boolean;
  /** expanded: navigation may move to a side rail. */
  useNavigationRail: boolean;
}

export function getWindowLayout(width: number, height: number): WindowLayout {
  const sizeClass = getWindowSizeClass(width);
  return {
    sizeClass,
    width,
    height,
    isTwoPane: sizeClass !== 'compact',
    useNavigationRail: sizeClass === 'expanded',
  };
}

/** The one hook every screen uses for responsive decisions. Don't read Dimensions directly. */
export function useWindowSizeClass(): WindowLayout {
  const { width, height } = useWindowDimensions();
  return getWindowLayout(width, height);
}
