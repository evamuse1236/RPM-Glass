package com.rpm.prototype;

import android.webkit.PermissionRequest;

/** Which WebView mic requests the app grants: only audio capture, only for Capture's own origin. */
final class MicGrant {
    static final String ORIGIN="https://rpm.local";
    static final int REQUEST=303;
    static final String PREFS="voice-mic",ASKED="asked";
    private MicGrant(){}
    static boolean allowed(String origin,String[] resources){
        if(origin==null||resources==null||resources.length!=1)return false;
        String o=origin.endsWith("/")?origin.substring(0,origin.length()-1):origin;
        return ORIGIN.equals(o)&&PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0]);
    }
}
