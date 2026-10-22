package com.rpm.prototype;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The notch's saves, without opening the planner: one WebView that is never on screen runs notch-actions.mjs, which
 * applies the planner's own change (editPlan) to the store and saves it through CompanionStore.write, so the version
 * check, Undo and alert scheduling are the planner's. It starts when the island opens and closes after two idle minutes.
 */
final class NotchRunner {
    interface Answer {
        /** On the main thread: {ok:true, kind, token, ...} or {ok:false, message}. */
        void on(JSONObject answer);
    }

    static final String PAGE = "https://rpm.local/notch-actions.html";
    static final String CHANGED = "com.rpm.prototype.STORE_CHANGED_OUTSIDE";
    static final long TIMEOUT_MS = 10_000;
    static final long IDLE_MS = 120_000;
    private static final String NO_ANSWER = "The phone did not respond. Your last saved data is intact.";

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final List<Runnable> queued = new ArrayList<>();
    private final Map<String, Call> calls = new HashMap<>();
    private final Runnable idle = () -> NotchController.safely("runner idle", this::release);
    private WebView web;
    private boolean ready;
    private int serial;

    private static final class Call {
        final Answer answer;
        final long started;
        final Runnable timeout;
        final String action;

        Call(Answer answer, long started, Runnable timeout, String action) {
            this.answer = answer;
            this.started = started;
            this.timeout = timeout;
            this.action = action;
        }
    }

    /**
     * While an activity shows, runs {@code refresh} after each notch save, so an open planner or Capture reads the store
     * again instead of saving over it. Unregister the returned receiver when the activity pauses.
     */
    static android.content.BroadcastReceiver onSaved(Context c, Runnable refresh) {
        android.content.BroadcastReceiver r = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context context, android.content.Intent intent) {
                refresh.run();
            }
        };
        android.content.IntentFilter filter = new android.content.IntentFilter(CHANGED);
        c.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED);
        return r;
    }

    NotchRunner(Context context) {
        this.context = context;
    }

    /** The island opened: start the page, or have it read the store again, so a tap only applies and saves. */
    void warm() {
        if (web != null && ready) web.evaluateJavascript("window.rpmNotchPreload()", null);
        start();
    }

    private void start() {
        main.removeCallbacks(idle);
        main.postDelayed(idle, IDLE_MS);
        if (web != null) return;
        ready = false;
        web = new WebView(context);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        // A WebView that is never on screen gets a background renderer, which made each save take seconds.
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        web.addJavascriptInterface(new Bridge(), "RpmNotch");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return CompanionSurface.serve(context, r);
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                NotchActions.log(context, "notch.runner", "error", NotchActions.payload("renderer", detail.didCrash() ? "crashed" : "killed"));
                main.post(() -> NotchController.safely("runner gone", NotchRunner.this::release));
                return true;
            }
        });
        web.loadUrl(PAGE);
        NotchActions.log(context, "notch.runner", "started", null);
    }

    /** Sends one request ({action:"drink"}, {action:"done",id,start}, {action:"alert",id,type}, {action:"undo",token}). */
    void run(JSONObject request, Answer answer) {
        start();
        String id = "n" + (++serial);
        Runnable timeout = () -> NotchController.safely("runner timeout", () -> deliver(id, failure(NO_ANSWER)));
        calls.put(id, new Call(answer, SystemClock.uptimeMillis(), timeout, request.optString("action")));
        main.postDelayed(timeout, TIMEOUT_MS);
        Runnable send = () -> {
            if (web != null) web.evaluateJavascript("window.rpmNotchRun(" + JSONObject.quote(id) + "," + request + ")", null);
        };
        if (ready) send.run();
        else queued.add(send);
    }

    /** Closes the page; a request still waiting is answered as not done. */
    void release() {
        main.removeCallbacks(idle);
        queued.clear();
        for (String id : new ArrayList<>(calls.keySet())) deliver(id, failure(NO_ANSWER));
        if (web != null) {
            web.removeJavascriptInterface("RpmNotch");
            web.destroy();
            web = null;
            NotchActions.log(context, "notch.runner", "released", null);
        }
        ready = false;
    }

    private void deliver(String id, JSONObject answer) {
        Call call = calls.remove(id);
        if (call == null) return;
        main.removeCallbacks(call.timeout);
        long ms = SystemClock.uptimeMillis() - call.started;
        NotchActions.log(context, "notch.runner." + call.action, answer.optBoolean("ok") ? "saved" : "error",
                NotchActions.payload("ms", ms, "kind", answer.optString("kind")));
        call.answer.on(answer);
    }

    private static JSONObject failure(String message) {
        try {
            return new JSONObject().put("ok", false).put("message", message);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private void reply(String id, Object value, String error) {
        main.post(() -> {
            if (web != null) web.evaluateJavascript("window.rpmBridgeResult(" + JSONObject.quote(id) + "," + (value == null ? "null" : value.toString())
                    + "," + (error == null ? "null" : JSONObject.quote(error)) + ")", null);
        });
    }

    /** Only what the page needs: read the store, write it with the version it read, and answer the notch. */
    private final class Bridge {
        @JavascriptInterface
        public void ready() {
            main.post(() -> NotchController.safely("runner ready", () -> {
                ready = true;
                if (web != null) web.evaluateJavascript("window.rpmNotchPreload()", null);
                List<Runnable> now = new ArrayList<>(queued);
                queued.clear();
                for (Runnable r : now) r.run();
            }));
        }

        @JavascriptInterface
        public void invoke(String id, String action, String payload) {
            if (id == null || !id.matches("[a-f0-9-]{36}:[0-9]{1,12}") || payload == null || payload.length() > 16 * 1024 * 1024) return;
            work.execute(() -> {
                JSONObject p;
                try {
                    p = new JSONObject(payload);
                } catch (JSONException e) {
                    reply(id, null, "The phone could not finish that action.");
                    return;
                }
                BridgeCallRecord log = new BridgeCallRecord(action, p);
                try {
                    Object result;
                    switch (action) {
                        case "load":
                            result = new JSONObject().put("data", Optional.<Object>ofNullable(CompanionStore.read(context)).orElse(JSONObject.NULL));
                            break;
                        case "save":
                            CompanionStore.write(context, p.getJSONObject("data"), p.getInt("expected"));
                            context.sendBroadcast(new android.content.Intent(CHANGED).setPackage(context.getPackageName()));
                            result = new JSONObject();
                            break;
                        default:
                            throw new IllegalArgumentException("Unsupported phone action.");
                    }
                    log.result(result);
                    reply(id, result, null);
                } catch (Exception e) {
                    reply(id, null, log.fail(e));
                } finally {
                    log.record(context, id, "notch:" + action);
                }
            });
        }

        @JavascriptInterface
        public void finish(String id, String answer) {
            main.post(() -> NotchController.safely("runner answer", () -> {
                JSONObject a;
                try {
                    a = new JSONObject(answer);
                } catch (JSONException e) {
                    Log.w(NotchController.TAG, "runner answer unreadable", e);
                    a = failure(NO_ANSWER);
                }
                deliver(id, a);
            }));
        }
    }
}
