package com.rpm.prototype;

import org.junit.Test;
import static org.junit.Assert.*;
import okhttp3.*;
import okhttp3.mockwebserver.*;

public class ModelHttpClientTest {
    @Test public void warmAndTwoRequestsReuseOneConnection() throws Exception {
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse());server.enqueue(new MockResponse().setBody("{}"));server.enqueue(new MockResponse().setBody("{}"));
            String endpoint=server.url("/messages").toString();
            ModelHttpClient.warm(endpoint).get(5,java.util.concurrent.TimeUnit.SECONDS);
            for(int i=0;i<2;i++)try(Response response=ModelHttpClient.call(new Request.Builder().url(endpoint).post(RequestBody.create("{}",MediaType.get("application/json"))).build(),95000).execute()){
                assertEquals("{}",response.body().string());
            }
            assertEquals("HEAD",server.takeRequest().getMethod());
            assertEquals(1,server.takeRequest().getSequenceNumber());assertEquals(2,server.takeRequest().getSequenceNumber());
        }
    }
    @Test public void anIdempotentReadReconnectsAfterThePooledSocketCloses()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.start(java.net.InetAddress.getByName("127.0.0.1"),0);
            server.enqueue(new MockResponse().setBody("warm").setSocketPolicy(SocketPolicy.DISCONNECT_AT_END));
            server.enqueue(new MockResponse().setBody("fresh"));
            String endpoint=server.url("/messages").toString();
            try(Response response=ModelHttpClient.call(new Request.Builder().url(endpoint).build(),2000).execute()){
                assertEquals("warm",response.body().string());
            }
            try(Response response=ModelHttpClient.call(new Request.Builder().url(endpoint).build(),2000).execute()){
                assertEquals(200,response.code());assertEquals("fresh",response.body().string());
            }
            assertEquals(0,server.takeRequest().getSequenceNumber());
            assertEquals(0,server.takeRequest().getSequenceNumber());
        }
    }
    @Test public void aFailedPostIsNotReplayedAndTheNextCallReconnects()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("warm").setSocketPolicy(SocketPolicy.DISCONNECT_AT_END));
            server.enqueue(new MockResponse().setBody("saved"));
            String endpoint=server.url("/messages").toString();
            try(Response response=ModelHttpClient.call(new Request.Builder().url(endpoint).build(),2000).execute()){
                assertEquals("warm",response.body().string());
            }
            Thread.sleep(100);
            java.util.concurrent.atomic.AtomicInteger writes=new java.util.concurrent.atomic.AtomicInteger();
            RequestBody body=new RequestBody(){
                @Override public MediaType contentType(){return MediaType.get("application/json");}
                @Override public void writeTo(okio.BufferedSink sink)throws java.io.IOException{writes.incrementAndGet();sink.writeUtf8("{}");}
            };
            Request post=new Request.Builder().url(endpoint).post(body).build();
            assertThrows(java.io.IOException.class,()->{try(Response response=ModelHttpClient.call(post,2000).execute()){response.body().string();}});
            assertEquals(1,writes.get());
            try(Response response=ModelHttpClient.call(post,2000).execute()){
                assertEquals("saved",response.body().string());
            }
            assertEquals(2,writes.get());assertEquals(2,server.getRequestCount());
            server.takeRequest();assertEquals(0,server.takeRequest().getSequenceNumber());
        }
    }
    @Test public void cancellationStopsOnlyTheAttachedCall()throws Exception{
        ModelRequests.Request request=new ModelRequests().register("stream");
        Call call=ModelHttpClient.call(new Request.Builder().url("https://example.invalid").build(),95000);
        request.attach(call::cancel);request.cancel();assertTrue(call.isCanceled());
        ModelRequests.Request finished=new ModelRequests().register("finished");
        Call reusable=ModelHttpClient.call(new Request.Builder().url("https://example.invalid").build(),95000);
        finished.attach(reusable::cancel);finished.detach();finished.cancel();assertFalse(reusable.isCanceled());
    }
}
