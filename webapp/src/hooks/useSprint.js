import { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export function useSprint() {
  const [sprint, setSprint] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getActiveSprint()
      .then(({ sprint, metrics }) => {
        setSprint(sprint);
        setMetrics(metrics || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { sprint, metrics, loading, error };
}
