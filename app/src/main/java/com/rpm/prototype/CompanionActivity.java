package com.rpm.prototype;

import android.app.*;
import android.animation.ValueAnimator;
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
    private String voiceRequest;
    private volatile boolean diagnosticReady=false;
    private WebView web;private boolean expanded=false,closing=false;
    private double captureHeightCss=300,captureWidthCss=0;
    private boolean captureMeasured=false,captureReduceMotion=false,finishingMotion=false;
    private CompanionSettingsController settingsController;
    private FrameLayout root;private int insetTop=0,insetBottom=0,insetLeft=0,insetRight=0,systemBottom=0;
    private final ExecutorService work=Executors.newFixedThreadPool(2);
    private final ExecutorService captureInput=Executors.newSingleThreadExecutor();
    private final ModelRequests modelRequests=new ModelRequests();
    private static final Set<String> ASSETS=Set.of("index.html","planner.html","planner-stitch.css","planner-tokens.css","runtime.js","night.css","capture-tokens.css","butterfly.png","jakarta-regular.ttf","jakarta-semibold.ttf","space-semibold.ttf");
    private static final String CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    private static final String CHAT_ENDPOINT="https://openrouter.ai/api/v1/chat/completions",DECISION_ENDPOINT="https://openrouter.ai/api/alpha/decisions";
    @Override public void onCreate(Bundle saved){super.onCreate(saved);expanded=saved!=null&&saved.getBoolean("expanded");getWindow().setBackgroundDrawableResource(android.R.color.transparent);getWindow().setDimAmount(.12f);getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        if(planning()){expanded=true;getWindow().setDimAmount(0);getWindow().setBackgroundDrawableResource(android.R.color.black);}
        web=new WebView(this);if(!planning())web.setAlpha(0);web.setBackgroundColor(planning()?Color.rgb(14,20,29):Color.TRANSPARENT);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSafeBrowsingEnabled(true);applyTextScale();
        settingsController=new CompanionSettingsController(this,this::settingsChanged);
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onConsoleMessage(ConsoleMessage message){if(!diagnosticReady)Diagnostics.chrome(CompanionActivity.this,message);return false;}});
        web.addJavascriptInterface(new Bridge(),"RpmNative");web.setWebViewClient(new WebViewClient(){
            @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){
                try{Diagnostics.recordNow(CompanionActivity.this,Diagnostics.event("crash","error","webview.renderer","error",new JSONObject().put("didCrash",detail.didCrash()).put("priority",detail.rendererPriorityAtExit())));}catch(Exception ignored){}
                return false;
            }
            @Override public void onPageFinished(WebView v,String url){if("https://rpm.local/index.html".equals(url)){openKeyboard();}syncSurfaceInsets();}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){Uri u=r.getUrl();String asset=u.getPath()==null?"":u.getPath().substring(1);if("https".equals(u.getScheme())&&"rpm.local".equals(u.getHost())&&u.getPort()==-1&&u.getQuery()==null&&ASSETS.contains(asset)&&r.getMethod().equals("GET"))try{String type=asset.endsWith(".html")?"text/html":asset.endsWith(".css")?"text/css":asset.endsWith(".png")?"image/png":asset.endsWith(".ttf")?"font/ttf":"text/javascript";return new WebResourceResponse(type,"UTF-8",200,"OK",Map.of("Content-Security-Policy",CSP,"X-Content-Type-Options","nosniff","Cache-Control","no-store"),getAssets().open("companion/"+asset));}catch(IOException ignored){}return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Map.of(),new ByteArrayInputStream(new byte[0]));}
        });
        // A full transparent host lets Android deliver reliable IME/system insets.
        // Only the small child panel is painted; it stays entirely above the keyboard.
        root=new FrameLayout(this);root.setBackgroundColor(planning()?Color.rgb(14,20,29):Color.TRANSPARENT);root.addView(web);root.setOnClickListener(v->finish());setContentView(root);
        getWindow().setLayout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT);
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());insetTop=i.top;insetBottom=i.bottom;insetLeft=i.left;insetRight=i.right;systemBottom=insets.getInsets(WindowInsets.Type.systemBars()).bottom;web.evaluateJavascript("window.rpmCaptureKeyboard?.("+insets.isVisible(WindowInsets.Type.ime())+")",null);}else{insetTop=insets.getSystemWindowInsetTop();insetBottom=insets.getSystemWindowInsetBottom();insetLeft=insets.getSystemWindowInsetLeft();insetRight=insets.getSystemWindowInsetRight();}size();syncSurfaceInsets();return insets;});
        root.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{if(r-l!=or-ol||b-t!=ob-ot)size();});size();if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);String target=getIntent().getStringExtra("plannerTarget");web.loadUrl(planning()?"https://rpm.local/planner.html"+(target!=null?"#open="+Uri.encode(target):"ideas".equals(getIntent().getStringExtra("plannerAction"))?"#ideas":""):"https://rpm.local/index.html");
    }
    // Keep the WebView stable. Animate the visible content within its viewport,
    // so resizing cannot discard the Android WebView compositor's current frame.
    private void syncSurfaceInsets(){if(Build.VERSION.SDK_INT>=30&&web!=null)web.evaluateJavascript("window.rpmSurfaceInsetsValue={bottom:"+Math.max(0,insetBottom-systemBottom)+",width:"+web.getWidth()+",animate:"+ValueAnimator.areAnimatorsEnabled()+"};window.rpmSurfaceInsets?.(window.rpmSurfaceInsetsValue)",null);}
    private void size(){
        if(root==null||web==null)return;
        android.util.DisplayMetrics m=getResources().getDisplayMetrics();
        int width=root.getWidth()>0?root.getWidth():m.widthPixels,height=root.getHeight()>0?root.getHeight():m.heightPixels;
        boolean wide=expanded||effectiveFontScale()>1.3f;int pad=dp(wide?4:12);
        int layoutBottom=Build.VERSION.SDK_INT>=30?systemBottom:insetBottom;
        int availableWidth=Math.max(1,width-insetLeft-insetRight-pad*2),availableHeight=Math.max(1,height-insetTop-layoutBottom-pad-dp(planning()?4:24));
        FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(wide?availableWidth:Math.min(dp(372),availableWidth),availableHeight,Gravity.BOTTOM|Gravity.END);
        p.setMargins(insetLeft+pad,insetTop+dp(planning()?4:24),insetRight+pad,layoutBottom+pad);
        FrameLayout.LayoutParams old=(FrameLayout.LayoutParams)web.getLayoutParams();
        if(old!=null&&old.width==p.width&&old.height==p.height&&old.gravity==p.gravity&&old.leftMargin==p.leftMargin&&old.rightMargin==p.rightMargin&&old.topMargin==p.topMargin&&old.bottomMargin==p.bottomMargin)return;
        web.setLayoutParams(p);
    }
    private void openKeyboard(){if(web==null)return;web.post(()->{if(closing||web==null)return;web.requestFocus();web.evaluateJavascript("document.getElementById('message')?.focus({preventScroll:true})",r->{if(web!=null&&!closing)((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);});});}
    private float effectiveFontScale(){return getResources().getConfiguration().fontScale*(planning()?1f:CompanionControls.widgetTextScale(this)/100f);}
    private void applyTextScale(){if(web!=null)web.getSettings().setTextZoom(Math.round(effectiveFontScale()*100));}
    private JSONObject phoneStatus()throws JSONException{return CompanionAlerts.status(this,!planning()).put("reducedMotion",!ValueAnimator.areAnimatorsEnabled()).put("debug",(getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0);}
    private void settingsChanged(){if(closing||web==null)return;applyTextScale();size();web.evaluateJavascript("window.rpmPhoneRefresh?.()",null);web.evaluateJavascript("window.dispatchEvent(new Event('rpm-settings-refresh'))",null);}
    private void openIntegratedSettings(String section){if(web==null)return;if(section==null||section.isBlank())section="settings";String destination=section;if(planning())web.evaluateJavascript("window.rpmOpenSettings?.("+JSONObject.quote(destination)+")",null);else{JSONObject target=new JSONObject();try{target.put("view",destination);}catch(JSONException ignored){}startActivity(new Intent(this,PlannerActivity.class).putExtra("plannerTarget",target.toString()));}}
    @Override public void finish(){
        if(finishingMotion)return;
        if(!planning()&&web!=null&&captureMeasured&&!closing&&!captureReduceMotion&&ValueAnimator.areAnimatorsEnabled()){
            finishingMotion=true;web.animate().alpha(0).translationY(dp(12)).setDuration(160).withEndAction(()->super.finish()).start();
        }else super.finish();
    }
    private void handleBack(){if(web==null){finish();return;}web.evaluateJavascript("window.rpmHandleBack?.() ?? false",handled->{if(!"true".equals(handled))finish();});}
    @android.annotation.SuppressLint("GestureBackNavigation") // API 26–32 fallback only; API 33+ registers OnBackInvokedCallback above.
    @Override public void onBackPressed(){if(Build.VERSION.SDK_INT<33)handleBack();}
    int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    @Override protected void onSaveInstanceState(Bundle out){out.putBoolean("expanded",expanded);super.onSaveInstanceState(out);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(intent.getBooleanExtra("reload",false))web.reload();else if(!planning())openKeyboard();}
    @Override protected void onResume(){super.onResume();applyTextScale();if(settingsController!=null)settingsController.onResume();work.execute(()->{try{JSONObject d=CompanionStore.read(this);if(d!=null)CompanionAlerts.reconcile(this,d,false);}catch(Exception ignored){}runOnUiThread(this::settingsChanged);});}
    @Override protected void onPause(){if(settingsController!=null)settingsController.onPause();super.onPause();}
    @Override public void onConfigurationChanged(android.content.res.Configuration c){super.onConfigurationChanged(c);size();applyTextScale();settingsChanged();}
    @Override protected void onActivityResult(int request,int result,Intent intent){super.onActivityResult(request,result,intent);if(request==302 && voiceRequest!=null){String id=voiceRequest;voiceRequest=null;try{ArrayList<String> words=intent==null?null:intent.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);reply(id,new JSONObject().put("text",result==RESULT_OK&&words!=null&&!words.isEmpty()?words.get(0):""),null);}catch(JSONException error){reply(id,null,"Voice input could not be read.");}return;}if(settingsController!=null)settingsController.onActivityResult(request,result,intent);}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(settingsController!=null)settingsController.onRequestPermissionsResult(request);settingsChanged();}
    @Override protected void onDestroy(){closing=true;modelRequests.cancelAll();if(settingsController!=null){settingsController.destroy();settingsController=null;}if(web!=null){web.removeJavascriptInterface("RpmNative");web.destroy();web=null;}captureInput.shutdown();work.shutdown();super.onDestroy();}
    private void reply(String id,Object value,String error){runOnUiThread(()->{if(!closing&&web!=null)web.evaluateJavascript("window.rpmBridgeResult("+JSONObject.quote(id)+","+(value==null?"null":value.toString())+","+(error==null?"null":JSONObject.quote(error))+")",null);});}
    final class Bridge {
        @JavascriptInterface public void diagnostic(String body){if(!closing)Diagnostics.fromJs(CompanionActivity.this,body);}
        @JavascriptInterface public void diagnosticsReady(){diagnosticReady=true;}
        @JavascriptInterface public void invoke(String id,String action,String payload){if(closing||id==null||!id.matches("[a-f0-9-]{36}:[0-9]{1,12}")||payload==null||payload.length()>16*1024*1024)return;
            final JSONObject p;final String modelId;final ModelRequests.Request request;
            try{p=new JSONObject(payload);
                // Ordered, durable writes for unsent text. Never put this payload in diagnostics.
                if("captureDraft".equals(action)&&!planning()){
                    final String text=p.has("text")?p.getString("text"):null;
                    if(text!=null&&text.length()>12000)throw new IllegalArgumentException("Capture text is too long");
                    captureInput.execute(()->{try{
                        android.content.SharedPreferences prefs=getSharedPreferences("capture-input",MODE_PRIVATE);
                        if(text!=null&&!prefs.edit().putString("text",text).commit())throw new IOException("Draft could not be kept");
                        reply(id,new JSONObject().put("present",prefs.contains("text")).put("text",prefs.getString("text","")),null);
                    }catch(Exception e){reply(id,null,"Could not keep this draft on the phone.");}});return;
                }
                if("captureSize".equals(action)&&!planning()){
                    final double h=p.optDouble("height"),w=p.optDouble("width");
                    if(!Double.isFinite(h)||!Double.isFinite(w)||h<1||h>100000||w<100||w>4000)throw new IllegalArgumentException("Invalid Capture size");
                    runOnUiThread(()->{if(closing||web==null)return;boolean animate=captureMeasured;captureMeasured=true;captureHeightCss=h;captureWidthCss=w;captureReduceMotion=p.optBoolean("reducedMotion",false);size();if(!animate)web.animate().alpha(1).setDuration(captureReduceMotion||!ValueAnimator.areAnimatorsEnabled()?0:180).start();reply(id,new JSONObject(),null);});return;
                }
                if("cancelModel".equals(action)){reply(id,new JSONObject().put("cancelled",modelRequests.cancel(p.getString("requestId"))),null);return;}
                modelId=p.optString("requestId",id);
                request=("model".equals(action)||"decision".equals(action))?modelRequests.register(modelId):null;
            }catch(Exception e){reply(id,null,e.getMessage());return;}
            work.execute(()->{long diagnosticStart=SystemClock.elapsedRealtime();String diagnosticOutcome="success";JSONObject diagnosticPayload=new JSONObject();try{diagnosticPayload.put("action",action);if(p.has("expected"))diagnosticPayload.put("expectedRevision",p.optInt("expected"));if(p.has("body")){JSONObject body=p.getJSONObject("body");diagnosticPayload.put("model",body.optString("model")).put("reasoning",body.optJSONObject("reasoning"));}Object result;
                switch(action){
                    case "load":result=new JSONObject().put("data",Optional.ofNullable(CompanionStore.read(CompanionActivity.this)).orElse(null)).put("phone",phoneStatus());break;
                    case "save":CompanionStore.write(CompanionActivity.this,p.getJSONObject("data"),p.getInt("expected"));result=phoneStatus();break;
                    case "status":result=phoneStatus();break;
                    case "dictate":runOnUiThread(()->{if(voiceRequest!=null){reply(id,null,"Voice input is already open.");return;}voiceRequest=id;try{Intent voice=new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT,"Capture your thought");startActivityForResult(voice,302);}catch(ActivityNotFoundException error){voiceRequest=null;reply(id,null,"Voice input is unavailable on this device. You can use keyboard dictation.");}});return;
                    case "haptic":runOnUiThread(()->web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK));result=new JSONObject();break;
                    case "keyboard":runOnUiThread(()->{web.requestFocus();((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(web,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);});result=new JSONObject();break;
                    case "appSettings":result=settingsController.read();break;
                    case "appControl":result=CompanionControls.apply(CompanionActivity.this,p);runOnUiThread(CompanionActivity.this::settingsChanged);break;
                    case "settingsAction":result=settingsController.apply(p);runOnUiThread(CompanionActivity.this::settingsChanged);break;
                    case "calendarList":result=PlannerCalendar.calendars(CompanionActivity.this);break;
                    case "calendarRead":result=PlannerCalendar.read(CompanionActivity.this,p.optLong("anchor",System.currentTimeMillis()));break;
                    case "calendarSelect":PlannerCalendar.select(CompanionActivity.this,p.getJSONArray("ids"));result=new JSONObject();break;
                    case "calendarPermission":runOnUiThread(()->requestPermissions(new String[]{android.Manifest.permission.READ_CALENDAR},301));result=new JSONObject();break;
                    case "model":result=model(p.getJSONObject("body"),request);break;
                    case "decision":result=decision(p.getJSONObject("body"),request);break;
                    case "arm":CompanionAlerts.arm(CompanionActivity.this,p.getLong("id"));result=new JSONObject();break;
                    case "settings":String settingsSection=p.optString("section","settings");runOnUiThread(()->openIntegratedSettings(settingsSection));result=new JSONObject();break;
                    case "planner":String plannerTarget=p.toString();runOnUiThread(()->startActivity(new Intent(CompanionActivity.this,PlannerActivity.class).putExtra("plannerTarget",plannerTarget)));result=new JSONObject();break;
                    case "capture":runOnUiThread(()->startActivity(new Intent(CompanionActivity.this,CompanionActivity.class)));result=new JSONObject();break;
                    case "minimize":runOnUiThread(()->finish());result=new JSONObject();break;
                    case "expand":runOnUiThread(()->{expanded=!expanded;size();});result=new JSONObject();break;
                    default:throw new IllegalArgumentException("Unsupported phone action.");
                }if(result instanceof JSONObject&&((JSONObject)result).optInt("status",200)>=400){diagnosticOutcome="error";diagnosticPayload.put("statusCode",((JSONObject)result).optInt("status"));}if(Set.of("planner","capture","settings","minimize","expand").contains(action))diagnosticOutcome="dispatched";reply(id,result,null);
            }catch(Exception e){diagnosticOutcome=e instanceof java.util.concurrent.CancellationException?"cancelled":"error";try{diagnosticPayload.put("error",new JSONObject().put("type",e.getClass().getSimpleName()).put("message",e.getMessage()).put("stack",android.util.Log.getStackTraceString(e)));}catch(JSONException ignored){}String message=(action.equals("model")||action.equals("decision"))?"The OpenRouter connection failed. Check your key and internet connection.":e.getMessage();reply(id,null,message==null?"The phone could not finish that action.":message);}finally{if(!Set.of("haptic","keyboard","status","appSettings","load").contains(action))try{diagnosticPayload.put("durationMs",SystemClock.elapsedRealtime()-diagnosticStart);JSONObject event=Diagnostics.event("operation",diagnosticOutcome.equals("error")?"error":"info","native."+action,diagnosticOutcome,diagnosticPayload).put("sessionId",id.substring(0,36)).put("operationId",modelId);Diagnostics.record(CompanionActivity.this,event);}catch(JSONException ignored){}if(request!=null)modelRequests.finish(modelId,request);}});
        }
    }
    private JSONObject model(JSONObject body,ModelRequests.Request request)throws Exception{
        request.check();
        if(!Set.of("openai/gpt-5.6-luna","openai/gpt-6-luna").contains(body.optString("model"))||body.toString().length()>2000000||body.optInt("max_tokens")>3500)throw new IllegalArgumentException("Unsupported AI request.");return postOpenRouter(CHAT_ENDPOINT,body,request,30000);
    }
    private JSONObject decision(JSONObject body,ModelRequests.Request request)throws Exception{
        request.check();validateDecision(body);return postOpenRouter(DECISION_ENDPOINT,body,request,12000);
    }
    private static void validateDecision(JSONObject body)throws Exception{
        if(!body.optString("model").equals("typesafe/jev-1.13")||body.toString().length()>500000)throw new IllegalArgumentException("Unsupported Jev request.");
        Set<String> top=Set.of("model","state","questions");for(Iterator<String> keys=body.keys();keys.hasNext();)if(!top.contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev request field.");
        JSONObject state=body.getJSONObject("state"),questions=body.getJSONObject("questions");JSONArray tasks=state.getJSONArray("tasks"),blocks=state.getJSONArray("blocks");if(tasks.length()<1||tasks.length()>24||blocks.length()<1||blocks.length()>12||questions.length()!=tasks.length())throw new IllegalArgumentException("Unsupported Jev grouping size.");
        for(Iterator<String> keys=state.keys();keys.hasNext();)if(!Set.of("tasks","blocks").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev state field.");
        for(int i=0;i<tasks.length();i++){JSONObject task=tasks.getJSONObject(i);for(Iterator<String> keys=task.keys();keys.hasNext();)if(!Set.of("id","title").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev task field.");if(task.getLong("id")<=0||task.getString("title").isBlank()||task.getString("title").length()>200)throw new IllegalArgumentException("Unsupported Jev task.");if(!questions.has("assignment_"+i))throw new IllegalArgumentException("Missing Jev task decision.");}
        for(int i=0;i<blocks.length();i++){JSONObject block=blocks.getJSONObject(i);for(Iterator<String> keys=block.keys();keys.hasNext();)if(!Set.of("id","title","purpose","projectTitle").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev block field.");if(block.getString("id").isBlank()||block.getString("id").length()>160||block.getString("title").isBlank()||block.getString("title").length()>200||block.getString("purpose").length()>2000||block.getString("projectTitle").length()>200)throw new IllegalArgumentException("Unsupported Jev block.");}
        for(Iterator<String> ids=questions.keys();ids.hasNext();){String id=ids.next();if(!id.matches("assignment_[0-9]{1,2}"))throw new IllegalArgumentException("Unsupported Jev question.");JSONObject question=questions.getJSONObject(id);for(Iterator<String> keys=question.keys();keys.hasNext();)if(!Set.of("type","instructions","criteria").contains(keys.next()))throw new IllegalArgumentException("Unsupported Jev question field.");if(!"choice".equals(question.optString("type"))||question.optString("instructions").length()<20||question.optString("instructions").length()>1000)throw new IllegalArgumentException("Unsupported Jev question type.");JSONObject criteria=question.getJSONObject("criteria");if(criteria.length()!=blocks.length()+1||!criteria.has("keep_unsorted"))throw new IllegalArgumentException("Unsupported Jev choices.");for(int i=0;i<blocks.length();i++)if(!criteria.has("block_"+i))throw new IllegalArgumentException("Missing Jev block choice.");for(Iterator<String> choices=criteria.keys();choices.hasNext();){String choice=choices.next();if(!choice.equals("keep_unsorted")&&!choice.matches("block_[0-9]{1,2}"))throw new IllegalArgumentException("Unsupported Jev choice.");String description=criteria.getString(choice);if(description.isBlank()||description.length()>1000)throw new IllegalArgumentException("Unsupported Jev choice description.");}}
    }
    private JSONObject postOpenRouter(String endpoint,JSONObject body,ModelRequests.Request request,int readTimeout)throws Exception{
        String key=CompanionKey.get(this);if(key==null)throw new IllegalStateException("Connect an OpenRouter key in Settings.");
        HttpsURLConnection connection=(HttpsURLConnection)new URL(endpoint).openConnection();connection.setConnectTimeout(8000);connection.setReadTimeout(readTimeout);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setRequestProperty("Authorization","Bearer "+key);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
        try{request.attach(connection);request.check();try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}int code=connection.getResponseCode();request.check();if(code<200||code>=300)return new JSONObject().put("status",code).put("body",new JSONObject());try(InputStream in=connection.getInputStream()){return new JSONObject().put("status",code).put("body",new JSONObject(CompanionStore.readText(in)));}}finally{connection.disconnect();}
    }
}
