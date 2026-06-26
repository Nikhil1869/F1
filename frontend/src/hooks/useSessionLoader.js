import { useState, useEffect } from 'react';

export function useSessionLoader(year, round, session = "R", full = false) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let pollingInterval = null;
    let isCancelled = false;

    const startLoad = async () => {
      if (!year || !round) return;

      try {
        setLoading(true);
        setReady(false);
        setError(null);
        setProgress(0);

        // 1. Trigger async load
        const loadRes = await fetch(`/api/session/load`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, round, session, full })
        });
        
        const loadData = await loadRes.json();

        if (!loadRes.ok) {
          throw new Error(loadData.error || 'Failed to start session load');
        }

        const jobId = loadData.job_id;

        // 2. Poll for status
        const pollStatus = async () => {
          if (isCancelled) return;
          try {
            const statusRes = await fetch(`/api/session/status/${jobId}`);
            const statusData = await statusRes.json();

            if (!statusRes.ok) {
              throw new Error(statusData.error || 'Failed to check status');
            }

            setProgress(statusData.progress || 0);

            if (statusData.status === 'ready') {
              setReady(true);
              setLoading(false);
              clearInterval(pollingInterval);
            } else if (statusData.status === 'error') {
              throw new Error(statusData.error || 'Backend loading failed');
            }
          } catch (err) {
            setError(err.message);
            setLoading(false);
            clearInterval(pollingInterval);
          }
        };

        // Poll immediately once, then every 1s
        await pollStatus();
        if (!isCancelled) {
            pollingInterval = setInterval(pollStatus, 1000);
        }

      } catch (err) {
        if (!isCancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    startLoad();

    return () => {
      isCancelled = true;
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [year, round, session, full]);

  return { loading, progress, error, ready };
}
