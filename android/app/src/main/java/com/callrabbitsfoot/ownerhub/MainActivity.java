package com.callrabbitsfoot.ownerhub;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {
    private static final String STARTUP_LOG_TAG = "OwnerHubStartup";
    private static final String UPDATE_LOG_TAG = "OwnerHubUpdate";

    private AppUpdateManager appUpdateManager;
    private boolean updateCheckInFlight = false;
    private boolean updatePromptedThisSession = false;
    private boolean updateReadyDialogShowing = false;

    private final ActivityResultLauncher<IntentSenderRequest> updateActivityResultLauncher =
        registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                if (result.getResultCode() == Activity.RESULT_OK) {
                    Log.i(UPDATE_LOG_TAG, "Google Play update flow accepted");
                } else {
                    Log.i(
                        UPDATE_LOG_TAG,
                        "Google Play update flow closed with result " + result.getResultCode()
                    );
                }
            }
        );

    private final InstallStateUpdatedListener updateStateListener = state -> {
        Log.i(UPDATE_LOG_TAG, "Install status changed to " + state.installStatus());

        if (state.installStatus() == InstallStatus.DOWNLOADED) {
            showUpdateReadyDialog();
        } else if (state.installStatus() == InstallStatus.FAILED) {
            Log.e(UPDATE_LOG_TAG, "Google Play update download failed");
        } else if (state.installStatus() == InstallStatus.CANCELED) {
            Log.i(UPDATE_LOG_TAG, "Google Play update download canceled");
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.i(STARTUP_LOG_TAG, "MainActivity onCreate started");
        registerPlugin(DocumentManagerPlugin.class);
        registerPlugin(ImageManagerPlugin.class);
        registerPlugin(MicrophonePermissionPlugin.class);
        super.onCreate(savedInstanceState);
        lockOwnerHubToDeviceWidth();
        appUpdateManager = AppUpdateManagerFactory.create(this);
        appUpdateManager.registerListener(updateStateListener);
        Log.i(STARTUP_LOG_TAG, "Capacitor bridge initialized");
    }

    /**
     * Owner Hub is a responsive application, not a zoomable document. Keeping
     * WebView zoom enabled allowed an accidental pinch gesture to persist at
     * roughly 150%, which made every route wider than the phone and left a
     * blank strip beside the workspace. Lock the native shell to the device
     * viewport while the web layer continues to provide accessible text sizes.
     */
    private void lockOwnerHubToDeviceWidth() {
        WebView ownerHubWebView = getBridge().getWebView();
        WebSettings webSettings = ownerHubWebView.getSettings();

        webSettings.setSupportZoom(false);
        webSettings.setBuiltInZoomControls(false);
        webSettings.setDisplayZoomControls(false);
        webSettings.setTextZoom(100);
        ownerHubWebView.setInitialScale(0);

        Log.i(STARTUP_LOG_TAG, "WebView locked to the device viewport");
    }

    @Override
    public void onResume() {
        super.onResume();
        checkForAppUpdate();
    }

    @Override
    public void onDestroy() {
        if (appUpdateManager != null) {
            appUpdateManager.unregisterListener(updateStateListener);
        }
        super.onDestroy();
    }

    private void checkForAppUpdate() {
        if (appUpdateManager == null || updateCheckInFlight) {
            return;
        }

        updateCheckInFlight = true;
        Log.i(UPDATE_LOG_TAG, "Checking Google Play for an Owner Hub update");

        appUpdateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(appUpdateInfo -> {
                updateCheckInFlight = false;
                handleAppUpdateInfo(appUpdateInfo);
            })
            .addOnFailureListener(error -> {
                updateCheckInFlight = false;
                Log.w(
                    UPDATE_LOG_TAG,
                    "Update check unavailable; app startup will continue normally",
                    error
                );
            });
    }

    private void handleAppUpdateInfo(AppUpdateInfo appUpdateInfo) {
        if (appUpdateInfo.installStatus() == InstallStatus.DOWNLOADED) {
            showUpdateReadyDialog();
            return;
        }

        boolean updateAvailable =
            appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
        boolean flexibleUpdateAllowed =
            appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE);

        if (!updateAvailable || !flexibleUpdateAllowed || updatePromptedThisSession) {
            Log.i(
                UPDATE_LOG_TAG,
                "No flexible update prompt needed. Availability="
                    + appUpdateInfo.updateAvailability()
                    + ", installStatus="
                    + appUpdateInfo.installStatus()
            );
            return;
        }

        updatePromptedThisSession = true;

        try {
            boolean started = appUpdateManager.startUpdateFlowForResult(
                appUpdateInfo,
                updateActivityResultLauncher,
                AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
            );
            Log.i(UPDATE_LOG_TAG, "Google Play flexible update flow started=" + started);
        } catch (RuntimeException error) {
            Log.e(UPDATE_LOG_TAG, "Unable to open Google Play update flow", error);
        }
    }

    private void showUpdateReadyDialog() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || updateReadyDialogShowing) {
                return;
            }

            updateReadyDialogShowing = true;

            AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Update ready")
                .setMessage(
                    "The latest Owner Hub version has finished downloading. "
                        + "Restart now to install it."
                )
                .setPositiveButton("Restart now", (currentDialog, which) -> {
                    Log.i(UPDATE_LOG_TAG, "Completing downloaded Google Play update");
                    appUpdateManager.completeUpdate().addOnFailureListener(error ->
                        Log.e(UPDATE_LOG_TAG, "Unable to complete Google Play update", error)
                    );
                })
                .setNegativeButton("Later", null)
                .create();

            dialog.setOnDismissListener(ignored -> updateReadyDialogShowing = false);
            dialog.show();
        });
    }
}
