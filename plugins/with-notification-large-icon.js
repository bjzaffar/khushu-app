const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');

const LARGE_ICON_SOURCE = path.join('assets', 'images', 'notification-large-icon.png');
const LARGE_ICON_RESOURCE_NAME = 'khushu_notification_large_icon';
const LARGE_ICON_META_DATA = 'expo.modules.notifications.large_notification_icon';

function withNotificationLargeIcon(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults
    );
    const metaData = application['meta-data'] || [];
    const entry = {
      $: {
        'android:name': LARGE_ICON_META_DATA,
        'android:resource': `@drawable/${LARGE_ICON_RESOURCE_NAME}`,
      },
    };
    const existingIndex = metaData.findIndex(
      (item) => item.$?.['android:name'] === LARGE_ICON_META_DATA
    );

    if (existingIndex >= 0) {
      metaData[existingIndex] = entry;
    } else {
      metaData.push(entry);
    }
    application['meta-data'] = metaData;
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const source = path.join(modConfig.modRequest.projectRoot, LARGE_ICON_SOURCE);
      const destinationDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable-nodpi'
      );
      const destination = path.join(
        destinationDirectory,
        `${LARGE_ICON_RESOURCE_NAME}.png`
      );

      fs.mkdirSync(destinationDirectory, { recursive: true });
      fs.copyFileSync(source, destination);
      return modConfig;
    },
  ]);
}

module.exports = withNotificationLargeIcon;
