package com.rpm.prototype;

import java.io.InterruptedIOException;
import java.net.HttpURLConnection;
import java.net.URL;

public final class ModelRequestsTest {
    private static int checks;
    private static void check(boolean value){checks++;if(!value)throw new AssertionError("Check "+checks);}
    private static final class Connection extends HttpURLConnection {
        boolean disconnected;
        Connection()throws Exception{super(new URL("https://example.invalid"));}
        public void connect(){}public boolean usingProxy(){return false;}
        public void disconnect(){disconnected=true;}
    }
    public static void main(String[] args)throws Exception {
        ModelRequests requests=new ModelRequests();
        ModelRequests.Request queued=requests.register("queued");
        check(requests.cancel("queued"));
        Connection late=new Connection();
        try{queued.attach(late);throw new AssertionError("Cancelled work connected");}catch(InterruptedIOException expected){check(late.disconnected);}
        requests.finish("queued",queued);
        check(!requests.cancel("queued"));
        ModelRequests.Request first=requests.register("first"),second=requests.register("second");
        Connection a=new Connection(),b=new Connection();first.attach(a);second.attach(b);
        check(requests.cancel("first"));check(a.disconnected&&!b.disconnected);
        second.check();
        try{requests.register("second");throw new AssertionError("Duplicate accepted");}catch(IllegalArgumentException expected){check(true);}
        requests.finish("first",first);
        ModelRequests.Request replacement=requests.register("first");requests.finish("first",first);
        check(requests.cancel("first")); // An old completion cannot remove a newer request.
        requests.cancelAll();check(b.disconnected);
        try{requests.register("after-close");throw new AssertionError("Closed registry accepted work");}catch(IllegalStateException expected){check(true);}
        check(!requests.cancel("missing"));
        System.out.println("PASS: "+checks+" native model cancellation checks");
    }
}
