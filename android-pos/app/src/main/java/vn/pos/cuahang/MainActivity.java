package vn.pos.cuahang;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.Arrays;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String POS_URL = "https://pos-cuahang-vqw1.onrender.com/";
    private static final String ACTION_USB_PERMISSION = "vn.pos.cuahang.USB_PERMISSION";

    private WebView webView;
    private UsbManager usbManager;
    private final ExecutorService printExecutor = Executors.newSingleThreadExecutor();
    private volatile byte[] pendingPrintBytes = null;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
            if (granted && device != null) {
                byte[] job = pendingPrintBytes;
                pendingPrintBytes = null;
                if (job != null) {
                    printExecutor.execute(() -> sendBytesToUsb(device, job));
                }
            } else {
                pendingPrintBytes = null;
                toast("Chưa cấp quyền USB cho máy in!");
            }
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(usbReceiver, filter);
        }

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    toast("Đang kết nối lại máy chủ POS...");
                    view.postDelayed(() -> view.loadUrl(POS_URL), 3000);
                }
            }
        });

        webView.addJavascriptInterface(new UsbPrinterBridge(), "AndroidPrinter");
        setContentView(webView);
        webView.loadUrl(POS_URL);

        // Xin quyền USB trước ngay khi mở app nếu máy in đã cắm sẵn
        UsbDevice existing = findUsbPrinter();
        if (existing != null && !usbManager.hasPermission(existing)) {
            requestUsbPermission(existing);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try { unregisterReceiver(usbReceiver); } catch (Exception ignored) {}
        printExecutor.shutdownNow();
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
    }

    private void requestUsbPermission(UsbDevice device) {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_USB_PERMISSION), flags);
        usbManager.requestPermission(device, pi);
    }

    private UsbDevice findUsbPrinter() {
        if (usbManager == null) return null;
        HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
        UsbDevice fallback = null;
        for (UsbDevice dev : devices.values()) {
            for (int i = 0; i < dev.getInterfaceCount(); i++) {
                UsbInterface intf = dev.getInterface(i);
                int cls = intf.getInterfaceClass();
                if (cls == UsbConstants.USB_CLASS_PRINTER && findBulkOutEndpoint(intf) != null) {
                    return dev;
                }
                if (fallback == null
                        && cls != UsbConstants.USB_CLASS_HID
                        && cls != UsbConstants.USB_CLASS_HUB
                        && cls != UsbConstants.USB_CLASS_MASS_STORAGE
                        && findBulkOutEndpoint(intf) != null) {
                    fallback = dev;
                }
            }
        }
        return fallback;
    }

    private UsbInterface findPrinterInterface(UsbDevice dev) {
        UsbInterface fallback = null;
        for (int i = 0; i < dev.getInterfaceCount(); i++) {
            UsbInterface intf = dev.getInterface(i);
            if (intf.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER && findBulkOutEndpoint(intf) != null) {
                return intf;
            }
            if (fallback == null && findBulkOutEndpoint(intf) != null) {
                fallback = intf;
            }
        }
        return fallback;
    }

    private UsbEndpoint findBulkOutEndpoint(UsbInterface intf) {
        for (int j = 0; j < intf.getEndpointCount(); j++) {
            UsbEndpoint ep = intf.getEndpoint(j);
            if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                return ep;
            }
        }
        return null;
    }

    private boolean sendBytesToUsb(UsbDevice device, byte[] data) {
        UsbInterface intf = findPrinterInterface(device);
        if (intf == null) {
            toast("Không tìm thấy cổng dữ liệu máy in USB!");
            return false;
        }
        UsbEndpoint epOut = findBulkOutEndpoint(intf);
        if (epOut == null) {
            toast("Không tìm thấy đầu ra máy in USB!");
            return false;
        }
        UsbDeviceConnection conn = usbManager.openDevice(device);
        if (conn == null) {
            toast("Không mở được kết nối máy in USB!");
            return false;
        }
        try {
            if (!conn.claimInterface(intf, true)) {
                toast("Máy in USB đang bị ứng dụng khác chiếm!");
                return false;
            }
            int chunkSize = 4096;
            for (int offset = 0; offset < data.length; offset += chunkSize) {
                int len = Math.min(chunkSize, data.length - offset);
                byte[] chunk = (offset == 0 && len == data.length)
                        ? data
                        : Arrays.copyOfRange(data, offset, offset + len);
                int transferred = conn.bulkTransfer(epOut, chunk, len, 5000);
                if (transferred < 0) {
                    toast("Lỗi truyền dữ liệu tới máy in USB!");
                    return false;
                }
            }
            return true;
        } finally {
            try { conn.releaseInterface(intf); } catch (Exception ignored) {}
            try { conn.close(); } catch (Exception ignored) {}
        }
    }

    private class UsbPrinterBridge {
        @JavascriptInterface
        public boolean printBase64(String base64Data) {
            if (base64Data == null || base64Data.isEmpty()) return false;
            byte[] bytes;
            try {
                bytes = Base64.decode(base64Data, Base64.DEFAULT);
            } catch (Exception e) {
                toast("Dữ liệu in không hợp lệ!");
                return false;
            }

            UsbDevice device = findUsbPrinter();
            if (device == null) {
                toast("Chưa cắm máy in USB (SPR02)!");
                return false;
            }

            if (!usbManager.hasPermission(device)) {
                pendingPrintBytes = bytes;
                requestUsbPermission(device);
                return true;
            }

            printExecutor.execute(() -> sendBytesToUsb(device, bytes));
            return true;
        }

        @JavascriptInterface
        public boolean isUsbPrinterConnected() {
            return findUsbPrinter() != null;
        }
    }
}
