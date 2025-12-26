import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Play, Pause, Trash2, Users, ArrowRight } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused';
  created_at: string;
  steps_count?: number;
  enrollments_count?: number;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

export default function Sequences() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    steps: [{ wait_minutes: 0, template_id: '', body_override: '' }],
  });

  useEffect(() => {
    if (user) {
      loadSequences();
      loadTemplates();
    }
  }, [user]);

  const loadSequences = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-sequences-crud', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (response.ok && result.sequences) {
        setSequences(result.sequences);
      }
    } catch (error) {
      console.error('[Sequences] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-templates-crud', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (response.ok && result.templates) {
        setTemplates(result.templates);
      }
    } catch (error) {
      console.error('[Sequences] Load templates error:', error);
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      steps: [{ wait_minutes: 0, template_id: '', body_override: '' }],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const addStep = () => {
    setFormData({
      ...formData,
      steps: [...formData.steps, { wait_minutes: 0, template_id: '', body_override: '' }],
    });
  };

  const removeStep = (index: number) => {
    setFormData({
      ...formData,
      steps: formData.steps.filter((_, i) => i !== index),
    });
  };

  const updateStep = (index: number, field: string, value: any) => {
    const newSteps = [...formData.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setFormData({ ...formData, steps: newSteps });
  };

  const createSequence = async () => {
    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }

    if (formData.steps.length === 0) {
      showToast('Add at least one step', 'error');
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-sequences-crud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Sequence created', 'success');
        closeModal();
        loadSequences();
      } else {
        showToast(result.error || 'Failed to create sequence', 'error');
      }
    } catch (error) {
      showToast('Failed to create sequence', 'error');
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-sequences-crud', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (response.ok) {
        showToast(`Sequence ${newStatus === 'active' ? 'activated' : 'paused'}`, 'success');
        loadSequences();
      } else {
        showToast('Failed to update sequence', 'error');
      }
    } catch (error) {
      showToast('Failed to update sequence', 'error');
    }
  };

  const deleteSequence = async (id: string, name: string) => {
    if (!confirm(`Delete sequence "${name}"? This will unenroll all fans.`)) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(`/.netlify/functions/fan-sequences-crud?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        showToast('Sequence deleted', 'success');
        loadSequences();
      } else {
        showToast('Failed to delete sequence', 'error');
      }
    } catch (error) {
      showToast('Failed to delete sequence', 'error');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading sequences...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Sequences</h2>
          <p className="text-gray-400 text-sm mt-1">Multi-step drip campaigns</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Sequence
        </button>
      </div>

      {/* Sequences List */}
      {sequences.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <ArrowRight className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No sequences yet</p>
          <p className="text-gray-500 text-sm mb-4">
            Create a sequence to automatically nurture fans over time
          </p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Create Sequence
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sequences.map((sequence) => (
            <div key={sequence.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{sequence.name}</h3>
                  {sequence.description && (
                    <p className="text-sm text-gray-400">{sequence.description}</p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    sequence.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : sequence.status === 'paused'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {sequence.status}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                <div>{sequence.steps_count || 0} steps</div>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {sequence.enrollments_count || 0} enrolled
                </div>
              </div>

              <div className="flex items-center gap-2">
                {sequence.status !== 'draft' && (
                  <button
                    onClick={() => toggleStatus(sequence.id, sequence.status)}
                    className={`flex-1 px-3 py-1.5 rounded text-sm transition-colors flex items-center justify-center gap-1 ${
                      sequence.status === 'active'
                        ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    }`}
                  >
                    {sequence.status === 'active' ? (
                      <>
                        <Pause className="w-3 h-3" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        Activate
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => deleteSequence(sequence.id, sequence.name)}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Create Sequence</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Sequence Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Welcome Series"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nurture new fans over 7 days"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">Steps</label>
                  <button
                    onClick={addStep}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
                  >
                    Add Step
                  </button>
                </div>

                <div className="space-y-3">
                  {formData.steps.map((step, index) => (
                    <div key={index} className="bg-black border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Step {index + 1}</span>
                        {formData.steps.length > 1 && (
                          <button
                            onClick={() => removeStep(index)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Wait Time (minutes)</label>
                          <input
                            type="number"
                            value={step.wait_minutes}
                            onChange={(e) => updateStep(index, 'wait_minutes', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                            placeholder="0"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Template</label>
                          <select
                            value={step.template_id}
                            onChange={(e) => updateStep(index, 'template_id', e.target.value)}
                            className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                          >
                            <option value="">-- Select Template --</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Or Custom Message</label>
                          <textarea
                            value={step.body_override}
                            onChange={(e) => updateStep(index, 'body_override', e.target.value)}
                            className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                            placeholder="Custom message..."
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createSequence}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Create Sequence
              </button>
              <button
                onClick={closeModal}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
