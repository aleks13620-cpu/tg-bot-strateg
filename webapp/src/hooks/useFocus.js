import { useState, useEffect } from 'react';
import { api } from '../api/client.js';

export function useFocus(period) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getFocus(period)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  return { data, loading, error };
}
