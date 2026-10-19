/**
 * The notification service extension: puts the farm's still (the image the app rendered for its
 * widgets) on a push about that farm before iOS shows it. Pushes reach it with `mutable-content`.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'notification-service',
  name: 'notifications',
  displayName: config.name,
  bundleIdentifier: '.notifications',
  deploymentTarget: '17.0',
  frameworks: ['UserNotifications'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
