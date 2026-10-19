/**
 * The Home and Lock Screen widgets and the Live Activities (the plan's day, the fire). They read
 * what the app writes into the App Group; they run no JavaScript.
 *
 * Colours are `roles` in `@kithfield/theme` (background), day and night, as sRGB
 * colour sets in `Assets.xcassets`.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'widgets',
  displayName: config.name,
  bundleIdentifier: '.widgets',
  deploymentTarget: '17.0',
  frameworks: ['WidgetKit', 'SwiftUI', 'ActivityKit'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
