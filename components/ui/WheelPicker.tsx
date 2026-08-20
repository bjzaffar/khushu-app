import { useRef, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Text } from '@/components/ui/Typography';

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;

interface Props {
  values: number[];
  selectedValue: number;
  onValueChange: (val: number) => void;
  formatValue?: (val: number) => string;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}

export function WheelPicker({ values, selectedValue, onValueChange, formatValue, onTouchStart, onTouchEnd }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const index = values.indexOf(selectedValue);
    let initialScrollTimeout: ReturnType<typeof setTimeout> | null = null;
    if (index >= 0) {
      initialScrollTimeout = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
      }, 50);
    }
    return () => {
      if (initialScrollTimeout) clearTimeout(initialScrollTimeout);
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
    // The initial value determines only the first non-animated scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitOffset = useCallback(
    (offsetY: number) => {
      const index = Math.round(offsetY / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, values.length - 1));
      const nextValue = values[clamped];
      if (nextValue !== selectedValue) onValueChange(nextValue);
    },
    [onValueChange, selectedValue, values]
  );

  const clearPendingSettle = useCallback(() => {
    if (!settleTimeoutRef.current) return;
    clearTimeout(settleTimeoutRef.current);
    settleTimeoutRef.current = null;
  }, []);

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      clearPendingSettle();
      // If momentum starts, it cancels this fallback. If it does not, this is
      // the final resting value and is committed once after the snap settles.
      settleTimeoutRef.current = setTimeout(() => {
        settleTimeoutRef.current = null;
        commitOffset(offsetY);
      }, 100);
    },
    [clearPendingSettle, commitOffset]
  );

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearPendingSettle();
      commitOffset(e.nativeEvent.contentOffset.y);
    },
    [clearPendingSettle, commitOffset]
  );

  const centerOffset = Math.floor(VISIBLE_ITEMS / 2);

  return (
    <View
      style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS, position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: ITEM_HEIGHT * centerOffset,
          left: 0,
          right: 0,
          height: ITEM_HEIGHT,
          backgroundColor: 'rgba(90, 122, 90, 0.08)',
          borderRadius: 10,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: 'rgba(90, 122, 90, 0.18)',
        }}
      />
      <ScrollView
        ref={scrollRef}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * centerOffset }}
        onMomentumScrollBegin={clearPendingSettle}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
      >
        {values.map((v) => {
          const selected = v === selectedValue;
          return (
            <View
              key={v}
              style={{ height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                style={{
                  fontSize: selected ? 20 : 15,
                  fontWeight: selected ? '600' : '400',
                  color: selected ? '#5A7A5A' : '#9B9189',
                }}
              >
                {formatValue ? formatValue(v) : String(v)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
