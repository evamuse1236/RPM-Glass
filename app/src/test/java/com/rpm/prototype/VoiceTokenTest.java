package com.rpm.prototype;

import static org.junit.Assert.*;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;

public class VoiceTokenTest {
    private static final String KEY="AIzaTEST0000000000000000000000000000000";
    private static JSONObject setup()throws Exception{
        return new JSONObject().put("model","models/some-other-model").put("generationConfig",new JSONObject().put("responseModalities",new JSONArray().put("AUDIO")))
            .put("systemInstruction",new JSONObject()).put("tools",new JSONArray()).put("inputAudioTranscription",new JSONObject()).put("outputAudioTranscription",new JSONObject()).put("realtimeInputConfig",new JSONObject());
    }
    private static String rejection(Object setup){try{VoiceToken.check(setup);return null;}catch(Exception e){return e.getMessage();}}
    @Before public void reset(){VoiceToken.resetForTest();}

    @Test public void aTokenIsMintedWithTheKeyInAHeaderAndTheSetupBound()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("{\"name\":\"auth_tokens/abc123\"}"));
            long now=1_800_000_000_000L;
            JSONObject result=VoiceToken.mint(()->KEY,setup(),server.url("/v1alpha/auth_tokens").toString(),now);
            assertEquals("auth_tokens/abc123",result.getString("token"));
            assertEquals(VoiceToken.LIVE_URL,result.getString("url"));
            assertTrue(result.getString("url").endsWith("BidiGenerateContentConstrained"));
            RecordedRequest request=server.takeRequest();
            assertEquals("POST",request.getMethod());
            assertEquals(KEY,request.getHeader("x-goog-api-key"));
            assertFalse(request.getPath().contains("key="));
            JSONObject body=new JSONObject(request.getBody().readUtf8());
            assertEquals(1,body.getInt("uses"));
            assertEquals("2027-01-15T08:10:00.000Z",body.getString("expireTime"));
            assertEquals("2027-01-15T08:01:00.000Z",body.getString("newSessionExpireTime"));
            assertEquals("models/gemini-3.8-live",body.getJSONObject("bidiGenerateContentSetup").getString("model"));
            assertEquals("AUDIO",body.getJSONObject("bidiGenerateContentSetup").getJSONObject("generationConfig").getJSONArray("responseModalities").get(0));
        }
    }

    @Test public void noKeyAnswersMissingKeyWithoutCallingGoogle()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            JSONObject result=VoiceToken.mint(()->null,setup(),server.url("/").toString(),0);
            assertTrue(result.getBoolean("missingKey"));
            assertEquals(0,server.getRequestCount());
        }
    }

    @Test public void aBadSetupIsRefusedBeforeTheKeyIsRead()throws Exception{
        boolean[] read={false};
        try{VoiceToken.mint(()->{read[0]=true;return KEY;},setup().put("speechConfig",new JSONObject()),"http://127.0.0.1:1/",0);fail();}
        catch(IllegalArgumentException e){assertEquals("Voice setup has a field the phone does not allow.",e.getMessage());}
        assertFalse(read[0]);
    }

    @Test public void setupChecksRefuseSizeFieldsAndModalities()throws Exception{
        assertEquals("Voice setup is missing.",rejection(null));
        assertEquals("Voice setup is missing.",rejection("text"));
        StringBuilder big=new StringBuilder();while(big.length()<=64*1024)big.append("words ");
        assertEquals("Voice setup is too large.",rejection(setup().put("systemInstruction",new JSONObject().put("text",big.toString()))));
        assertEquals("Voice setup has a field the phone does not allow.",rejection(setup().put("contextWindowCompression",new JSONObject())));
        assertEquals("Voice setup must answer in audio.",rejection(setup().put("generationConfig",new JSONObject().put("responseModalities",new JSONArray().put("TEXT")))));
        assertEquals("Voice setup must answer in audio.",rejection(setup().put("generationConfig",new JSONObject().put("responseModalities",new JSONArray().put("AUDIO").put("TEXT")))));
        assertEquals("Voice setup must answer in audio.",rejection(new JSONObject().put("tools",new JSONArray())));
        assertNull(rejection(setup()));
        assertNull(rejection(new JSONObject().put("generationConfig",new JSONObject().put("responseModalities",new JSONArray().put("AUDIO")))));
    }

    @Test public void atMostOneTokenEveryThreeSeconds()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setBody("{\"name\":\"auth_tokens/one\"}"));
            server.enqueue(new MockResponse().setBody("{\"name\":\"auth_tokens/two\"}"));
            String url=server.url("/").toString();
            VoiceToken.mint(()->KEY,setup(),url,10_000);
            try{VoiceToken.mint(()->KEY,setup(),url,12_999);fail();}catch(IllegalStateException e){assertEquals("Voice is starting. Try again in a few seconds.",e.getMessage());}
            assertEquals("auth_tokens/two",VoiceToken.mint(()->KEY,setup(),url,13_000).getString("token"));
            assertEquals(2,server.getRequestCount());
        }
    }

    @Test public void failuresArePlainSentencesThatNeverEchoTheResponse()throws Exception{
        try(MockWebServer server=new MockWebServer()){
            server.enqueue(new MockResponse().setResponseCode(403).setBody("{\"error\":\"key AIzaTEST bad\"}"));
            server.enqueue(new MockResponse().setResponseCode(500).setBody("boom"));
            server.enqueue(new MockResponse().setBody("{\"nope\":1}"));
            String url=server.url("/").toString();
            String[] expected={"Gemini refused the key. Check it in Settings.","Voice is unavailable right now.","Voice is unavailable right now."};
            for(int i=0;i<3;i++){
                try{VoiceToken.mint(()->KEY,setup(),url,100_000L*(i+1));fail();}
                catch(IllegalStateException e){assertEquals(expected[i],e.getMessage());assertFalse(e.getMessage().contains("AIza"));}
            }
        }
    }

    @Test public void redactionRemovesGeminiKeysAndTokens(){
        String text=DiagnosticRedaction.text("sent "+KEY+" got auth_tokens/abc-123_x",new String[0]);
        assertFalse(text.contains("AIza"));assertFalse(text.contains("abc-123_x"));assertTrue(text.contains("auth_tokens/[REDACTED]"));
    }

    private static final String NEW_KEY="AQ.Ab8TEST00000000000000000000000000000000000000000";
    @Test public void keysInGooglesNewerAqFormatAreAcceptedAndRedacted(){
        assertNull(GeminiKey.problem(KEY));
        assertNull(GeminiKey.problem(NEW_KEY));
        assertNotNull(GeminiKey.problem("AQ.short"));
        assertNotNull(GeminiKey.problem("sk-0000000000000000000000000000000000"));
        assertFalse(DiagnosticRedaction.text("sent "+NEW_KEY+" ok",new String[0]).contains("Ab8TEST"));
    }
}
