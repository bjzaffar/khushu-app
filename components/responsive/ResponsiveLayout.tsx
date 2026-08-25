import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import {
  createResponsiveLayout,
  type ResponsiveLayout,
} from '@/lib/responsive/metrics';

const fallbackLayout = createResponsiveLayout(375, 812, 1);
const ResponsiveLayoutContext = createContext<ResponsiveLayout>(fallbackLayout);

export function ResponsiveLayoutProvider({ children }: PropsWithChildren) {
  const { width, height } = useWindowDimensions();
  const pixelRatio = PixelRatio.get();
  const value = useMemo(
    () => createResponsiveLayout(width, height, pixelRatio),
    [height, pixelRatio, width],
  );

  return (
    <ResponsiveLayoutContext.Provider value={value}>
      {children}
    </ResponsiveLayoutContext.Provider>
  );
}

export function useResponsiveLayout() {
  return useContext(ResponsiveLayoutContext);
}
