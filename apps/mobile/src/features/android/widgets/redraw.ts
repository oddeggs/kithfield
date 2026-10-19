import { requestWidgetUpdate } from 'react-native-android-widget';

import { leftReset, renderWidget, WIDGET_NAMES } from './render-widget';

/** Redraws every widget on the home screen from the files as they are now. */
export async function redrawWidgets(): Promise<void> {
  leftReset();
  await Promise.all(
    WIDGET_NAMES.map((widgetName) => requestWidgetUpdate({ widgetName, renderWidget })),
  );
}
