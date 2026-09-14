package com.khushuai.app

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ExactAlarmModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "ExactAlarmModule"

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            promise.resolve(true)
            return
        }

        val alarmManager = reactApplicationContext
            .getSystemService(Context.ALARM_SERVICE) as AlarmManager
        promise.resolve(alarmManager.canScheduleExactAlarms())
    }

    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            promise.resolve(null)
            return
        }

        try {
            val intent = Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:${reactApplicationContext.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("EXACT_ALARM_SETTINGS_UNAVAILABLE", error)
        }
    }
}
