package com.khushuai.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONObject

class SalahHeatmapWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (widgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, widgetId)
        }
    }

    companion object {
        private const val TAG = "SalahHeatmapWidget"
        private const val PREFS_NAME = "KhushuWidgetPrefs"
        private const val KEY_HEATMAP_DATA = "heatmap_data"

        private val GREEN_SCALE = intArrayOf(
            0xFFE5EDE5.toInt(),
            0xFFC0D8C0.toInt(),
            0xFF9BC29B.toInt(),
            0xFF75AC75.toInt(),
            0xFF5A7A5A.toInt()
        )
        private const val UNLOGGED_COLOR = 0xFFC5B9A8.toInt()
        private const val JUMUAH_GOLD = 0xFFC9A84C.toInt()

        private val CELL_IDS = intArrayOf(
            R.id.cell_fajr_0, R.id.cell_fajr_1, R.id.cell_fajr_2, R.id.cell_fajr_3, R.id.cell_fajr_4, R.id.cell_fajr_5, R.id.cell_fajr_6,
            R.id.cell_dhuhr_0, R.id.cell_dhuhr_1, R.id.cell_dhuhr_2, R.id.cell_dhuhr_3, R.id.cell_dhuhr_4, R.id.cell_dhuhr_5, R.id.cell_dhuhr_6,
            R.id.cell_asr_0, R.id.cell_asr_1, R.id.cell_asr_2, R.id.cell_asr_3, R.id.cell_asr_4, R.id.cell_asr_5, R.id.cell_asr_6,
            R.id.cell_maghrib_0, R.id.cell_maghrib_1, R.id.cell_maghrib_2, R.id.cell_maghrib_3, R.id.cell_maghrib_4, R.id.cell_maghrib_5, R.id.cell_maghrib_6,
            R.id.cell_isha_0, R.id.cell_isha_1, R.id.cell_isha_2, R.id.cell_isha_3, R.id.cell_isha_4, R.id.cell_isha_5, R.id.cell_isha_6
        )

        fun updateWidget(context: Context) {
            try {
                val appWidgetManager = AppWidgetManager.getInstance(context)
                val componentName = ComponentName(context, SalahHeatmapWidgetProvider::class.java)
                val widgetIds = appWidgetManager.getAppWidgetIds(componentName)
                for (widgetId in widgetIds) {
                    updateAppWidget(context, appWidgetManager, widgetId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error updating widget", e)
            }
        }

        private fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            try {
                val views = RemoteViews(context.packageName, R.layout.widget_heatmap)

                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val json = prefs.getString(KEY_HEATMAP_DATA, null)

                if (json != null) {
                    try {
                        val obj = JSONObject(json)
                        val cells = obj.getJSONArray("cells")
                        if (cells.length() == 35) {
                            for (i in 0 until 35) {
                                val cell = cells.getJSONObject(i)
                                val rating = if (cell.isNull("rating")) null else cell.getInt("rating")
                                val day = cell.optString("day", "")
                                val salah = cell.optString("salah", "")

                                val color = if (day == "F" && salah == "dhuhr") {
                                    JUMUAH_GOLD
                                } else if (rating != null && rating in 1..5) {
                                    GREEN_SCALE[rating - 1]
                                } else {
                                    UNLOGGED_COLOR
                                }

                                views.setInt(CELL_IDS[i], "setBackgroundColor", color)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing heatmap data", e)
                    }
                }

                appWidgetManager.updateAppWidget(widgetId, views)
            } catch (e: Exception) {
                Log.e(TAG, "Error updating widget $widgetId", e)
            }
        }
    }
}
