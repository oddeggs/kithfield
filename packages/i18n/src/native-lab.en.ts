import type { EnCatalogue } from './catalogue-types';

/**
 * The development native lab: checks that each native module the depth features use is built
 * into this app. The screen is left out of release builds; this catalogue, like every other,
 * ships with the app.
 */
export const nativeLabEn = {
  'nativeLab.title': 'Native lab',
  'nativeLab.subtitle': 'Development only: is each native module built into this app?',
  'nativeLab.calls': 'Fire room calls: {state}',
  'nativeLab.purchases': 'Purchases: {state}',
  'nativeLab.purchasesKey': 'Purchases key: {state}',
  'nativeLab.network': 'Network: {state}',
  'nativeLab.appGroup': 'App Group: {state}',
  'nativeLab.activities': 'Live Activities: {state}',
  'nativeLab.backgroundTasks': 'Background tasks: {state}',
  'nativeLab.reloadWidgets': 'Reload widgets',
  'nativeLab.reloaded': 'Asked iOS to reload the widgets',
  'nativeLab.state.ready': 'ready',
  'nativeLab.state.missing': 'missing',
  'nativeLab.state.set': 'set',
  'nativeLab.state.unset': 'not set',
  'nativeLab.state.on': 'on',
  'nativeLab.state.off': 'off',
  'nativeLab.state.checking': 'checking',
  'nativeLab.failed': 'Failed: {error}',
} as const satisfies EnCatalogue;
