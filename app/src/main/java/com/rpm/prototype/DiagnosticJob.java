package com.rpm.prototype;
import android.app.job.*;
import java.util.concurrent.*;
public final class DiagnosticJob extends JobService {
    private final ConcurrentHashMap<Integer,Future<?>> jobs=new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters params){Future<?> task=Diagnostics.NETWORK.submit(()->{boolean retry=Diagnostics.sync(getApplicationContext());if(!Thread.currentThread().isInterrupted())jobFinished(params,retry);jobs.remove(params.getJobId());});jobs.put(params.getJobId(),task);return true;}
    @Override public boolean onStopJob(JobParameters params){Future<?> task=jobs.remove(params.getJobId());if(task!=null)task.cancel(true);return true;}
}
