package com.khushuai.app

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class WidgetDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val MODULE_NAME = "WidgetDataModule"
        private const val PREFS_NAME = "KhushuWidgetPrefs"
        private const val KEY_HEATMAP_DATA = "heatmap_data"
    }

    override fun getName(): String = MODULE_NAME

    private fun getPrefs(): SharedPreferences {
        return reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun writeHeatmapData(json: String) {
        val prefs = getPrefs()
        prefs.edit()
            .putString(KEY_HEATMAP_DATA, json)
            .apply()

        SalahHeatmapWidgetProvider.updateWidget(reactApplicationContext)
    }
}
