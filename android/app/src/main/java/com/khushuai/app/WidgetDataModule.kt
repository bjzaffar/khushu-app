package com.khushuai.app

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "WidgetDataModule"

    @ReactMethod
    fun writeHeatmapData(json: String) {
        reactApplicationContext
            .getSharedPreferences(SalahHeatmapWidgetProvider.PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(SalahHeatmapWidgetProvider.HEATMAP_DATA_KEY, json)
            .apply()

        SalahHeatmapWidgetProvider.updateAll(reactApplicationContext)
    }
}
