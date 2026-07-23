package com.khushuai.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

class SalahHeatmapWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { appWidgetId ->
            appWidgetManager.updateAppWidget(appWidgetId, createRemoteViews(context))
        }
    }

    companion object {
        const val PREFERENCES_NAME = "khushu_widget"
        const val HEATMAP_DATA_KEY = "widget_heatmap_data"

        private val DAY_LABELS = listOf("M", "T", "W", "T", "F", "S", "S")
        private val SALAH_LABELS = listOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")
        private val CELL_BACKGROUNDS = intArrayOf(
            R.drawable.heatmap_cell_unlogged,
            R.drawable.heatmap_cell_1,
            R.drawable.heatmap_cell_2,
            R.drawable.heatmap_cell_3,
            R.drawable.heatmap_cell_4,
            R.drawable.heatmap_cell_5,
        )

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, SalahHeatmapWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component)
            if (ids.isNotEmpty()) {
                manager.updateAppWidget(ids, createRemoteViews(context))
            }
        }

        private fun createRemoteViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.salah_heatmap_widget)
            val ratings = loadRatings(context)

            DAY_LABELS.forEach { label ->
                val dayView = RemoteViews(context.packageName, R.layout.salah_heatmap_widget_day)
                dayView.setTextViewText(R.id.widget_day_label, label)
                views.addView(R.id.widget_day_headers, dayView)
            }

            SALAH_LABELS.forEachIndexed { row, salah ->
                val rowView = RemoteViews(context.packageName, R.layout.salah_heatmap_widget_row)
                rowView.setTextViewText(R.id.widget_salah_label, salah)

                DAY_LABELS.indices.forEach { column ->
                    val cellView = RemoteViews(context.packageName, R.layout.salah_heatmap_widget_cell)
                    val rating = ratings[column * SALAH_LABELS.size + row]
                    cellView.setInt(
                        R.id.widget_heatmap_cell,
                        "setBackgroundResource",
                        CELL_BACKGROUNDS[rating ?: 0],
                    )
                    val isJumuah = row == 1 && column == 4
                    cellView.setViewVisibility(
                        R.id.widget_jumuah_marker,
                        if (isJumuah) View.VISIBLE else View.INVISIBLE,
                    )
                    rowView.addView(R.id.widget_cells, cellView)
                }
                views.addView(R.id.widget_rows, rowView)
            }

            val launchIntent = Intent(context, MainActivity::class.java)
            val launchPendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, launchPendingIntent)
            return views
        }

        private fun loadRatings(context: Context): List<Int?> {
            val json = context
                .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .getString(HEATMAP_DATA_KEY, null)
                ?: return List(35) { null }

            return try {
                val cells = JSONObject(json).optJSONArray("cells") ?: return List(35) { null }
                List(35) { index ->
                    cells.optJSONObject(index)
                        ?.takeIf { !it.isNull("rating") }
                        ?.optInt("rating")
                        ?.takeIf { it in 1..5 }
                }
            } catch (_: Exception) {
                List(35) { null }
            }
        }
    }
}
