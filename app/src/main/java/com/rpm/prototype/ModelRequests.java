package com.rpm.prototype;

import java.io.InterruptedIOException;
import java.net.HttpURLConnection;
import java.util.concurrent.ConcurrentHashMap;

/** Request-scoped cancellation also covers work still queued behind another request. */
final class ModelRequests {
    private final ConcurrentHashMap<String,Request> active=new ConcurrentHashMap<>();
    private volatile boolean closed;

    synchronized Request register(String id) {
        if(closed)throw new IllegalStateException("The capture window is closed.");
        if(id==null||!id.matches("[A-Za-z0-9_:/-]{1,160}"))throw new IllegalArgumentException("Invalid model request ID.");
        Request request=new Request();
        if(active.putIfAbsent(id,request)!=null)throw new IllegalArgumentException("That model request is already running.");
        return request;
    }
    boolean cancel(String id) {Request request=id==null?null:active.get(id);if(request==null)return false;request.cancel();return true;}
    void finish(String id,Request request) {active.remove(id,request);}
    synchronized void cancelAll() {closed=true;for(Request request:active.values())request.cancel();active.clear();}

    static final class Request {
        private volatile boolean cancelled;
        private volatile HttpURLConnection connection;
        void attach(HttpURLConnection value)throws InterruptedIOException {
            connection=value;
            if(cancelled){value.disconnect();check();}
        }
        void check()throws InterruptedIOException {if(cancelled)throw new InterruptedIOException("Interpretation cancelled; your thought is saved.");}
        void cancel() {cancelled=true;HttpURLConnection value=connection;if(value!=null)value.disconnect();}
    }
}
