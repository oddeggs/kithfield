/**
 * The share extension: something shared into Kithfield from another app, sent to a farm or left
 * in the App Group as a `ShareDraft` for the app to send.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'share',
  name: 'share',
  displayName: config.name,
  bundleIdentifier: '.share',
  deploymentTarget: '17.0',
  frameworks: ['UniformTypeIdentifiers'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
