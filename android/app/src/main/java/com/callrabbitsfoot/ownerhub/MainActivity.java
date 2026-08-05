package com.callrabbitsfoot.ownerhub;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DocumentManagerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
