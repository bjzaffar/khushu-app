const fs = require('fs');
const path = require('path');
const {
  withEntitlementsPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

const APP_GROUP = 'group.com.khushuai.app';
const WIDGET_NAME = 'SalahHeatmapWidget';
const WIDGET_BUNDLE_ID = 'com.khushuai.app.widget';
const WIDGET_KIND = 'SalahHeatmapWidget';

function unquote(value) {
  return String(value || '').replace(/^"|"$/g, '');
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function setTargetBuildSettings(project, target, settings) {
  const configurationList = project.hash.project.objects.XCConfigurationList[
    target.pbxNativeTarget.buildConfigurationList
  ];

  for (const configuration of configurationList.buildConfigurations) {
    const buildConfiguration = project.hash.project.objects.XCBuildConfiguration[configuration.value];
    buildConfiguration.buildSettings = {
      ...buildConfiguration.buildSettings,
      ...settings,
    };
  }
}

function ensureGroup(project, name) {
  const existingKey = project.findPBXGroupKey({ name });
  if (existingKey) return existingKey;

  const group = project.addPbxGroup([], name, name);
  const { firstProject } = project.getFirstProject();
  project.getPBXGroupByKey(firstProject.mainGroup).children.push({
    value: group.uuid,
    comment: name,
  });
  return group.uuid;
}

function addSourceFile(project, filePath, targetUuid, groupKey) {
  if (!project.hasFile(filePath)) {
    project.addSourceFile(filePath, { target: targetUuid }, groupKey);
  }
}

function addFile(project, filePath, groupKey) {
  if (!project.hasFile(filePath)) {
    project.addFile(filePath, groupKey);
  }
}

function addWidgetTarget(project, marketingVersion) {
  const nativeTargets = project.hash.project.objects.PBXNativeTarget;
  for (const [uuid, target] of Object.entries(nativeTargets)) {
    if (!uuid.endsWith('_comment') && unquote(target.name) === WIDGET_NAME) {
      const existingTarget = { uuid, pbxNativeTarget: target };
      setTargetBuildSettings(project, existingTarget, { MARKETING_VERSION: marketingVersion });
      return existingTarget;
    }
  }

  const widgetTarget = project.addTarget(
    WIDGET_NAME,
    'app_extension',
    WIDGET_NAME,
    WIDGET_BUNDLE_ID
  );

  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', widgetTarget.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', widgetTarget.uuid);

  setTargetBuildSettings(project, widgetTarget, {
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    CODE_SIGN_ENTITLEMENTS: `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`,
    CURRENT_PROJECT_VERSION: '1',
    GENERATE_INFOPLIST_FILE: 'NO',
    INFOPLIST_FILE: `${WIDGET_NAME}/Info.plist`,
    IPHONEOS_DEPLOYMENT_TARGET: '16.0',
    MARKETING_VERSION: marketingVersion,
    PRODUCT_BUNDLE_IDENTIFIER: WIDGET_BUNDLE_ID,
    PRODUCT_NAME: WIDGET_NAME,
    SKIP_INSTALL: 'YES',
    SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '1',
  });

  // The xcode package creates the embed phase, but does not add Xcode's normal
  // code-sign-on-copy attributes for an app extension.
  const productReference = widgetTarget.pbxNativeTarget.productReference;
  const buildFiles = project.hash.project.objects.PBXBuildFile;
  for (const [key, buildFile] of Object.entries(buildFiles)) {
    if (!key.endsWith('_comment') && buildFile.fileRef === productReference) {
      buildFile.settings = {
        ATTRIBUTES: ['CodeSignOnCopy', 'RemoveHeadersOnCopy'],
      };
    }
  }

  return widgetTarget;
}

function withSalahHeatmapWidget(config) {
  config = withEntitlementsPlist(config, (modConfig) => {
    const groups = new Set(
      modConfig.modResults['com.apple.security.application-groups'] || []
    );
    groups.add(APP_GROUP);
    modConfig.modResults['com.apple.security.application-groups'] = [...groups];
    return modConfig;
  });

  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const sourceRoot = path.join(modConfig.modRequest.projectRoot, 'widget', 'ios');
    const appTarget = project.getTarget('com.apple.product-type.application');
    const appName = unquote(appTarget.target.name);
    const appGroupKey = project.findPBXGroupKey({ name: appName })
      || project.getFirstProject().firstProject.mainGroup;

    copyFile(
      path.join(sourceRoot, 'WidgetBridge.swift'),
      path.join(iosRoot, appName, 'WidgetBridge.swift')
    );
    copyFile(
      path.join(sourceRoot, 'WidgetBridge.m'),
      path.join(iosRoot, appName, 'WidgetBridge.m')
    );
    addSourceFile(project, `${appName}/WidgetBridge.swift`, appTarget.uuid, appGroupKey);
    addSourceFile(project, `${appName}/WidgetBridge.m`, appTarget.uuid, appGroupKey);

    const widgetTarget = addWidgetTarget(project, modConfig.version || '1.4.1');
    const widgetGroupKey = ensureGroup(project, WIDGET_NAME);
    const widgetFiles = [
      'SalahHeatmapEntry.swift',
      'SalahHeatmapView.swift',
      'SalahHeatmapWidget.swift',
      'Info.plist',
      `${WIDGET_NAME}.entitlements`,
    ];

    for (const file of widgetFiles) {
      copyFile(path.join(sourceRoot, file), path.join(iosRoot, WIDGET_NAME, file));
    }

    addSourceFile(
      project,
      `${WIDGET_NAME}/SalahHeatmapEntry.swift`,
      widgetTarget.uuid,
      widgetGroupKey
    );
    addSourceFile(
      project,
      `${WIDGET_NAME}/SalahHeatmapView.swift`,
      widgetTarget.uuid,
      widgetGroupKey
    );
    addSourceFile(
      project,
      `${WIDGET_NAME}/SalahHeatmapWidget.swift`,
      widgetTarget.uuid,
      widgetGroupKey
    );
    addFile(project, `${WIDGET_NAME}/Info.plist`, widgetGroupKey);
    addFile(project, `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`, widgetGroupKey);

    const appCapabilities = {
      'com.apple.ApplicationGroups.iOS': { enabled: 1 },
      'com.apple.InAppPurchase': { enabled: 1 },
    };
    project.addTargetAttribute('SystemCapabilities', appCapabilities, appTarget);
    project.addTargetAttribute(
      'SystemCapabilities',
      { 'com.apple.ApplicationGroups.iOS': { enabled: 1 } },
      widgetTarget
    );

    return modConfig;
  });
}

module.exports = withSalahHeatmapWidget;
