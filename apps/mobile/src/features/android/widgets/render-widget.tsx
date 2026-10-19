import type { WidgetInfo, WidgetRepresentation } from 'react-native-android-widget';

import { widgetCopy } from './widget-copy';
import { newestFarm, readWidgetState } from './widget-state';
import { DewdropWidget, FarmWidget, NextPlanWidget } from './widget-views';

/** The widgets by the names `ANDROID_WIDGETS` registers them under. */
export const WIDGET_NAMES = ['Farm', 'NextPlan', 'Dewdrop'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** Farms a dewdrop was left on from the widget since it was last drawn from fresh files. */
const leftFromWidget = new Set<string>();

export function markDewdropLeft(farm: string): void {
  leftFromWidget.add(farm);
}

/** Fresh files from the app: every drop shows ready again. */
export function leftReset(): void {
  leftFromWidget.clear();
}

/** One widget's frame, from the files as they are now. */
export function renderWidget(info: WidgetInfo): WidgetRepresentation {
  const state = readWidgetState();
  const copy = widgetCopy(state.data?.lang ?? 'en');
  const size = { width: info.width, height: info.height };
  const farm = newestFarm(state.data);
  const now = Date.now();
  switch (info.widgetName as WidgetName) {
    case 'NextPlan':
      return <NextPlanWidget state={state} farm={farm} copy={copy} size={size} now={now} />;
    case 'Dewdrop':
      return {
        light: (
          <DewdropWidget state={state} copy={copy} size={size} dark={false} left={leftFromWidget} />
        ),
        dark: <DewdropWidget state={state} copy={copy} size={size} dark left={leftFromWidget} />,
      };
    case 'Farm':
    default:
      return <FarmWidget state={state} farm={farm} copy={copy} size={size} now={now} />;
  }
}
