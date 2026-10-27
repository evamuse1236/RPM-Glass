package com.rpm.prototype;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The Gemini key for voice mode, encrypted with its own Android Keystore key and kept in its own preference.
 * It is not a {@link CompanionKey.Service}: Capture's model calls, model limits and warm-up never see it.
 * Only {@link VoiceToken} reads it, to mint a one-use Live token. Never logged, never sent to the pages.
 */
final class GeminiKey {
    private static final String PREFS="gemini-key",PREF="encrypted",ALIAS="rpm-gemini-voice";
    private GeminiKey(){}
    private static SecretKey key()throws Exception{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(ALIAS)){KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}return (SecretKey)store.getKey(ALIAS,null);}
    static String get(Context c)throws Exception{String saved=c.getSharedPreferences(PREFS,0).getString(PREF,null);if(saved==null)return null;String[] parts=saved.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}
    static boolean has(Context c){try{return get(c)!=null;}catch(Exception e){return false;}}
    /** Why {@code value} cannot be saved as a Gemini key, or null when it can. */
    static String problem(String value){
        if(value==null||value.length()<30||value.length()>200||!value.matches("[A-Za-z0-9_.-]+"))return "Paste the whole key, then try again.";
        if(!value.matches("AIza[A-Za-z0-9_-]+|AQ\\.[A-Za-z0-9_-]+"))return "A Gemini key starts with AIza or AQ. Paste it from aistudio.google.com.";
        return null;
    }
    static void set(Context c,String value)throws Exception{
        if(value==null||value.trim().isEmpty()){if(!c.getSharedPreferences(PREFS,0).edit().remove(PREF).commit())throw new java.io.IOException("Key could not be removed.");return;}
        value=value.trim();String problem=problem(value);if(problem!=null)throw new IllegalArgumentException(problem);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());String saved=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if(!c.getSharedPreferences(PREFS,0).edit().putString(PREF,saved).commit())throw new java.io.IOException("Key could not be saved.");
    }
}
