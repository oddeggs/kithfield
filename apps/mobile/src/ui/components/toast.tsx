import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { fadeTo, sheetTo } from '../motion/motion';
import { useReduceMotion } from '../motion/reduce-motion';
import { NoticeCard } from './card';

interface Toast {
  id: number;
  text: string;
  icon?: string;
}

interface ToastApi {
  /** Shows a short notice at the top for a few seconds, and reads it out politely. */
  show: (text: string, icon?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const VISIBLE_MS = 3500;
const RISE = 8;

/**
 * Toasts: the notice card (`01 Foundations`, Cards) arriving at the top of the screen, rising the
 * 8 points the design's hint cards rise (`12 States`, first-run hints); under Reduce Motion it only fades.
 * One at a time, the newest replacing the last.
 */
export function ToastHost({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const next = useRef(0);
  const show = useCallback((text: string, icon?: string) => {
    next.current += 1;
    setToast({ id: next.current, text, ...(icon ? { icon } : {}) });
    AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  const gone = useCallback(() => setToast(null), []);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onGone={gone} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onGone }: { readonly toast: Toast; readonly onGone: () => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const shown = useSharedValue(0);
  const lift = useSharedValue(reduce ? 0 : RISE);
  useEffect(() => {
    shown.set(fadeTo(1));
    lift.set(sheetTo(0, reduce));
    const timer = setTimeout(() => {
      shown.set(
        fadeTo(0, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(onGone);
        }),
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shown, lift, reduce, onGone]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: lift.get() }],
  }));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16 }}
    >
      <Animated.View style={style}>
        <NoticeCard text={toast.text} {...(toast.icon ? { icon: toast.icon } : {})} />
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast needs a ToastHost');
  return api;
}
