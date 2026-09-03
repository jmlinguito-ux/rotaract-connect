package com.rotaractconnect.app.notifications

import android.content.Context
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.interfaces.PresentationDelegate

class RotaractNotificationsService : NotificationsService() {
    override fun getPresentationDelegate(context: Context): PresentationDelegate {
        return RotaractPresentationDelegate(context)
    }
}
