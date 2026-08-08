package com.callrabbitsfoot.ownerhub;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(name = "DocumentManager")
public class DocumentManagerPlugin extends Plugin {
    private File documentDirectory() {
        File base = getContext().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (base == null) base = new File(getContext().getFilesDir(), "Documents");
        File directory = new File(base, "RabbitFootOwnerHub");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private File safeFile(String path) throws Exception {
        File file = new File(path).getCanonicalFile();
        File internal = getContext().getFilesDir().getCanonicalFile();
        File external = getContext().getExternalFilesDir(null);
        boolean allowed = file.getPath().startsWith(internal.getPath()) ||
            (external != null && file.getPath().startsWith(external.getCanonicalPath()));
        if (!allowed || !file.exists()) throw new Exception("Document file is unavailable.");
        return file;
    }

    private String safeName(String value) {
        String name = value == null ? "RabbitFoot-Document.pdf" : value.replaceAll("[^A-Za-z0-9._-]", "-");
        return name.toLowerCase(Locale.ROOT).endsWith(".pdf") ? name : name + ".pdf";
    }

    @PluginMethod
    public void savePdf(PluginCall call) {
        try {
            String base64 = call.getString("base64");
            if (base64 == null) throw new Exception("PDF data is required.");
            File file = new File(documentDirectory(), safeName(call.getString("fileName")));
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(Base64.decode(base64, Base64.DEFAULT));
            }
            JSObject result = new JSObject();
            result.put("path", file.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void exportPdf(PluginCall call) {
        try {
            File source = safeFile(call.getString("path"));
            String fileName = safeName(call.getString("fileName"));
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RabbitFootOwnerHub");
                uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Could not create the Downloads file.");
                try (InputStream input = new FileInputStream(source); OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new Exception("Could not open the Downloads file.");
                    copy(input, output);
                }
            } else {
                File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File destination = new File(directory, fileName);
                try (InputStream input = new FileInputStream(source); OutputStream output = new FileOutputStream(destination)) { copy(input, output); }
                uri = Uri.fromFile(destination);
            }
            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private Uri contentUri(File file) {
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    @PluginMethod
    public void openPdf(PluginCall call) {
        try {
            Uri uri = contentUri(safeFile(call.getString("path")));
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(Intent.createChooser(intent, "Open PDF").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    @PluginMethod
    public void sharePdf(PluginCall call) {
        try {
            Uri uri = contentUri(safeFile(call.getString("path")));
            Intent share = new Intent(Intent.ACTION_SEND).setType("application/pdf")
                .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_SUBJECT, call.getString("title"))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(Intent.createChooser(share, "Send PDF").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    @PluginMethod
    public void printPdf(PluginCall call) {
        try {
            File file = safeFile(call.getString("path"));
            PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            String title = call.getString("title", "Rabbit's Foot Document");
            getActivity().runOnUiThread(() -> {
                manager.print(title, new PdfFilePrintAdapter(file, title), null);
                call.resolve();
            });
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    @PluginMethod
    public void deletePdf(PluginCall call) {
        try {
            File file = safeFile(call.getString("path"));
            if (!file.delete()) throw new Exception("The PDF could not be deleted.");
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage(), error); }
    }

    private static void copy(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[16 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }

    private static class PdfFilePrintAdapter extends PrintDocumentAdapter {
        private final File file;
        private final String title;
        PdfFilePrintAdapter(File file, String title) { this.file = file; this.title = title; }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
            if (cancellationSignal.isCanceled()) { callback.onLayoutCancelled(); return; }
            callback.onLayoutFinished(new PrintDocumentInfo.Builder(title).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN).build(), true);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal, WriteResultCallback callback) {
            try (InputStream input = new FileInputStream(file); OutputStream output = new FileOutputStream(destination.getFileDescriptor())) {
                copy(input, output);
                callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (Exception error) { callback.onWriteFailed(error.getMessage()); }
        }
    }
}
