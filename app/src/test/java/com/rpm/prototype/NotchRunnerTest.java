package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.os.Looper;
import android.webkit.WebView;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import java.lang.reflect.Field;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class)
public class NotchRunnerTest {
    private static WebView web(NotchRunner runner) throws Exception {
        Field f = NotchRunner.class.getDeclaredField("web");
        f.setAccessible(true);
        return (WebView) f.get(runner);
    }

    private static void pageReady(WebView web) throws Exception {
        Object bridge = shadowOf(web).getJavascriptInterface("RpmNotch");
        bridge.getClass().getMethod("ready").invoke(bridge);
        shadowOf(Looper.getMainLooper()).idle();
    }

    @Test
    public void aRequestTheNotchReportedAsNotSavedIsNeverSentWhenThePageLoadsLate() throws Exception {
        NotchRunner runner = new NotchRunner(RuntimeEnvironment.getApplication());
        List<JSONObject> answers = new ArrayList<>();
        runner.run(new JSONObject().put("action", "drink"), answers::add);
        WebView web = web(runner);
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(NotchRunner.TIMEOUT_MS + 1));
        assertEquals(1, answers.size());
        assertFalse(answers.get(0).optBoolean("ok"));
        pageReady(web);
        String js = shadowOf(web).getLastEvaluatedJavascript();
        assertFalse("timed-out request was still sent: " + js, js != null && js.contains("rpmNotchRun"));
    }

    @Test
    public void aRequestQueuedBeforeThePageIsReadyIsSentWhenItLoadsInTime() throws Exception {
        NotchRunner runner = new NotchRunner(RuntimeEnvironment.getApplication());
        List<JSONObject> answers = new ArrayList<>();
        runner.run(new JSONObject().put("action", "drink"), answers::add);
        WebView web = web(runner);
        pageReady(web);
        String js = shadowOf(web).getLastEvaluatedJavascript();
        assertTrue("queued request was not sent: " + js, js != null && js.contains("window.rpmNotchRun(\"n1\""));
        assertTrue(answers.isEmpty());
    }
}
