package com.khushuai.app.modules

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.khushuai.app.widget.SalahHeatmapWidgetProvider
import org.json.JSONObject

class WidgetDataModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetDataModule"

    @ReactMethod
    fun writeHeatmapData(jsonString: String) {
        val context = reactApplicationContext
        val prefs: SharedPreferences = context.getSharedPreferences(
            SalahHeatmapWidgetProvider.PREFS_NAME,
            Context.MODE_WORLD_READABLE
        )
        prefs.edit()
            .putString(SalahHeatmapWidgetProvider.KEY_DATA, jsonString)
            .apply()

        // Notify all widget instances to refresh
        SalahHeatmapWidgetProvider.refreshAllWidgets(context)
    }

    @ReactMethod
    fun readHeatmapData(promise: com.facebook.react.bridge.Promise) {
        val context = reactApplicationContext
        val prefs: SharedPreferences = context.getSharedPreferences(
            SalahHeatmapWidgetProvider.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val json = prefs.getString(SalahHeatmapWidgetProvider.KEY_DATA, null)
        promise.resolve(json)
    }
}
