/**
 * The Messages sticker extension: offers the stickers the app rendered into the App Group, so
 * "Mine" matches what the critter is wearing now.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'imessage',
  name: 'stickers',
  displayName: config.name,
  bundleIdentifier: '.stickers',
  deploymentTarget: '17.0',
  frameworks: ['Messages'],
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
