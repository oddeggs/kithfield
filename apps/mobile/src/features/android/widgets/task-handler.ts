import { FarmId } from '@kithfield/contracts';
import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget';

import { sendDewdrop } from './dewdrop-send';
import { markDewdropLeft, renderWidget } from './render-widget';

/**
 * Android runs this in the background whenever a widget is added, resized, due its half-hourly
 * redraw, or tapped somewhere that isn't a link (a dewdrop).
 */
const handleWidget: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  clickAction,
  clickActionData,
  renderWidget: draw,
}) => {
  if (widgetAction === 'WIDGET_DELETED') return;
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'DEWDROP') {
    const farm = FarmId.safeParse(clickActionData?.['farm']);
    if (farm.success) {
      // The phone's keystore can refuse the session (a restored backup): the widget still redraws.
      const left = await sendDewdrop(farm.data).catch(() => false);
      if (left) markDewdropLeft(farm.data);
    }
  }
  draw(renderWidget(widgetInfo));
};

/** Registers the widgets' background task: once, at the app's entry, before anything renders. */
export function registerWidgets(): void {
  registerWidgetTaskHandler(handleWidget);
}
