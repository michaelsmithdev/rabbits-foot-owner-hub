package com.callrabbitsfoot.ownerhub;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String STARTUP_LOG_TAG = "OwnerHubStartup";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.i(STARTUP_LOG_TAG, "MainActivity onCreate started");
        registerPlugin(DocumentManagerPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        super.onCreate(savedInstanceState);
        Log.i(STARTUP_LOG_TAG, "Capacitor bridge initialized");
    }
}
