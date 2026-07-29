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

  useEffect(() => {
    const index = values.indexOf(selectedValue);
    if (index >= 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, []);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(index, values.length - 1));
      onValueChange(values[clamped]);
    },
    [values, onValueChange]
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
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
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
