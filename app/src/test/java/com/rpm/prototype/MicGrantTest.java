package com.rpm.prototype;

import static org.junit.Assert.*;

import android.webkit.PermissionRequest;
import org.junit.Test;

public class MicGrantTest {
    private static final String[] MIC={PermissionRequest.RESOURCE_AUDIO_CAPTURE};

    @Test public void captureOwnOriginGetsTheMic(){
        assertTrue(MicGrant.allowed("https://rpm.local/",MIC));
        assertTrue(MicGrant.allowed("https://rpm.local",MIC));
    }

    @Test public void otherOriginsNeverGetTheMic(){
        for(String origin:new String[]{"http://rpm.local/","https://rpm.local.evil.com/","https://evil.com/","https://rpm.local:8443/","file:///","null",null})
            assertFalse(String.valueOf(origin),MicGrant.allowed(origin,MIC));
    }

    @Test public void onlyAudioCaptureIsGranted(){
        assertFalse(MicGrant.allowed("https://rpm.local/",new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}));
        assertFalse(MicGrant.allowed("https://rpm.local/",new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE,PermissionRequest.RESOURCE_VIDEO_CAPTURE}));
        assertFalse(MicGrant.allowed("https://rpm.local/",new String[]{PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID}));
        assertFalse(MicGrant.allowed("https://rpm.local/",new String[0]));
        assertFalse(MicGrant.allowed("https://rpm.local/",null));
    }
}
