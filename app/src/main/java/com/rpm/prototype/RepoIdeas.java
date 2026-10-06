package com.rpm.prototype;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;

/**
 * Repo ideas from the widget's repo capture. An idea is kept on the phone first (its words, its
 * screenshots, the idea.md the page wrote), then added in one commit to the ideas repo on GitHub
 * (second-brain/ideas by default), where Claude and Codex pick it up. Ideas that can't go yet wait
 * on the phone and RepoIdeaJob sends them once there is a network.
 */
final class RepoIdeas {
    static final int JOB=4207,MAX_SHOTS=10;
    private static final int MAX_EDGE=2000;
    private static final String API="https://api.github.com";
    private static final Pattern ID=Pattern.compile("[a-f0-9-]{36}");
    private static final Pattern REPO=Pattern.compile("[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}");
    private static final Pattern FOLDER=Pattern.compile("(?:new|[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100})/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[a-z0-9-]{1,48}");
    private static final Pattern SHOT=Pattern.compile("shot-[0-9]{1,2}\\.jpg");
    private static final Object LOCK=new Object();

    static final class GitHubError extends Exception {final int code;GitHubError(int code,String message){super(message);this.code=code;}}

    private static SharedPreferences prefs(Context c){return c.getSharedPreferences("repo-ideas",0);}
    private static File dir(Context c,String name){File d=new File(new File(c.getFilesDir(),"repo-ideas"),name);d.mkdirs();return d;}
    private static File drafts(Context c){return dir(c,"draft");}
    private static File ideas(Context c){return dir(c,"ideas");}
    private static JSONArray array(String raw){try{return new JSONArray(raw==null?"[]":raw);}catch(JSONException e){return new JSONArray();}}
    private static JSONObject object(String raw){try{return raw==null?null:new JSONObject(raw);}catch(JSONException e){return null;}}
    private static boolean repoName(String value){return value!=null&&REPO.matcher(value).matches()&&!value.endsWith("/.")&&!value.endsWith("/..");}

    static String inbox(Context c){String login=prefs(c).getString("login","");return prefs(c).getString("inbox",login.isEmpty()?"":login+"/second-brain");}
    static String folder(Context c){return prefs(c).getString("folder","ideas");}
    static String login(Context c){return prefs(c).getString("login","");}
    static File draftShot(Context c,String id){if(id==null||!ID.matcher(id).matches())return null;File f=new File(drafts(c),id+".jpg");return f.isFile()?f:null;}

    /** What the repo capture page needs to open: the GitHub connection, repos, recent picks, the draft and what is waiting. */
    static JSONObject state(Context c)throws JSONException{
        SharedPreferences p=prefs(c);boolean connected=CompanionKey.github(c)!=null;
        JSONObject github=new JSONObject().put("connected",connected);
        if(connected)github.put("login",login(c)).put("inbox",inbox(c)).put("folder",folder(c));
        JSONObject draft=object(p.getString("draft",null));
        if(draft!=null){JSONArray shots=draft.optJSONArray("shots"),kept=new JSONArray();if(shots!=null)for(int i=0;i<shots.length();i++)if(draftShot(c,shots.optString(i))!=null)kept.put(shots.optString(i));draft.put("shots",kept);}
        return new JSONObject().put("github",github).put("repos",connected?array(p.getString("repos",null)):new JSONArray()).put("reposAt",p.getLong("reposAt",0))
            .put("used",array(p.getString("used",null))).put("draft",draft==null?JSONObject.NULL:draft).put("waiting",waiting(c));
    }

    static void saveDraft(Context c,JSONObject draft)throws Exception{
        String repo=draft.isNull("repo")?null:draft.optString("repo",null);
        if(repo!=null&&!repoName(repo))throw new IllegalArgumentException("Unsupported repo.");
        JSONArray shots=draft.optJSONArray("shots"),kept=new JSONArray();
        if(shots!=null){if(shots.length()>MAX_SHOTS)throw new IllegalArgumentException("Too many screenshots.");for(int i=0;i<shots.length();i++){String id=shots.optString(i);if(!ID.matcher(id).matches())throw new IllegalArgumentException("Unsupported screenshot.");kept.put(id);}}
        String text=draft.optString("text",""),name=draft.optString("newName","");
        if(text.length()>12000||name.length()>100)throw new IllegalArgumentException("The idea is too long.");
        JSONObject clean=new JSONObject().put("repo",repo==null?JSONObject.NULL:repo).put("isNew",draft.optBoolean("isNew")).put("newName",name).put("text",text).put("shots",kept);
        if(!prefs(c).edit().putString("draft",clean.toString()).commit())throw new IOException("The draft could not be kept.");
    }

    /** A picked or shared image, scaled to at most 2000px on its long edge and kept as a JPEG until the idea is saved. */
    static String importImage(Context c,Uri uri)throws IOException{
        Bitmap bitmap;
        if(Build.VERSION.SDK_INT>=28){
            bitmap=ImageDecoder.decodeBitmap(ImageDecoder.createSource(c.getContentResolver(),uri),(decoder,info,source)->{
                int w=info.getSize().getWidth(),h=info.getSize().getHeight(),longest=Math.max(w,h);
                if(longest>MAX_EDGE){float s=MAX_EDGE/(float)longest;decoder.setTargetSize(Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s)));}
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
            });
        }else{
            BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
            try(InputStream in=c.getContentResolver().openInputStream(uri)){BitmapFactory.decodeStream(in,null,bounds);}
            BitmapFactory.Options o=new BitmapFactory.Options();while(Math.max(bounds.outWidth,bounds.outHeight)/(o.inSampleSize*2)>=MAX_EDGE)o.inSampleSize=Math.max(1,o.inSampleSize)*2;
            try(InputStream in=c.getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(in,null,o);}
            if(bitmap==null)throw new IOException("That file isn’t an image.");
            int longest=Math.max(bitmap.getWidth(),bitmap.getHeight());
            if(longest>MAX_EDGE){float s=MAX_EDGE/(float)longest;Bitmap scaled=Bitmap.createScaledBitmap(bitmap,Math.round(bitmap.getWidth()*s),Math.round(bitmap.getHeight()*s),true);bitmap.recycle();bitmap=scaled;}
        }
        String id=UUID.randomUUID().toString();File out=new File(drafts(c),id+".jpg");
        try(FileOutputStream f=new FileOutputStream(out)){if(!bitmap.compress(Bitmap.CompressFormat.JPEG,85,f))throw new IOException("Couldn’t keep that screenshot.");}
        finally{bitmap.recycle();}
        return id;
    }
    static void removeShot(Context c,String id){File f=draftShot(c,id);if(f!=null&&!f.delete())f.deleteOnExit();}

    /** Shared screenshots join the draft, so the page shows them when it opens (or is told to look again). */
    static int addSharedShots(Context c,List<Uri> uris)throws Exception{
        JSONObject draft=object(prefs(c).getString("draft",null));if(draft==null)draft=new JSONObject().put("repo",JSONObject.NULL).put("isNew",false).put("newName","").put("text","");
        JSONArray shots=draft.optJSONArray("shots");if(shots==null)shots=new JSONArray();
        int added=0;for(Uri uri:uris){if(shots.length()>=MAX_SHOTS)break;shots.put(importImage(c,uri));added++;}
        saveDraft(c,draft.put("shots",shots));return added;
    }

    /** Keeps the idea on the phone: idea.md as the page wrote it, the screenshots renamed to shot-N.jpg, and a manifest. */
    static JSONObject save(Context c,JSONObject p)throws Exception{
        String id=p.getString("id"),folder=p.getString("folder"),markdown=p.getString("markdown");
        String repo=p.isNull("repo")?null:p.optString("repo",null);
        if(!ID.matcher(id).matches()||!FOLDER.matcher(folder).matches()||folder.contains("/./")||folder.contains("/../")||(repo!=null&&!repoName(repo)))throw new IllegalArgumentException("Unsupported idea.");
        if(markdown.length()>200000||p.optString("text","").length()>12000||p.optString("title","").length()>200)throw new IllegalArgumentException("The idea is too long.");
        JSONArray shots=p.optJSONArray("shots");if(shots==null)shots=new JSONArray();if(shots.length()>MAX_SHOTS)throw new IllegalArgumentException("Too many screenshots.");
        synchronized(LOCK){
            File idea=new File(ideas(c),id);
            if(new File(idea,"manifest.json").isFile())return view(c,manifest(c,id));
            for(int i=0;i<shots.length();i++){JSONObject s=shots.getJSONObject(i);if(!SHOT.matcher(s.getString("name")).matches()||draftShot(c,s.getString("id"))==null)throw new IOException("A screenshot is missing. Add it again.");}
            idea.mkdirs();JSONArray files=new JSONArray().put("idea.md");
            writeFile(new File(idea,"idea.md"),markdown.getBytes(StandardCharsets.UTF_8));
            for(int i=0;i<shots.length();i++){JSONObject s=shots.getJSONObject(i);File from=draftShot(c,s.getString("id")),to=new File(idea,s.getString("name"));if(!from.renameTo(to))throw new IOException("A screenshot couldn’t be kept.");files.put(s.getString("name"));}
            JSONObject m=new JSONObject().put("id",id).put("folder",folder).put("repo",repo==null?JSONObject.NULL:repo).put("newName",p.optString("newName",""))
                .put("title",p.optString("title","Repo idea")).put("text",p.optString("text","")).put("files",files).put("sent",false).put("createdAt",System.currentTimeMillis());
            writeManifest(c,m);
            JSONArray used=array(prefs(c).getString("used",null)),next=new JSONArray();
            if(repo!=null)next.put(repo);
            for(int i=0;i<used.length()&&next.length()<8;i++)if(!used.optString(i).equalsIgnoreCase(String.valueOf(repo)))next.put(used.optString(i));
            prefs(c).edit().putString("used",next.toString()).remove("draft").commit();
            purge(c,id);
            return view(c,m).put("used",next);
        }
    }

    static JSONObject view(Context c,JSONObject m)throws JSONException{
        String state=m.optBoolean("sent")?"sent":CompanionKey.github(c)==null?"not-connected":"waiting";
        JSONObject v=new JSONObject().put("id",m.getString("id")).put("state",state).put("waiting",waiting(c));
        if(m.has("url"))v.put("url",m.getString("url"));if(m.has("error")&&!m.optBoolean("sent"))v.put("error",m.getString("error"));
        return v;
    }

    /** One commit with idea.md and its screenshots. Safe to repeat: an idea already in the repo is only marked sent. */
    static JSONObject upload(Context c,String id)throws JSONException{
        synchronized(LOCK){
            JSONObject m=manifest(c,id);if(m==null)return null;
            String token=CompanionKey.github(c),inbox=inbox(c);
            if(m.optBoolean("sent")||token==null)return view(c,m);
            if(!repoName(inbox)){m.put("error","choose the ideas repo in Settings");writeManifest(c,m);return view(c,m);}
            try{
                String branch=branch(c,token,inbox),base=folder(c)+"/"+m.getString("folder");
                if(!exists(token,inbox,base+"/idea.md",branch)){
                    File idea=new File(ideas(c),id);JSONArray files=m.getJSONArray("files"),additions=new JSONArray();
                    for(int i=0;i<files.length();i++)additions.put(new JSONObject().put("path",base+"/"+files.getString(i)).put("contents",Base64.encodeToString(readFile(new File(idea,files.getString(i))),Base64.NO_WRAP)));
                    commit(token,inbox,branch,"Repo idea"+(m.isNull("repo")?" (new repo)":" for "+m.getString("repo"))+": "+m.optString("title"),additions,new JSONArray());
                }
                m.put("sent",true).put("sentAt",System.currentTimeMillis()).put("inbox",inbox).put("branch",branch).put("path",base)
                    .put("url","https://github.com/"+inbox+"/tree/"+branch+"/"+base).remove("error");
            }catch(GitHubError e){m.put("error",e.getMessage());}
            catch(Exception e){m.remove("error");}
            writeManifest(c,m);
            return view(c,m);
        }
    }

    static JSONObject sendWaiting(Context c)throws JSONException{
        int sent=0;String error=null;
        for(JSONObject m:manifests(c)){if(m.optBoolean("sent"))continue;JSONObject v=upload(c,m.getString("id"));if(v!=null&&"sent".equals(v.optString("state")))sent++;else if(v!=null&&error==null)error=v.optString("error",null);}
        JSONObject result=new JSONObject().put("sent",sent).put("waiting",waiting(c));if(error!=null)result.put("error",error);return result;
    }

    /** Undo: removes a sent idea from the repo in one commit, then gives its words, repo and screenshots back as the draft. */
    static JSONObject undo(Context c,String id)throws Exception{
        if(id==null||!ID.matcher(id).matches())throw new IllegalArgumentException("Unsupported idea.");
        synchronized(LOCK){
            JSONObject m=manifest(c,id);if(m==null)throw new IOException("That idea is already gone.");
            if(m.optBoolean("sent")){
                String token=CompanionKey.github(c);if(token==null)throw new IOException("Connect GitHub to remove it from "+m.optString("inbox")+".");
                JSONArray files=m.getJSONArray("files"),deletions=new JSONArray();
                for(int i=0;i<files.length();i++)deletions.put(new JSONObject().put("path",m.getString("path")+"/"+files.getString(i)));
                try{commit(token,m.getString("inbox"),m.getString("branch"),"Remove repo idea: "+m.optString("title"),new JSONArray(),deletions);}
                catch(GitHubError e){throw new IOException("GitHub didn’t remove it: "+e.getMessage()+".");}
            }
            File idea=new File(ideas(c),id);JSONArray shots=new JSONArray(),files=m.getJSONArray("files");
            for(int i=0;i<files.length();i++){File f=new File(idea,files.getString(i));if(!SHOT.matcher(f.getName()).matches()||!f.isFile())continue;String shot=UUID.randomUUID().toString();if(f.renameTo(new File(drafts(c),shot+".jpg")))shots.put(shot);}
            String repo=m.isNull("repo")?null:m.getString("repo");
            JSONObject draft=new JSONObject().put("repo",repo==null?JSONObject.NULL:repo).put("isNew",repo==null).put("newName",m.optString("newName","")).put("text",m.optString("text","")).put("shots",shots);
            prefs(c).edit().putString("draft",draft.toString()).commit();
            delete(idea);
            return new JSONObject().put("draft",draft).put("waiting",waiting(c));
        }
    }

    static String url(Context c,String id)throws JSONException{JSONObject m=id!=null&&ID.matcher(id).matches()?manifest(c,id):null;String url=m==null?null:m.optString("url",null);return url!=null&&url.startsWith("https://github.com/")?url:null;}

    static JSONObject repos(Context c)throws Exception{
        String token=CompanionKey.github(c);if(token==null)throw new IllegalStateException("Connect GitHub in Settings.");
        JSONArray raw;
        try{raw=callArray(API+"/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member",token);}
        catch(GitHubError e){throw new IOException("Couldn’t load your repos: "+e.getMessage()+".");}
        catch(IOException e){throw new IOException("Couldn’t load your repos. Check your connection.");}
        JSONArray repos=new JSONArray();
        for(int i=0;i<raw.length();i++){JSONObject r=raw.getJSONObject(i);repos.put(new JSONObject().put("fullName",r.getString("full_name")).put("name",r.getString("name")).put("description",r.optString("description","null").equals("null")?"":r.optString("description")).put("pushedAt",r.optString("pushed_at","")).put("private",r.optBoolean("private")));}
        long now=System.currentTimeMillis();prefs(c).edit().putString("repos",repos.toString()).putLong("reposAt",now).commit();
        return new JSONObject().put("repos",repos).put("reposAt",now);
    }

    /** Checks the token with GitHub before keeping it, and points ideas at the account's second-brain unless another repo was chosen. */
    static String connect(Context c,String token)throws Exception{
        if(token==null||token.trim().length()<20||token.trim().matches(".*\\s.*"))throw new IllegalArgumentException("Paste a GitHub token.");
        token=token.trim();JSONObject user;
        try{user=call("GET",API+"/user",token,null);}catch(GitHubError e){throw new IOException(e.code==401?"GitHub didn’t accept that token.":"GitHub said "+e.getMessage()+".");}
        CompanionKey.setGithub(c,token);
        String login=user.getString("login");SharedPreferences.Editor edit=prefs(c).edit().putString("login",login).remove("repos").remove("reposAt");
        if(!prefs(c).contains("inbox"))edit.putString("inbox",login+"/second-brain");
        edit.commit();
        schedule(c);
        try{branch(c,token,inbox(c));return "GitHub connected. Ideas go to "+inbox(c)+"/"+folder(c)+".";}
        catch(Exception e){return "GitHub connected, but "+inbox(c)+" wasn’t found. Choose the ideas repo in Settings.";}
    }
    static void setInbox(Context c,String value){
        value=value==null?"":value.trim().replaceFirst("^https://github.com/","").replaceFirst("/$","");
        if(!value.contains("/")&&!login(c).isEmpty())value=login(c)+"/"+value;
        if(!repoName(value))throw new IllegalArgumentException("Write it as owner/repo.");
        prefs(c).edit().putString("inbox",value).commit();schedule(c);
    }
    static void disconnect(Context c)throws Exception{CompanionKey.setGithub(c,null);prefs(c).edit().remove("login").remove("repos").remove("reposAt").commit();}

    static int waiting(Context c){int n=0;for(JSONObject m:manifests(c))if(!m.optBoolean("sent"))n++;return n;}

    /** A network-bound job sends whatever is still waiting, retrying with backoff while GitHub is connected. */
    static void schedule(Context c){
        if(waiting(c)==0)return;JobScheduler scheduler=c.getSystemService(JobScheduler.class);if(scheduler==null||scheduler.getPendingJob(JOB)!=null)return;
        scheduler.schedule(new JobInfo.Builder(JOB,new ComponentName(c,RepoIdeaJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(15000).setBackoffCriteria(60000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setPersisted(true).build());
    }

    // ---- GitHub ---------------------------------------------------------------
    private static String branch(Context c,String token,String inbox)throws Exception{
        String key="branch:"+inbox,cached=prefs(c).getString(key,null);if(cached!=null)return cached;
        String branch;
        try{branch=call("GET",API+"/repos/"+inbox,token,null).getString("default_branch");}
        catch(GitHubError e){throw new GitHubError(e.code,e.code==404?inbox+" wasn’t found; check the ideas repo in Settings":e.getMessage());}
        prefs(c).edit().putString(key,branch).commit();return branch;
    }
    private static boolean exists(String token,String inbox,String path,String branch)throws Exception{
        try{call("GET",API+"/repos/"+inbox+"/contents/"+path+"?ref="+java.net.URLEncoder.encode(branch,"UTF-8"),token,null);return true;}
        catch(GitHubError e){if(e.code==404)return false;throw e;}
    }
    /** One commit through GraphQL's createCommitOnBranch (HttpURLConnection can't PATCH a ref); a moved head is retried. */
    private static void commit(String token,String inbox,String branch,String message,JSONArray additions,JSONArray deletions)throws Exception{
        for(int attempt=0;;attempt++){
            String head=call("GET",API+"/repos/"+inbox+"/git/ref/heads/"+branch,token,null).getJSONObject("object").getString("sha");
            JSONObject input=new JSONObject().put("branch",new JSONObject().put("repositoryNameWithOwner",inbox).put("branchName",branch))
                .put("message",new JSONObject().put("headline",message.length()>200?message.substring(0,199)+"…":message)).put("expectedHeadOid",head)
                .put("fileChanges",new JSONObject().put("additions",additions).put("deletions",deletions));
            JSONObject result=call("POST",API+"/graphql",token,new JSONObject().put("query","mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}").put("variables",new JSONObject().put("input",input)));
            JSONArray errors=result.optJSONArray("errors");
            if(errors==null||errors.length()==0)return;
            String text=errors.getJSONObject(0).optString("message","GitHub refused the commit");
            if(attempt<2&&text.toLowerCase(Locale.ROOT).contains("expected"))continue; // someone pushed in between: commit on the new head
            throw new GitHubError(422,text);
        }
    }
    private static JSONArray callArray(String url,String token)throws Exception{return new JSONArray(request("GET",url,token,null));}
    private static JSONObject call(String method,String url,String token,JSONObject body)throws Exception{String text=request(method,url,token,body);return text.isEmpty()?new JSONObject():new JSONObject(text);}
    private static String request(String method,String url,String token,JSONObject body)throws Exception{
        HttpsURLConnection connection=(HttpsURLConnection)new URL(url).openConnection();
        connection.setConnectTimeout(8000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Accept","application/vnd.github+json");
        connection.setRequestProperty("X-GitHub-Api-Version","2022-11-28");connection.setRequestProperty("User-Agent","RPM-Android");
        try{
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            int code=connection.getResponseCode();
            if(code>=200&&code<300)try(InputStream in=connection.getInputStream()){return CompanionStore.readText(in);}
            String reason="";try(InputStream err=connection.getErrorStream()){if(err!=null)reason=new JSONObject(CompanionStore.readText(err)).optString("message","");}catch(Exception ignored){}
            throw new GitHubError(code,code==401?"the token was refused; reconnect GitHub in Settings":code==403?"the token can’t write there"+(reason.isEmpty()?"":" ("+reason+")"):code==404?"not found":"GitHub said "+code+(reason.isEmpty()?"":" ("+reason+")"));
        }finally{connection.disconnect();}
    }

    // ---- files ----------------------------------------------------------------
    private static JSONObject manifest(Context c,String id){try{return new JSONObject(new String(readFile(new File(new File(ideas(c),id),"manifest.json")),StandardCharsets.UTF_8));}catch(Exception e){return null;}}
    private static List<JSONObject> manifests(Context c){
        List<JSONObject> out=new ArrayList<>();File[] dirs=ideas(c).listFiles(File::isDirectory);if(dirs==null)return out;
        for(File d:dirs){JSONObject m=manifest(c,d.getName());if(m!=null)out.add(m);}
        out.sort(Comparator.comparingLong(m->m.optLong("createdAt")));return out;
    }
    private static void writeManifest(Context c,JSONObject m)throws JSONException{
        try{writeFile(new File(new File(ideas(c),m.getString("id")),"manifest.json"),m.toString().getBytes(StandardCharsets.UTF_8));}catch(IOException e){throw new JSONException("The idea could not be kept: "+e.getMessage());}
    }
    /** Sent ideas keep only their manifest, except the newest (its Undo can still bring the screenshots back); the 30 newest manifests stay. */
    private static void purge(Context c,String keep){
        List<JSONObject> all=manifests(c);
        for(int i=0;i<all.size();i++){JSONObject m=all.get(i);String id=m.optString("id");if(id.equals(keep)||!m.optBoolean("sent"))continue;File d=new File(ideas(c),id);
            if(i<all.size()-30){delete(d);continue;}
            File[] files=d.listFiles((dir,name)->!name.equals("manifest.json"));if(files!=null)for(File f:files)f.delete();}
    }
    private static void writeFile(File file,byte[] bytes)throws IOException{File tmp=new File(file.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(bytes);out.getFD().sync();}if(!tmp.renameTo(file))throw new IOException("Could not write "+file.getName());}
    private static byte[] readFile(File file)throws IOException{try(InputStream in=new FileInputStream(file)){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);return out.toByteArray();}}
    private static void delete(File file){File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);file.delete();}
}
