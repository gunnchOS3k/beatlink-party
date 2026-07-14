package com.gunnchos.beatlinkparty;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import java.nio.charset.StandardCharsets;

/** Internal RC helper for adb navigation into Capacitor routes / JS acceptance hooks. */
public class AcceptNavReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) {
      return;
    }

    String action = intent.getStringExtra("action");
    if ("js".equals(action) || "js_b64".equals(action)) {
      String js = intent.getStringExtra("js");
      if (js == null) js = intent.getStringExtra("arg");
      String b64 = intent.getStringExtra("js_b64");
      if (b64 != null && !b64.isEmpty()) {
        try {
          js = new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
          return;
        }
      }
      if (js != null && !js.isEmpty()) {
        MainActivity.evalJs(js);
      }
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
    if (!(path.startsWith("/join")
        || path.startsWith("/play/")
        || path.equals("/")
        || path.startsWith("/host"))) {
      return;
    }
    MainActivity.navigateForAcceptance(path);
  }
}
