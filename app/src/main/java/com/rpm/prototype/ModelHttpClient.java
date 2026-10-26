package com.rpm.prototype;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import okhttp3.*;

final class ModelHttpClient {
    private static final OkHttpClient CLIENT=new OkHttpClient.Builder().connectTimeout(8,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();
    static Call call(Request request,int timeout){return CLIENT.newBuilder().retryOnConnectionFailure(request.method().equals("GET")||request.method().equals("HEAD")).readTimeout(timeout,TimeUnit.MILLISECONDS).build().newCall(request);}
    static CompletableFuture<Void> warm(String endpoint){
        CompletableFuture<Void> warmed=new CompletableFuture<>();
        call(new Request.Builder().url(endpoint).head().build(),8000).enqueue(new Callback(){
            @Override public void onFailure(Call call,IOException error){warmed.completeExceptionally(error);}
            @Override public void onResponse(Call call,Response response){
                try(Response closed=response){if(closed.body()!=null)closed.body().string();warmed.complete(null);}
                catch(IOException error){warmed.completeExceptionally(error);}
            }
        });
        return warmed;
    }
}
