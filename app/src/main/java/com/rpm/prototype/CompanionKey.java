package com.rpm.prototype;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Secrets the person pastes on the phone (the OpenRouter key, the GitHub token), encrypted with Android Keystore. */
final class CompanionKey {
    private static final String ALIAS="rpm-companion-openrouter",GITHUB_ALIAS="rpm-companion-github";
    private static javax.crypto.SecretKey key(String alias)throws Exception{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(alias)){KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}return (javax.crypto.SecretKey)store.getKey(alias,null);}
    private static String read(Context c,String prefs,String alias)throws Exception{String saved=c.getSharedPreferences(prefs,0).getString("encrypted",null);if(saved==null)return null;String[] parts=saved.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(alias),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8);}
    private static void write(Context c,String prefs,String alias,String value)throws Exception{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(alias));String saved=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);if(!c.getSharedPreferences(prefs,0).edit().putString("encrypted",saved).commit())throw new java.io.IOException("Key could not be saved.");}
    static String get(Context c)throws Exception{return read(c,"companion-key",ALIAS);}
    static boolean has(Context c){try{return get(c)!=null;}catch(Exception e){return false;}}
    static void set(Context c,String value)throws Exception{if(value==null||value.trim().isEmpty()){c.getSharedPreferences("companion-key",0).edit().clear().commit();return;}value=value.trim();if(value.length()<20||value.length()>1024||value.matches(".*\\s.*"))throw new IllegalArgumentException("Paste a valid OpenRouter API key.");write(c,"companion-key",ALIAS,value);}
    static String github(Context c){try{return read(c,"github-key",GITHUB_ALIAS);}catch(Exception e){return null;}}
    static void setGithub(Context c,String value)throws Exception{if(value==null||value.trim().isEmpty()){c.getSharedPreferences("github-key",0).edit().clear().commit();return;}value=value.trim();if(value.length()<20||value.length()>255||value.matches(".*\\s.*"))throw new IllegalArgumentException("Paste a GitHub token.");write(c,"github-key",GITHUB_ALIAS,value);}
}
