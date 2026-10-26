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
    private final PlannerSyncProtocol.Transport transport;
    private volatile boolean closed;
    private WebView web;
    private CompletableFuture<JSONObject> result;

    PlannerCommandHost(Context context,PlannerSyncProtocol.Guard guard,PlannerSyncProtocol.Transport transport){this.context=context.getApplicationContext();this.guard=guard;this.transport=transport;}
    @Override public JSONObject run()throws Exception {
        if(Looper.myLooper()==Looper.getMainLooper())throw new IllegalStateException("Planner sync runs off the UI thread");
        guard.check();result=new CompletableFuture<>();
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
                }else web.evaluateJavascript("window.rpmReplicaRun()",null);
            }catch(Exception failure){result.completeExceptionally(failure);}
        });
        try{return result.get(180,TimeUnit.SECONDS);}catch(InterruptedException failure){Thread.currentThread().interrupt();throw failure;}catch(ExecutionException failure){if(failure.getCause() instanceof Exception)throw (Exception)failure.getCause();throw failure;}
    }
    private void reply(String id,Object value,String error){main.post(()->{if(!closed&&web!=null)web.evaluateJavascript("window.rpmBridgeResult("+JSONObject.quote(id)+","+(value==null?"null":value.toString())+","+(error==null?"null":JSONObject.quote(error))+")",null);});}
    final class Bridge {
        @JavascriptInterface public void complete(String value){try{if(!closed)result.complete(new JSONObject(value));}catch(JSONException failure){result.completeExceptionally(failure);}}
        @JavascriptInterface public void failed(){if(!closed)result.completeExceptionally(new IOException("Planner sync could not complete; saved data is intact"));}
        @JavascriptInterface public void diagnostic(String value){if(!closed)Diagnostics.fromJs(context,value);}
        @JavascriptInterface public void invoke(String id,String action,String payload){
            if(closed||id==null||!id.matches("[a-f0-9-]{36}:[0-9]{1,12}")||payload==null||payload.length()>16*1024*1024)return;
            work.execute(()->{
                try{reply(id,dispatch(action,new JSONObject(payload)),null);}
                catch(Exception failure){
                    if(failure instanceof SyncManager.Unauthorized)result.completeExceptionally(failure);
                    reply(id,null,"Saved context changed. Reopen RPM before retrying.".equals(failure.getMessage())?"Saved context changed. Reopen RPM before retrying.":"Sync was interrupted. Your saved plan and captured words remain on the phone.");
                }
            });
        }
    }
    Object dispatch(String action,JSONObject payload)throws Exception {
        guard.check();
        switch(action){
            case "load":return new JSONObject().put("data",CompanionStore.read(context));
            case "save":synchronized(CompanionStore.LOCK){guard.check();CompanionStore.write(context,payload.getJSONObject("data"),payload.getInt("expected"),"sync");}return new JSONObject();
            case "push":case "pull":return transport.exchange(action,payload);
            default:throw new IllegalArgumentException("Unsupported sync action");
        }
    }
    @Override public void close(){closed=true;work.shutdownNow();main.post(()->{if(web!=null){web.removeJavascriptInterface("RpmSync");web.destroy();web=null;}});}
}
