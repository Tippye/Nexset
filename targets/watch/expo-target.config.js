/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch',
  name: 'NexsetWatch',
  displayName: 'Nexset',
  bundleIdentifier: '.watch',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'WatchKit', 'WatchConnectivity', 'HealthKit', 'CoreMotion', 'AppIntents'],
  entitlements: {
    'com.apple.developer.healthkit': true,
    'com.apple.security.application-groups':
      config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [
        'group.com.anonymous.nexset',
      ],
  },
});
