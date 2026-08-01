import Foundation
import React
import WidgetKit

@objc(WidgetBridge)
final class WidgetBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(writeToAppGroup:value:resolver:rejecter:)
  func writeToAppGroup(
    _ key: String,
    value: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: "group.com.khushuai.app"),
          let data = value.data(using: .utf8) else {
      reject("WIDGET_WRITE_FAILED", "Could not access the shared widget container.", nil)
      return
    }

    defaults.set(data, forKey: key)
    WidgetCenter.shared.reloadTimelines(ofKind: "SalahHeatmapWidget")
    resolve(nil)
  }
}
