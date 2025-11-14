import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/contexts/NotificationsContext';

interface BackgroundJob {
  id: string;
  type: 'bulk_generation' | 'comparison_analysis' | 'investment_report';
}

export function BackgroundJobTracker() {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const jobsRef = useRef<BackgroundJob[]>([]);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { addNotification } = useNotifications();
  const processedJobsRef = useRef<Set<string>>(new Set());

  // Keep jobsRef in sync with jobs state
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Load jobs from localStorage on mount and also load processed jobs
  useEffect(() => {
    const stored = localStorage.getItem('background_jobs');
    const processedStored = localStorage.getItem('processed_jobs');
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setJobs(parsed);
      } catch (error) {
        console.error('Failed to parse background jobs:', error);
      }
    }
    
    if (processedStored) {
      try {
        const parsed = JSON.parse(processedStored);
        processedJobsRef.current = new Set(parsed);
      } catch (error) {
        console.error('Failed to parse processed jobs:', error);
      }
    }
  }, []);

  // Save jobs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('background_jobs', JSON.stringify(jobs));
  }, [jobs]);

  // Save processed jobs to localStorage whenever they change
  useEffect(() => {
    const saveProcessedJobs = () => {
      localStorage.setItem('processed_jobs', JSON.stringify(Array.from(processedJobsRef.current)));
    };
    
    // Debounce saves
    const timeoutId = setTimeout(saveProcessedJobs, 500);
    return () => clearTimeout(timeoutId);
  }, [jobs]); // Trigger when jobs change to ensure processed state is saved

  // Poll for job status
  useEffect(() => {
    if (jobs.length === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const checkAllJobs = async () => {
      const currentJobs = jobsRef.current;
      for (const job of currentJobs) {
        try {
          if (job.type === 'bulk_generation') {
            await checkBulkGenerationJob(job.id);
          } else if (job.type === 'comparison_analysis') {
            await checkComparisonJob(job.id);
          } else if (job.type === 'investment_report') {
            await checkInvestmentReportJob(job.id);
          }
        } catch (error) {
          console.error(`Error checking job ${job.id}:`, error);
        }
      }
    };

    if (!pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(checkAllJobs, 3000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [jobs.length]);

  const checkBulkGenerationJob = async (jobId: string) => {
    if (processedJobsRef.current.has(jobId)) return;

    const { data: job } = await supabase
      .from('bulk_generation_jobs' as any)
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) return;

    const typedJob = job as any;
    
    if (typedJob.status === 'completed') {
      addNotification({
        type: 'info',
        title: 'Bulk Generation Complete',
        message: `Successfully generated ${typedJob.completed_reports} of ${typedJob.total_reports} reports`
      });
      processedJobsRef.current.add(jobId);
      removeJob(jobId);
    } else if (typedJob.status === 'failed') {
      addNotification({
        type: 'report_failed',
        title: 'Bulk Generation Failed',
        message: `Failed to complete bulk generation. ${typedJob.failed_reports} reports failed.`
      });
      processedJobsRef.current.add(jobId);
      removeJob(jobId);
    }
  };

  const checkComparisonJob = async (jobId: string) => {
    if (processedJobsRef.current.has(jobId)) return;

    const { data: comparison } = await supabase
      .from('property_comparisons' as any)
      .select('*')
      .eq('id', jobId)
      .single();

    if (comparison) {
      addNotification({
        type: 'info',
        title: 'Comparison Analysis Complete',
        message: 'Your property comparison analysis is ready to view'
      });
      processedJobsRef.current.add(jobId);
      removeJob(jobId);
    }
  };

  const checkInvestmentReportJob = async (jobId: string) => {
    if (processedJobsRef.current.has(jobId)) return;

    const { data: report } = await supabase
      .from('investment_reports')
      .select('id, property_address, status, error_message')
      .eq('id', jobId)
      .single();

    if (!report) return;
    
    // Type assertion since types file hasn't been regenerated yet
    const reportData = report as any;
    
    if (reportData.status === 'completed') {
      addNotification({
        type: 'report_generated',
        title: 'Investment Report Completed',
        message: `Your investment report for ${reportData.property_address} has been generated successfully.`,
        reportId: reportData.id,
      });
      processedJobsRef.current.add(jobId);
      removeJob(jobId);
    } else if (reportData.status === 'failed') {
      addNotification({
        type: 'report_failed',
        title: 'Investment Report Failed',
        message: `Failed to generate report for ${reportData.property_address}. ${reportData.error_message || 'Please try again.'}`,
      });
      processedJobsRef.current.add(jobId);
      removeJob(jobId);
    }
  };

  const removeJob = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  // Listen for new jobs
  useEffect(() => {
    const handleAddJob = (event: CustomEvent<BackgroundJob>) => {
      setJobs(prev => {
        // Don't add if already exists
        if (prev.some(j => j.id === event.detail.id)) return prev;
        return [...prev, event.detail];
      });
    };

    window.addEventListener('addBackgroundJob' as any, handleAddJob);
    return () => window.removeEventListener('addBackgroundJob' as any, handleAddJob);
  }, []);

  return null; // This component doesn't render anything
}

// Helper function to add a job from anywhere in the app
export function addBackgroundJob(job: BackgroundJob) {
  window.dispatchEvent(new CustomEvent('addBackgroundJob', { detail: job }));
}
