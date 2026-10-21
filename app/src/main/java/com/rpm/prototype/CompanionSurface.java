package com.rpm.prototype;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.view.*;
import android.webkit.*;
import java.io.*;
import java.util.*;

/** What the companion WebView may load, and how the planner paints the system bars around it. */
final class CompanionSurface {
    static final Set<String> ASSETS=Set.of("index.html","planner.html","runtime.js","notch-actions.html","notch-actions.js","theme.css","planner.css","capture.css","capture-cards.css","capture-chips.css","review.css","planner-stitch.css","planner-tokens.css","night.css","capture-tokens.css","butterfly.png","google-sans-flex.woff2","material-symbols-rounded.woff2");
    static final String CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    private CompanionSurface(){}
    static WebResourceResponse serve(Context c,WebResourceRequest r){Uri u=r.getUrl();String asset=u.getPath()==null?"":u.getPath().substring(1);if("https".equals(u.getScheme())&&"rpm.local".equals(u.getHost())&&u.getPort()==-1&&u.getQuery()==null&&ASSETS.contains(asset)&&r.getMethod().equals("GET"))try{String type=asset.endsWith(".html")?"text/html":asset.endsWith(".css")?"text/css":asset.endsWith(".png")?"image/png":asset.endsWith(".woff2")?"font/woff2":"text/javascript";InputStream synced=syncedCopy(c,asset);return new WebResourceResponse(type,"UTF-8",200,"OK",Map.of("Content-Security-Policy",CSP,"X-Content-Type-Options","nosniff","Cache-Control","no-store"),synced!=null?synced:c.getAssets().open("companion/"+asset));}catch(IOException ignored){}return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Map.of(),new ByteArrayInputStream(new byte[0]));}
    static InputStream syncedCopy(Context c,String asset){if((c.getApplicationInfo().flags&android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)==0)return null;File f=new File(c.getFilesDir(),"dev-companion/"+asset);try{return f.isFile()?new FileInputStream(f):null;}catch(IOException e){return null;}}
    // The planner draws edge to edge on the Material surface: transparent bars, and a surface colour and
    // bar icons that follow the planner's effective theme (system, or pinned in Settings via "surface").
    @SuppressWarnings("deprecation") static void paintPlannerBars(Activity a,View root,View web,boolean night){
        android.content.res.Configuration conf=new android.content.res.Configuration(a.getResources().getConfiguration());
        conf.uiMode=(conf.uiMode&~android.content.res.Configuration.UI_MODE_NIGHT_MASK)|(night?android.content.res.Configuration.UI_MODE_NIGHT_YES:android.content.res.Configuration.UI_MODE_NIGHT_NO);
        int surface=a.createConfigurationContext(conf).getColor(R.color.rpm_surface);
        a.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(surface));if(root!=null)root.setBackgroundColor(surface);if(web!=null)web.setBackgroundColor(surface);
        a.getWindow().setStatusBarColor(Color.TRANSPARENT);a.getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if(Build.VERSION.SDK_INT>=30){int light=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;a.getWindow().getInsetsController().setSystemBarsAppearance(night?0:light,light);}
        else a.getWindow().getDecorView().setSystemUiVisibility(night?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|(Build.VERSION.SDK_INT>=27?View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0));
    }
    static boolean systemNight(Context c){return (c.getResources().getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;}
}
