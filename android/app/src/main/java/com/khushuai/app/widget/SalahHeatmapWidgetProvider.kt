package com.khushuai.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import com.khushuai.app.R
import org.json.JSONObject

class SalahHeatmapWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS_NAME = "widget_heatmap_data"
        const val KEY_DATA = "heatmap_json"

        private val cellIds = arrayOf(
            intArrayOf(
                R.id.cell_0_0, R.id.cell_0_1, R.id.cell_0_2, R.id.cell_0_3,
                R.id.cell_0_4, R.id.cell_0_5, R.id.cell_0_6
            ),
            intArrayOf(
                R.id.cell_1_0, R.id.cell_1_1, R.id.cell_1_2, R.id.cell_1_3,
                R.id.cell_1_4, R.id.cell_1_5, R.id.cell_1_6
            ),
            intArrayOf(
                R.id.cell_2_0, R.id.cell_2_1, R.id.cell_2_2, R.id.cell_2_3,
                R.id.cell_2_4, R.id.cell_2_5, R.id.cell_2_6
            ),
            intArrayOf(
                R.id.cell_3_0, R.id.cell_3_1, R.id.cell_3_2, R.id.cell_3_3,
                R.id.cell_3_4, R.id.cell_3_5, R.id.cell_3_6
            ),
            intArrayOf(
                R.id.cell_4_0, R.id.cell_4_1, R.id.cell_4_2, R.id.cell_4_3,
                R.id.cell_4_4, R.id.cell_4_5, R.id.cell_4_6
            ),
        )

        // cell_{row}_{col} — col index for Friday (col=4 in the grid, but data index is col=4)
        private const val JUMUAH_COL = 4
        private const val JUMUAH_ROW = 1 // Dhuhr

        private val cellDrawables = intArrayOf(
            R.drawable.cell_unlogged,
            R.drawable.cell_rating_1,
            R.drawable.cell_rating_2,
            R.drawable.cell_rating_3,
            R.drawable.cell_rating_4,
            R.drawable.cell_rating_5,
        )

        private val jumuahDrawables = intArrayOf(
            R.drawable.cell_jumuah,
            R.drawable.cell_jumuah_1,
            R.drawable.cell_jumuah_2,
            R.drawable.cell_jumuah_3,
            R.drawable.cell_jumuah_4,
            R.drawable.cell_jumuah_5,
        )

        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_heatmap)

            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_WORLD_READABLE)
            val json = prefs.getString(KEY_DATA, null)

            if (json != null) {
                try {
                    val obj = JSONObject(json)
                    val cells = obj.getJSONArray("cells")

                    for (idx in 0 until minOf(35, cells.length())) {
                        val cell = cells.getJSONObject(idx)
                        val row = idx / 7
                        val col = idx % 7

                        val rating = if (cell.has("rating") && !cell.isNull("rating")) {
                            cell.getInt("rating")
                        } else {
                            0
                        }

                        val drawableId = if (row == JUMUAH_ROW && col == JUMUAH_COL) {
                            // Friday Dhuhr — use jumuah variant with gold underline
                            jumuahDrawables[rating.coerceIn(0, 5)]
                        } else {
                            cellDrawables[rating.coerceIn(0, 5)]
                        }

                        views.setImageViewResource(cellIds[row][col], drawableId)
                    }
                } catch (e: Exception) {
                    // Leave all cells as unlogged
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        fun refreshAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, SalahHeatmapWidgetProvider::class.java)
            )
            for (id in ids) {
                updateAppWidget(context, manager, id)
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onEnabled(context: Context) {}

    override fun onDisabled(context: Context) {}
}
