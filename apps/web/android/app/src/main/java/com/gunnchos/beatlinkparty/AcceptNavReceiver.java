package com.gunnchos.beatlinkparty;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Internal RC helper for adb navigation into Capacitor routes. */
public class AcceptNavReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) {
      return;
    }

    String path = intent.getStringExtra("path");
    String code = intent.getStringExtra("code");
    String name = intent.getStringExtra("name");
    boolean auto = intent.getBooleanExtra("auto", true);

    if ((path == null || path.isEmpty()) && code != null && !code.isEmpty()) {
      path =
          "/join?code="
              + Uri.encode(code)
              + "&name="
              + Uri.encode(name != null && !name.isEmpty() ? name : "PixelPlayer")
              + (auto ? "&auto=1" : "");
    }

    if (path == null || !path.startsWith("/")) {
      return;
    }
    if (!(path.startsWith("/join") || path.startsWith("/play/"))) {
      return;
    }
    MainActivity.navigateForAcceptance(path);
  }
}
