package com.callrabbitsfoot.ownerhub;

import android.Manifest;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
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
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(
    name = "ImageManager",
    permissions = {
        @Permission(alias = "legacyStorage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class ImageManagerPlugin extends Plugin {
    private String safeMimeType(String value) {
        if (value == null || !value.toLowerCase(Locale.ROOT).startsWith("image/")) {
            return "image/jpeg";
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private String extensionForMime(String mimeType) {
        if (mimeType.contains("png")) return ".png";
        if (mimeType.contains("webp")) return ".webp";
        if (mimeType.contains("avif")) return ".avif";
        if (mimeType.contains("heic")) return ".heic";
        if (mimeType.contains("heif")) return ".heif";
        return ".jpg";
    }

    private String safeName(String value, String mimeType) {
        String name = value == null
            ? "RabbitFoot-Image"
            : value.replaceAll("[^A-Za-z0-9._-]", "-");
        if (name.isBlank()) name = "RabbitFoot-Image";
        if (!name.matches("(?i).+\\.(jpg|jpeg|png|webp|avif|heic|heif)$")) {
            name += extensionForMime(mimeType);
        }
        return name;
    }

    private byte[] imageBytes(PluginCall call) throws Exception {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isBlank()) throw new Exception("Image data is required.");
        return Base64.decode(base64, Base64.DEFAULT);
    }

    private File writeCacheImage(PluginCall call) throws Exception {
        String mimeType = safeMimeType(call.getString("mimeType"));
        File directory = new File(getContext().getCacheDir(), "shared-images");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new Exception("The image share folder could not be created.");
        }
        File file = new File(directory, safeName(call.getString("fileName"), mimeType));
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(imageBytes(call));
        }
        return file;
    }

    private Uri contentUri(File file) {
        return FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
    }

    @PluginMethod
    public void exportImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyStorage", call, "legacyStoragePermissionResult");
            return;
        }
        exportImageAfterPermission(call);
    }

    @PermissionCallback
    private void legacyStoragePermissionResult(PluginCall call) {
        if (getPermissionState("legacyStorage") == PermissionState.GRANTED) {
            exportImageAfterPermission(call);
        } else {
            call.reject("Storage permission is required to download images on Android 9 and older.");
        }
    }

    private void exportImageAfterPermission(PluginCall call) {
        Uri uri = null;
        try {
            byte[] bytes = imageBytes(call);
            String mimeType = safeMimeType(call.getString("mimeType"));
            String fileName = safeName(call.getString("fileName"), mimeType);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(
                    MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/RabbitFootOwnerHub"
                );
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = getContext().getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    values
                );
                if (uri == null) throw new Exception("Could not create the downloaded image.");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new Exception("Could not open the downloaded image.");
                    output.write(bytes);
                }
                ContentValues completed = new ContentValues();
                completed.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, completed, null, null);
            } else {
                File directory = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "RabbitFootOwnerHub"
                );
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new Exception("The Downloads folder could not be created.");
                }
                File destination = new File(directory, fileName);
                try (FileOutputStream output = new FileOutputStream(destination)) {
                    output.write(bytes);
                }
                uri = Uri.fromFile(destination);
            }

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            if (uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                getContext().getContentResolver().delete(uri, null, null);
            }
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        try {
            String mimeType = safeMimeType(call.getString("mimeType"));
            Uri uri = contentUri(writeCacheImage(call));
            Intent share = new Intent(Intent.ACTION_SEND)
                .setType(mimeType)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, call.getString("title", "Rabbit's Foot image"))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(share, "Send image"));
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void printImage(PluginCall call) {
        try {
            byte[] bytes = imageBytes(call);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) throw new Exception("The image format could not be printed.");

            File printDirectory = new File(getContext().getCacheDir(), "printed-images");
            if (!printDirectory.exists() && !printDirectory.mkdirs()) {
                bitmap.recycle();
                throw new Exception("The image print folder could not be created.");
            }
            File pdfFile = new File(printDirectory, "owner-hub-image-" + System.currentTimeMillis() + ".pdf");
            createPrintPdf(bitmap, pdfFile);
            bitmap.recycle();

            PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            String title = call.getString("title", "Rabbit's Foot image");
            getActivity().runOnUiThread(() -> {
                manager.print(title, new PdfFilePrintAdapter(pdfFile, title), null);
                call.resolve();
            });
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private void createPrintPdf(Bitmap bitmap, File destination) throws Exception {
        final int pageWidth = 612;
        final int pageHeight = 792;
        final float margin = 36f;
        PdfDocument document = new PdfDocument();
        try {
            PdfDocument.PageInfo pageInfo = new PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create();
            PdfDocument.Page page = document.startPage(pageInfo);
            page.getCanvas().drawColor(Color.WHITE);
            float availableWidth = pageWidth - (margin * 2f);
            float availableHeight = pageHeight - (margin * 2f);
            float scale = Math.min(
                availableWidth / bitmap.getWidth(),
                availableHeight / bitmap.getHeight()
            );
            float drawWidth = bitmap.getWidth() * scale;
            float drawHeight = bitmap.getHeight() * scale;
            float left = (pageWidth - drawWidth) / 2f;
            float top = (pageHeight - drawHeight) / 2f;
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            page.getCanvas().drawBitmap(
                bitmap,
                null,
                new RectF(left, top, left + drawWidth, top + drawHeight),
                paint
            );
            document.finishPage(page);
            try (FileOutputStream output = new FileOutputStream(destination)) {
                document.writeTo(output);
            }
        } finally {
            document.close();
        }
    }

    private static void copy(InputStream input, OutputStream output) throws Exception {
        byte[] buffer = new byte[16 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }

    private static class PdfFilePrintAdapter extends PrintDocumentAdapter {
        private final File file;
        private final String title;

        PdfFilePrintAdapter(File file, String title) {
            this.file = file;
            this.title = title;
        }

        @Override
        public void onLayout(
            PrintAttributes oldAttributes,
            PrintAttributes newAttributes,
            CancellationSignal cancellationSignal,
            LayoutResultCallback callback,
            Bundle extras
        ) {
            if (cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            callback.onLayoutFinished(
                new PrintDocumentInfo.Builder(title)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_PHOTO)
                    .setPageCount(1)
                    .build(),
                true
            );
        }

        @Override
        public void onWrite(
            PageRange[] pages,
            ParcelFileDescriptor destination,
            CancellationSignal cancellationSignal,
            WriteResultCallback callback
        ) {
            try (
                InputStream input = new FileInputStream(file);
                OutputStream output = new FileOutputStream(destination.getFileDescriptor())
            ) {
                copy(input, output);
                callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (Exception error) {
                callback.onWriteFailed(error.getMessage());
            }
        }
    }
}
