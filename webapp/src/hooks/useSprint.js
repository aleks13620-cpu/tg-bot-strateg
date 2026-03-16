import { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export function useSprint() {
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getActiveSprint()
      .then(({ sprints }) => {
        setSprints(sprints || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const primarySprint = sprints[0] || null;

  return { sprints, primarySprint, loading, error };
}
