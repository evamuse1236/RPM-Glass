package com.rpm.prototype;

import android.content.Context;
import android.os.*;
import android.webkit.*;
import org.json.*;
import java.io.IOException;
import java.util.concurrent.*;

final class PlannerCommandHost implements AutoCloseable,PlannerSyncProtocol.Runner {
    private final Context context;
    private final PlannerSyncProtocol.Guard guard;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService work=Executors.newFixedThreadPool(2);
    private final ModelRequests requests=new ModelRequests();
    private final ModelGateway models;
    private volatile boolean closed;
    private WebView web;
    private CompletableFuture<JSONObject> result;
    private JSONObject input;

    PlannerCommandHost(Context context,PlannerSyncProtocol.Guard guard){this.context=context.getApplicationContext();this.guard=guard;models=new ModelGateway(this.context);}
    @Override public JSONObject run(JSONArray commands,JSONArray snapshots,JSONArray revokedIds)throws Exception {
        if(Looper.myLooper()==Looper.getMainLooper())throw new IllegalStateException("Planner sync runs off the UI thread");
        guard.check();input=new JSONObject().put("commands",commands).put("snapshots",snapshots).put("revokedCommandIds",revokedIds);result=new CompletableFuture<>();
        main.post(()->{
            if(closed)return;
            try{
                if(web==null){
                    web=new WebView(context);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
                    web.addJavascriptInterface(new Bridge(),"RpmSync");
                    web.setWebViewClient(new WebViewClient(){
                        @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}
                        @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return CompanionSurface.serve(context,request);}
                        @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){result.completeExceptionally(new IOException("Planner sync interrupted"));close();return true;}
                    });
                    web.loadUrl("https://rpm.local/sync.html");
                }else web.evaluateJavascript("window.rpmSyncRun()",null);
            }catch(Exception failure){result.completeExceptionally(failure);}
        });
        try{return result.get(180,TimeUnit.SECONDS);}catch(InterruptedException failure){Thread.currentThread().interrupt();throw failure;}
    }
    private void reply(String id,Object value,String error){main.post(()->{if(!closed&&web!=null)web.evaluateJavascript("window.rpmBridgeResult("+JSONObject.quote(id)+","+(value==null?"null":value.toString())+","+(error==null?"null":JSONObject.quote(error))+")",null);});}
    final class Bridge {
        @JavascriptInterface public void complete(String value){try{if(!closed)result.complete(new JSONObject(value));}catch(JSONException failure){result.completeExceptionally(failure);}}
        @JavascriptInterface public void failed(){if(!closed)result.completeExceptionally(new IOException("Planner sync could not complete; saved data is intact"));}
        @JavascriptInterface public void diagnostic(String value){if(!closed)Diagnostics.fromJs(context,value);}
        @JavascriptInterface public void invoke(String id,String action,String payload){
            if(closed||id==null||!id.matches("[a-f0-9-]{36}:[0-9]{1,12}")||payload==null||payload.length()>16*1024*1024)return;
            work.execute(()->{
                ModelRequests.Request request=null;String requestId=id;
                try{
                    guard.check();JSONObject p=new JSONObject(payload);Object value;
                    switch(action){
                        case "input":value=input;break;
                        case "load":value=new JSONObject().put("data",CompanionStore.read(context));break;
                        case "save":synchronized(CompanionStore.LOCK){guard.check();CompanionStore.write(context,p.getJSONObject("data"),p.getInt("expected"));}value=new JSONObject();break;
                        case "calendarRead":value=PlannerCalendar.read(context,p.optLong("anchor",System.currentTimeMillis()));break;
                        case "model":case "decision":
                            requestId=p.optString("requestId",id);request=requests.register(requestId);
                            value=action.equals("model")?models.model(p.getJSONObject("body"),CompanionKey.Service.named(p.optString("service",CompanionKey.Service.OPENROUTER.id)),request):models.decision(p.getJSONObject("body"),request);break;
                        case "cancelModel":value=new JSONObject().put("cancelled",requests.cancel(p.getString("requestId")));break;
                        default:throw new IllegalArgumentException("Unsupported sync action");
                    }
                    reply(id,value,null);
                }catch(Exception failure){reply(id,null,"Saved context changed. Reopen RPM before retrying.".equals(failure.getMessage())?"Saved context changed. Reopen RPM before retrying.":"Sync was interrupted. Your saved plan and captured words remain on the phone.");}
                finally{if(request!=null)requests.finish(requestId,request);}
            });
        }
    }
    @Override public void close(){closed=true;requests.cancelAll();work.shutdownNow();main.post(()->{if(web!=null){web.removeJavascriptInterface("RpmSync");web.destroy();web=null;}});}
}
