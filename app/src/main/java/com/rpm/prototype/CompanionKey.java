package com.rpm.prototype;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** The AI keys the person pasted in Settings, encrypted with an Android Keystore key. Never logged, never sent to the pages. */
final class CompanionKey {
    /** Which AI service a key belongs to. OPENROUTER keeps the original preference name so keys saved by older builds still work. */
    enum Service {
        CLAUDE("anthropic","anthropic-encrypted"),OPENROUTER("openrouter","encrypted");
        final String id;private final String pref;
        Service(String id,String pref){this.id=id;this.pref=pref;}
        static Service named(String id){for(Service s:values())if(s.id.equals(id))return s;throw new IllegalArgumentException("Unsupported AI service.");}
    }
    private static final String PREFS="companion-key",ALIAS="rpm-companion-openrouter",CLAUDE_PREFIX="sk-ant-";
    private static javax.crypto.SecretKey key()throws Exception{KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(ALIAS)){KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}return (javax.crypto.SecretKey)store.getKey(ALIAS,null);}
    static String get(Context c,Service s)throws Exception{String saved=c.getSharedPreferences(PREFS,0).getString(s.pref,null);if(saved==null)return null;String[] parts=saved.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8);}
    static boolean has(Context c,Service s){try{return get(c,s)!=null;}catch(Exception e){return false;}}
    static boolean hasAny(Context c){for(Service s:Service.values())if(has(c,s))return true;return false;}
    /** Every saved key, so diagnostics can remove them from logs. */
    static String[] all(Context c){List<String> out=new ArrayList<>();for(Service s:Service.values()){try{String k=get(c,s);if(k!=null)out.add(k);}catch(Exception ignored){}}return out.toArray(new String[0]);}
    /** Why {@code value} cannot be saved as a {@code s} key, or null when it can. */
    static String problem(Service s,String value){
        if(value==null||value.length()<20||value.length()>1024||value.matches(".*\\s.*"))return "Paste the whole key, then try again.";
        if(s==Service.CLAUDE&&!value.startsWith(CLAUDE_PREFIX))return "A Claude key starts with sk-ant-. Paste it from console.anthropic.com.";
        if(s==Service.OPENROUTER&&value.startsWith(CLAUDE_PREFIX))return "That is a Claude key. Add it under Claude key instead.";
        return null;
    }
    static void set(Context c,Service s,String value)throws Exception{
        if(value==null||value.trim().isEmpty()){if(!c.getSharedPreferences(PREFS,0).edit().remove(s.pref).commit())throw new java.io.IOException("Key could not be removed.");return;}
        value=value.trim();String problem=problem(s,value);if(problem!=null)throw new IllegalArgumentException(problem);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());String saved=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if(!c.getSharedPreferences(PREFS,0).edit().putString(s.pref,saved).commit())throw new java.io.IOException("Key could not be saved.");
    }
}
