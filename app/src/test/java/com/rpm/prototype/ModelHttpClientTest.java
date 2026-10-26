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
    @Test public void cancellationStopsOnlyTheAttachedCall()throws Exception{
        ModelRequests.Request request=new ModelRequests().register("stream");
        Call call=ModelHttpClient.call(new Request.Builder().url("https://example.invalid").build(),95000);
        request.attach(call::cancel);request.cancel();assertTrue(call.isCanceled());
        ModelRequests.Request finished=new ModelRequests().register("finished");
        Call reusable=ModelHttpClient.call(new Request.Builder().url("https://example.invalid").build(),95000);
        finished.attach(reusable::cancel);finished.detach();finished.cancel();assertFalse(reusable.isCanceled());
    }
}
