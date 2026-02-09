import { useState, useEffect, useCallback } from 'react';
import {
  adminGetServices,
  adminMorphStart,
  adminMorphStop,
  adminDeblurStart,
  adminDeblurStop,
} from '../../services/api';

function ServiceCard({ title, status, url, startedByUs, onStart, onStop, loading, actionError }) {
  const isRunning = status === 'running';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            isRunning ? 'bg-green-900/50 text-green-300' : 'bg-slate-700 text-slate-400'
          }`}
        >
          {isRunning ? 'Running' : 'Stopped'}
        </span>
      </div>
      {url && (
        <p className="text-xs text-slate-500 mb-3 font-mono">{url}</p>
      )}
      {actionError && (
        <p className="text-xs text-red-400 mb-2">{actionError}</p>
      )}
      <div className="flex gap-2">
        {title === 'Backend' ? (
          <p className="text-sm text-slate-400">No start/stop (this server).</p>
        ) : (
          <>
            <button
              onClick={onStart}
              disabled={loading || isRunning}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
            >
              {loading ? '...' : 'Start'}
            </button>
            <button
              onClick={onStop}
              disabled={loading || !isRunning || !startedByUs}
              className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
              title={!startedByUs && isRunning ? 'Stop this service in its own terminal' : ''}
            >
              Stop
            </button>
            {isRunning && !startedByUs && (
              <span className="text-xs text-slate-500 self-center">Started externally</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPanel({ onClose }) {
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({ morph: false, deblur: false });
  const [actionError, setActionError] = useState({ morph: null, deblur: null });

  const fetchServices = useCallback(async () => {
    try {
      const data = await adminGetServices();
      setServices(data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load services');
      setServices(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 5000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  const handleMorphStart = async () => {
    setActionError((prev) => ({ ...prev, morph: null }));
    setActionLoading((prev) => ({ ...prev, morph: true }));
    try {
      await adminMorphStart();
      await fetchServices();
    } catch (e) {
      setActionError((prev) => ({ ...prev, morph: e.response?.data?.error || e.message || 'Failed to start' }));
    } finally {
      setActionLoading((prev) => ({ ...prev, morph: false }));
    }
  };

  const handleMorphStop = async () => {
    setActionError((prev) => ({ ...prev, morph: null }));
    setActionLoading((prev) => ({ ...prev, morph: true }));
    try {
      await adminMorphStop();
      await fetchServices();
    } catch (e) {
      setActionError((prev) => ({ ...prev, morph: e.response?.data?.error || e.message || 'Failed to stop' }));
    } finally {
      setActionLoading((prev) => ({ ...prev, morph: false }));
    }
  };

  const handleDeblurStart = async () => {
    setActionError((prev) => ({ ...prev, deblur: null }));
    setActionLoading((prev) => ({ ...prev, deblur: true }));
    try {
      await adminDeblurStart();
      await fetchServices();
    } catch (e) {
      setActionError((prev) => ({ ...prev, deblur: e.response?.data?.error || e.message || 'Failed to start' }));
    } finally {
      setActionLoading((prev) => ({ ...prev, deblur: false }));
    }
  };

  const handleDeblurStop = async () => {
    setActionError((prev) => ({ ...prev, deblur: null }));
    setActionLoading((prev) => ({ ...prev, deblur: true }));
    try {
      await adminDeblurStop();
      await fetchServices();
    } catch (e) {
      setActionError((prev) => ({ ...prev, deblur: e.response?.data?.error || e.message || 'Failed to stop' }));
    } finally {
      setActionLoading((prev) => ({ ...prev, deblur: false }));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10002]"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-200">Admin – Services</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-auto">
          {loading && !services && (
            <p className="text-slate-400">Loading...</p>
          )}
          {error && (
            <p className="text-red-400 mb-4">{error}</p>
          )}
          {services && (
            <div className="space-y-4">
              <ServiceCard
                title="Backend"
                status={services.backend?.status}
                url={null}
                startedByUs={false}
              />
              <ServiceCard
                title="Morph service"
                status={services.morph?.status}
                url={services.morph?.url}
                startedByUs={services.morph?.startedByUs}
                onStart={handleMorphStart}
                onStop={handleMorphStop}
                loading={actionLoading.morph}
                actionError={actionError.morph}
              />
              <ServiceCard
                title="Deblur service"
                status={services.deblur?.status}
                url={services.deblur?.url}
                startedByUs={services.deblur?.startedByUs}
                onStart={handleDeblurStart}
                onStop={handleDeblurStop}
                loading={actionLoading.deblur}
                actionError={actionError.deblur}
              />
            </div>
          )}

          <p className="text-xs text-slate-500 mt-4">
            Status refreshes every 5 seconds. You can only stop a service from here if it was started via this panel.
          </p>
        </div>
      </div>
    </div>
  );
}
