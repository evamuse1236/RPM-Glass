package com.rpm.prototype;
import android.app.job.*;
import java.util.concurrent.*;
public final class SyncJob extends JobService {
    private final ConcurrentHashMap<Integer,Future<?>> jobs=new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters params){
        Future<?> task=SyncManager.EXECUTOR.submit(()->{boolean retry=SyncManager.sync(getApplicationContext());if(!Thread.currentThread().isInterrupted())jobFinished(params,retry);jobs.remove(params.getJobId());});jobs.put(params.getJobId(),task);return true;
    }
    @Override public boolean onStopJob(JobParameters params){Future<?> task=jobs.remove(params.getJobId());if(task!=null)task.cancel(true);return true;}
}
