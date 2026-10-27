package com.rpm.prototype;

import android.app.Application;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34,application=Application.class)
public class CaptureTextSizeTest {
    @Test public void captureKeepsTheAndroidFontSizeWhateverTheWidgetTextSize(){
        Application app=RuntimeEnvironment.getApplication();
        app.getSharedPreferences("companion-appearance",0).edit().putInt("widget-text-scale",127).commit();
        RuntimeEnvironment.setFontScale(1.15f);
        CompanionActivity capture=Robolectric.buildActivity(CompanionActivity.class).setup().get();
        WebView web=find(capture.getWindow().getDecorView());
        assertNotNull("Capture shows its page in a WebView",web);
        assertEquals("Capture text follows Android's 115%, not the widget's 127%",115,web.getSettings().getTextZoom());
        assertEquals("the widget text size stays saved for home-screen widgets",127,CompanionControls.widgetTextScale(app));
    }
    private static WebView find(View v){
        if(v instanceof WebView)return (WebView)v;
        if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++){WebView w=find(g.getChildAt(i));if(w!=null)return w;}}
        return null;
    }
}
