package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import org.json.*;
import java.io.*;
import java.net.*;
import javax.net.ssl.HttpsURLConnection;
import java.util.*;
import java.util.concurrent.*;

/** A trusted, bundled conversation surface. All networking is native and HTTPS-only. */
public class CompanionActivity extends Activity {
    protected boolean planning(){return false;}
    private WebView web;private boolean expanded=false,closing=false;
    private CompanionSettingsController settingsController;
    private FrameLayout root;private int insetTop=0,insetBottom=0,insetLeft=0,insetRight=0;
    private final ExecutorService work=Executors.newFixedThreadPool(2);
    private final ModelRequests modelRequests=new ModelRequests();
    private static final Set<String> ASSETS=Set.of("index.html","planner.html","planner-stitch.css","runtime.js","night.css","butterfly.png","jakarta-regular.ttf","jakarta-semibold.ttf","space-semibold.ttf");
    private static final String CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    @Override public void onCreate(Bundle saved){super.onCreate(saved);expanded=saved!=null&&saved.getBoolean("expanded")||effectiveFontScale()>1.3f;getWindow().setBackgroundDrawableResource(android.R.color.transparent);getWindow().setDimAmount(.12f);getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        if(planning()){expanded=true;getWindow().setDimAmount(0);getWindow().setBackgroundDrawableResource(android.R.color.black);}
        web=new WebView(this);web.setBackgroundColor(planning()?Color.rgb(14,20,29):Color.TRANSPARENT);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSafeBrowsingEnabled(true);applyTextScale();
        settingsController=new CompanionSettingsController(this,this::settingsChanged);
        web.addJavascriptInterface(new Bridge(),"RpmNative");web.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView v,String url){if("https://rpm.local/index.html".equals(url)){applyAppearance();openKeyboard();}}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){Uri u=r.getUrl();String asset=u.getPath()==null?"":u.getPath().substring(1);if("https".equals(u.getScheme())&&"rpm.local".equals(u.getHost())&&u.getPort()==-1&&u.getQuery()==null&&ASSETS.contains(asset)&&r.getMethod().equals("GET"))try{String type=asset.endsWith(".html")?"text/html":asset.endsWith(".css")?"text/css":asset.endsWith(".png")?"image/png":asset.endsWith(".ttf")?"font/ttf":"text/javascript";return new WebResourceResponse(type,"UTF-8",200,"OK",Map.of("Content-Security-Policy",CSP,"X-Content-Type-Options","nosniff","Cache-Control","no-store"),getAssets().open("companion/"+asset));}catch(IOException ignored){}return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Map.of(),new ByteArrayInputStream(new byte[0]));}
        });
        // A full transparent host lets Android deliver reliable IME/system insets.
        // Only the small child panel is painted; it stays entirely above the keyboard.
        root=new FrameLayout(this);root.setBackgroundColor(planning()?Color.rgb(14,20,29):Color.TRANSPARENT);root.addView(web);root.setOnClickListener(v->finish());setContentView(root);
        getWindow().setLayout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT);
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());insetTop=i.top;insetBottom=i.bottom;insetLeft=i.left;insetRight=i.right;}else{insetTop=insets.getSystemWindowInsetTop();insetBottom=insets.getSystemWindowInsetBottom();insetLeft=insets.getSystemWindowInsetLeft();insetRight=insets.getSystemWindowInsetRight();}size();return insets;});
        root.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{if(r-l!=or-ol||b-t!=ob-ot)size();});size();if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);String target=getIntent().getStringExtra("plannerTarget");web.loadUrl(planning()?"https://rpm.local/planner.html"+(target!=null?"#open="+Uri.encode(target):"ideas".equals(getIntent().getStringExtra("plannerAction"))?"#ideas":""):"https://rpm.local/index.html");
    }
    private void size(){if(root==null||web==null)return;android.util.DisplayMetrics m=getResources().getDisplayMetrics();int width=root.getWidth()>0?root.getWidth():m.widthPixels,height=root.getHeight()>0?root.getHeight():m.heightPixels;int pad=dp(expanded?4:12);int availableWidth=Math.max(dp(180),width-insetLeft-insetRight-pad*2),availableHeight=Math.max(dp(120),height-insetTop-insetBottom-pad*2);FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(expanded?availableWidth:Math.min(dp(372),availableWidth),expanded?availableHeight:Math.min(dp(370),availableHeight),Gravity.BOTTOM|Gravity.END);p.setMargins(insetLeft+pad,insetTop+pad,insetRight+pad,insetBottom+pad);FrameLayout.LayoutParams old=(FrameLayout.LayoutParams)web.getLayoutParams();if(old==null||old.width!=p.width||old.height!=p.height||old.gravity!=p.gravity||old.leftMargin!=p.leftMargin||old.rightMargin!=p.rightMargin||old.topMargin!=p.topMargin||old.bottomMargin!=p.bottomMargin)web.setLayoutParams(p);}
    private void openKeyboard(){if(web==null)return;web.post(()->{if(closing||web==null)return;web.requestFocus();web.evaluateJavascript("document.getElementById('message')?.focus({preventScroll:true})",r->{if(web!=null&&!closing)((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);});});}
    private void applyAppearance(){if(web==null)return;int transparency=Math.max(0,Math.min(70,getSharedPreferences("companion-appearance",0).getInt("transparency",28)));web.evaluateJavascript("document.documentElement.style.setProperty('--glass-alpha','"+((100-transparency)/100.0)+"')",null);}
    private float effectiveFontScale(){return getResources().getConfiguration().fontScale*(planning()?1f:CompanionControls.widgetTextScale(this)/100f);}
    private void applyTextScale(){if(web!=null)web.getSettings().setTextZoom(Math.round(effectiveFontScale()*100));}
    private JSONObject phoneStatus()throws JSONException{return CompanionAlerts.status(this,!planning());}
    private void settingsChanged(){if(closing||web==null)return;applyAppearance();applyTextScale();if(!planning()&&!expanded&&effectiveFontScale()>1.3f){expanded=true;size();}web.evaluateJavascript("window.rpmPhoneRefresh?.()",null);web.evaluateJavascript("window.dispatchEvent(new Event('rpm-settings-refresh'))",null);}
    private void openIntegratedSettings(String section){if(web==null)return;if(section==null||section.isBlank())section="settings";String destination=section;if(planning())web.evaluateJavascript("window.rpmOpenSettings?.("+JSONObject.quote(destination)+")",null);else{JSONObject target=new JSONObject();try{target.put("view",destination);}catch(JSONException ignored){}startActivity(new Intent(this,PlannerActivity.class).putExtra("plannerTarget",target.toString()));}}
    private void handleBack(){if(web==null){finish();return;}web.evaluateJavascript("window.rpmHandleBack?.() ?? false",handled->{if(!"true".equals(handled))finish();});}
    @android.annotation.SuppressLint("GestureBackNavigation") // API 26–32 fallback only; API 33+ registers OnBackInvokedCallback above.
    @Override public void onBackPressed(){if(Build.VERSION.SDK_INT<33)handleBack();}
    int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    @Override protected void onSaveInstanceState(Bundle out){out.putBoolean("expanded",expanded);super.onSaveInstanceState(out);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(intent.getBooleanExtra("reload",false))web.reload();}
    @Override protected void onResume(){super.onResume();applyAppearance();applyTextScale();if(settingsController!=null)settingsController.onResume();work.execute(()->{try{JSONObject d=CompanionStore.read(this);if(d!=null)CompanionAlerts.reconcile(this,d,false);}catch(Exception ignored){}runOnUiThread(this::settingsChanged);});}
    @Override protected void onPause(){if(settingsController!=null)settingsController.onPause();super.onPause();}
    @Override public void onConfigurationChanged(android.content.res.Configuration c){super.onConfigurationChanged(c);size();applyTextScale();settingsChanged();}
    @Override protected void onActivityResult(int request,int result,Intent intent){super.onActivityResult(request,result,intent);if(settingsController!=null)settingsController.onActivityResult(request,result,intent);}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(settingsController!=null)settingsController.onRequestPermissionsResult(request);settingsChanged();}
    @Override protected void onDestroy(){closing=true;modelRequests.cancelAll();if(settingsController!=null){settingsController.destroy();settingsController=null;}if(web!=null){web.removeJavascriptInterface("RpmNative");web.destroy();web=null;}work.shutdown();super.onDestroy();}
    private void reply(String id,Object value,String error){runOnUiThread(()->{if(!closing&&web!=null)web.evaluateJavascript("window.rpmBridgeResult("+JSONObject.quote(id)+","+(value==null?"null":value.toString())+","+(error==null?"null":JSONObject.quote(error))+")",null);});}
    final class Bridge {
        @JavascriptInterface public void invoke(String id,String action,String payload){if(closing||id==null||!id.matches("[a-f0-9-]{36}:[0-9]{1,12}")||payload==null||payload.length()>16*1024*1024)return;
            final JSONObject p;final String modelId;final ModelRequests.Request request;
            try{p=new JSONObject(payload);
                if("cancelModel".equals(action)){reply(id,new JSONObject().put("cancelled",modelRequests.cancel(p.getString("requestId"))),null);return;}
                modelId=p.optString("requestId",id);
                request="model".equals(action)?modelRequests.register(modelId):null;
            }catch(Exception e){reply(id,null,e.getMessage());return;}
            work.execute(()->{try{Object result;
                switch(action){
                    case "load":result=new JSONObject().put("data",Optional.ofNullable(CompanionStore.read(CompanionActivity.this)).orElse(null)).put("phone",phoneStatus());break;
                    case "save":CompanionStore.write(CompanionActivity.this,p.getJSONObject("data"),p.getInt("expected"));result=phoneStatus();break;
                    case "status":result=phoneStatus();break;
                    case "appSettings":result=settingsController.read();break;
                    case "appControl":result=CompanionControls.apply(CompanionActivity.this,p);runOnUiThread(CompanionActivity.this::settingsChanged);break;
                    case "settingsAction":result=settingsController.apply(p);runOnUiThread(CompanionActivity.this::settingsChanged);break;
                    case "calendarList":result=PlannerCalendar.calendars(CompanionActivity.this);break;
                    case "calendarRead":result=PlannerCalendar.read(CompanionActivity.this,p.optLong("anchor",System.currentTimeMillis()));break;
                    case "calendarSelect":PlannerCalendar.select(CompanionActivity.this,p.getJSONArray("ids"));result=new JSONObject();break;
                    case "calendarPermission":runOnUiThread(()->requestPermissions(new String[]{android.Manifest.permission.READ_CALENDAR},301));result=new JSONObject();break;
                    case "model":result=model(p.getJSONObject("body"),request);break;
                    case "arm":CompanionAlerts.arm(CompanionActivity.this,p.getLong("id"));result=new JSONObject();break;
                    case "settings":String settingsSection=p.optString("section","settings");runOnUiThread(()->openIntegratedSettings(settingsSection));result=new JSONObject();break;
                    case "planner":String plannerTarget=p.toString();runOnUiThread(()->startActivity(new Intent(CompanionActivity.this,PlannerActivity.class).putExtra("plannerTarget",plannerTarget)));result=new JSONObject();break;
                    case "capture":runOnUiThread(()->startActivity(new Intent(CompanionActivity.this,CompanionActivity.class)));result=new JSONObject();break;
                    case "minimize":runOnUiThread(()->finish());result=new JSONObject();break;
                    case "expand":runOnUiThread(()->{expanded=!expanded;size();});result=new JSONObject();break;
                    default:throw new IllegalArgumentException("Unsupported phone action.");
                }reply(id,result,null);
            }catch(Exception e){String message=action.equals("model")?"The AI connection failed. Check your key and internet connection.":e.getMessage();reply(id,null,message==null?"The phone could not finish that action.":message);}finally{if(request!=null)modelRequests.finish(modelId,request);}});
        }
    }
    private JSONObject model(JSONObject body,ModelRequests.Request request)throws Exception{
        request.check();
        if(!body.optString("model").equals("openai/gpt-5.6-luna")||body.toString().length()>2000000||body.optInt("max_tokens")>3500)throw new IllegalArgumentException("Unsupported AI request.");String key=CompanionKey.get(this);if(key==null)throw new IllegalStateException("Connect an OpenRouter key in Settings.");
        HttpsURLConnection connection=(HttpsURLConnection)new URL("https://openrouter.ai/api/v1/chat/completions").openConnection();connection.setConnectTimeout(8000);connection.setReadTimeout(18000);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setRequestProperty("Authorization","Bearer "+key);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
        try{request.attach(connection);request.check();try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}int code=connection.getResponseCode();request.check();if(code<200||code>=300)return new JSONObject().put("status",code).put("body",new JSONObject());try(InputStream in=connection.getInputStream()){return new JSONObject().put("status",code).put("body",new JSONObject(CompanionStore.readText(in)));}}finally{connection.disconnect();}
    }
}
