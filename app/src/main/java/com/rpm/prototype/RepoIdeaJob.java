package com.rpm.prototype;
import android.app.job.*;
import java.util.concurrent.*;
/** Sends repo ideas that are still waiting on the phone once there is a network; retries with backoff while GitHub is connected. */
public final class RepoIdeaJob extends JobService {
    private static final ExecutorService EXECUTOR=Executors.newSingleThreadExecutor();
    private volatile Future<?> task;
    @Override public boolean onStartJob(JobParameters params){
        task=EXECUTOR.submit(()->{boolean retry=false;try{RepoIdeas.sendWaiting(getApplicationContext());retry=RepoIdeas.waiting(getApplicationContext())>0&&CompanionKey.github(getApplicationContext())!=null;}catch(Exception ignored){retry=true;}if(!Thread.currentThread().isInterrupted())jobFinished(params,retry);});
        return true;
    }
    @Override public boolean onStopJob(JobParameters params){Future<?> running=task;if(running!=null)running.cancel(true);return true;}
}
