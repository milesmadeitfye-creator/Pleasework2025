import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StudioIndex() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/studio/getting-started', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-ghoste-navy flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-blue"></div>
    </div>
  );
}
