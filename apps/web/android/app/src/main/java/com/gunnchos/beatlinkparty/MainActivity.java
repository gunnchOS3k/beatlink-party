package com.gunnchos.beatlinkparty;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static MainActivity instance;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    WebView.setWebContentsDebuggingEnabled(true);
    super.onCreate(savedInstanceState);
    instance = this;
  }

  @Override
  public void onDestroy() {
    if (instance == this) {
      instance = null;
    }
    super.onDestroy();
  }

  public static void navigateForAcceptance(String path) {
    if (instance == null || path == null || path.isEmpty()) {
      return;
    }
    final Bridge bridge = instance.getBridge();
    if (bridge == null || bridge.getWebView() == null) {
      return;
    }
    final String safe = path.replace("\\", "\\\\").replace("'", "\\'");
    instance.runOnUiThread(
        () ->
            bridge
                .getWebView()
                .evaluateJavascript("window.location.assign('" + safe + "');", null));
  }
}
