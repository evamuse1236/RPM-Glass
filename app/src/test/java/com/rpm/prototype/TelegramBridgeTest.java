package com.rpm.prototype;

import static org.junit.Assert.*;

import java.io.IOException;
import okhttp3.OkHttpClient;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.json.JSONObject;
import org.junit.Test;

public class TelegramBridgeTest {
    private static final String BASE="https://bridge.test:8466";

    /** Sends every request meant for the https bridge to the local fake, keeping the path. */
    private static OkHttpClient to(MockWebServer server){
        return new OkHttpClient.Builder().addInterceptor(chain->chain.proceed(chain.request().newBuilder().url(server.url(chain.request().url().encodedPath())).build())).build();
    }
    private static JSONObject op(String op)throws Exception{return new JSONObject().put("op",op);}
    private static JSONObject sent(MockWebServer server)throws Exception{return new JSONObject(server.takeRequest().getBody().readUtf8());}

    @Test public void connectedNeedsAnHttpsBaseAndCallsNothing()throws Exception{
        OkHttpClient never=new OkHttpClient.Builder().addInterceptor(chain->{throw new AssertionError("no network");}).build();
        assertTrue(TelegramBridge.call(op("connected"),BASE,never).getBoolean("connected"));
        for(String base:new String[]{"","http://bridge.test:8466","bridge.test",null})
            assertFalse(String.valueOf(base),TelegramBridge.call(op("connected"),base,never).getBoolean("connected"));
    }

    @Test public void sendForwardsOnlyToAndTextToSend()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("{\"sent\":{\"to\":\"Ima\",\"username\":\"ima_bot\",\"text\":\"hi\",\"id\":7}}"));
            JSONObject result=TelegramBridge.call(op("send").put("to","Ima").put("text","hi").put("chatId",123).put("dry",false),BASE,to(server));
            assertEquals(7,result.getJSONObject("sent").getInt("id"));
            RecordedRequest request=server.takeRequest();
            assertEquals("POST",request.getMethod());
            assertEquals("/send",request.getPath());
            JSONObject body=new JSONObject(request.getBody().readUtf8());
            assertEquals("Ima",body.getString("to"));
            assertEquals("hi",body.getString("text"));
            assertEquals(2,body.length());
        }
    }

    @Test public void dryIsForwardedOnlyWhenTrue()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("{\"draft\":{\"to\":\"Ima\",\"username\":\"ima_bot\",\"text\":\"hi\"}}"));
            server.enqueue(new MockResponse().setBody("{}"));
            assertEquals("ima_bot",TelegramBridge.call(op("send").put("to","Ima").put("text","hi").put("dry",true),BASE,to(server)).getJSONObject("draft").getString("username"));
            assertTrue(sent(server).getBoolean("dry"));
            TelegramBridge.call(op("send").put("to","Ima").put("text","hi"),BASE,to(server));
            assertFalse(sent(server).has("dry"));
        }
    }

    @Test public void readForwardsOnlyChatLimitAndWait()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("{\"unreadChats\":0,\"chats\":[]}"));
            server.enqueue(new MockResponse().setBody("{\"chat\":\"Ima\",\"messages\":[]}"));
            assertEquals(0,TelegramBridge.call(op("read").put("to","x"),BASE,to(server)).getInt("unreadChats"));
            RecordedRequest request=server.takeRequest();
            assertEquals("/read",request.getPath());
            assertEquals(0,new JSONObject(request.getBody().readUtf8()).length());
            TelegramBridge.call(op("read").put("chat","Ima").put("limit",3).put("waitSeconds",10).put("text","x"),BASE+"/",to(server));
            JSONObject body=sent(server);
            assertEquals("Ima",body.getString("chat"));
            assertEquals(3,body.getInt("limit"));
            assertEquals(10,body.getInt("waitSeconds"));
            assertEquals(3,body.length());
        }
    }

    @Test public void botsAsksForTheNamesAndForwardsNothing()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("{\"bots\":[\"Ima\",\"Pantry\"]}"));
            assertEquals("Pantry",TelegramBridge.call(op("bots").put("chat","x"),BASE,to(server)).getJSONArray("bots").getString(1));
            RecordedRequest request=server.takeRequest();
            assertEquals("/bots",request.getPath());
            assertEquals(0,new JSONObject(request.getBody().readUtf8()).length());
        }
    }

    @Test public void failuresComeBackAsPlainWords()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setResponseCode(404).setBody("{\"error\":\"No bot called Zed.\"}"));
            server.enqueue(new MockResponse().setResponseCode(403));
            server.enqueue(new MockResponse().setResponseCode(502).setBody("<html>bad gateway</html>"));
            server.enqueue(new MockResponse().setBody("not json"));
            JSONObject send=op("send").put("to","Zed").put("text","hi");
            assertEquals("No bot called Zed.",TelegramBridge.call(send,BASE,to(server)).getString("error"));
            assertEquals("This phone is not allowed to use Telegram.",TelegramBridge.call(send,BASE,to(server)).getString("error"));
            assertEquals("Telegram did not answer. Try again.",TelegramBridge.call(send,BASE,to(server)).getString("error"));
            assertEquals("Telegram did not answer. Try again.",TelegramBridge.call(op("read"),BASE,to(server)).getString("error"));
        }
    }

    @Test public void noConnectionNamesTheHomePcAndTailscale()throws Exception{
        OkHttpClient down=new OkHttpClient.Builder().addInterceptor(chain->{throw new IOException("unreachable");}).build();
        assertEquals("Telegram needs the home PC and Tailscale. Check the connection.",TelegramBridge.call(op("read"),BASE,down).getString("error"));
    }

    @Test public void noBridgeSetAnswersMissingWithoutCalling()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            assertTrue(TelegramBridge.call(op("send").put("to","Ima").put("text","hi"),"",to(server)).getBoolean("missing"));
            assertTrue(TelegramBridge.call(op("read"),"http://bridge.test",to(server)).getBoolean("missing"));
            assertEquals(0,server.getRequestCount());
        }
    }

    @Test public void anUnknownOpIsRefused()throws Exception{
        try{TelegramBridge.call(op("delete"),BASE);fail();}
        catch(IllegalArgumentException e){assertEquals("Unsupported phone action.",e.getMessage());}
    }

    @Test public void theBridgeWaitsLongerThanItsOwnReplyWait(){
        assertEquals(5000,TelegramBridge.CLIENT.connectTimeoutMillis());
        assertEquals(15000,TelegramBridge.CLIENT.readTimeoutMillis());
        assertFalse(TelegramBridge.CLIENT.followRedirects());
    }
}
