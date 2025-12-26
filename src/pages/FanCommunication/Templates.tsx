import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Edit2, Trash2, Copy, Sparkles } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Template {
  id: string;
  owner_user_id: string;
  name: string;
  category: string;
  body: string;
  variables: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'dm', label: 'Direct Message' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'promo', label: 'Promo' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'quick_reply', label: 'Quick Reply' },
  { value: 'comment_reply', label: 'Comment Reply' },
];

const AVAILABLE_VARIABLES = [
  { value: '{{first_name}}', label: 'First Name' },
  { value: '{{artist_name}}', label: 'Artist Name' },
  { value: '{{smart_link}}', label: 'Smart Link' },
  { value: '{{city}}', label: 'City' },
  { value: '{{release_name}}', label: 'Release Name' },
  { value: '{{release_type}}', label: 'Release Type' },
  { value: '{{date}}', label: 'Date' },
  { value: '{{ticket_link}}', label: 'Ticket Link' },
  { value: '{{merch_link}}', label: 'Merch Link' },
];

export default function Templates() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'dm',
    body: '',
  });
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    if (user) {
      loadTemplates();
      seedDefaultTemplates();
    }
  }, [user]);

  const seedDefaultTemplates = async () => {
    if (!user) return;

    setSeeding(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-templates-seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.seeded) {
        loadTemplates();
      }
    } catch (error) {
      console.error('[Templates] Seed error:', error);
    } finally {
      setSeeding(false);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
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
      console.error('[Templates] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({ name: '', category: 'dm', body: '' });
    setShowModal(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      body: template.body,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormData({ name: '', category: 'dm', body: '' });
  };

  const saveTemplate = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      showToast('Name and body are required', 'error');
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const isEdit = !!editingTemplate;
      const response = await fetch('/.netlify/functions/fan-templates-crud', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(isEdit && { id: editingTemplate.id }),
          name: formData.name,
          category: formData.category,
          body: formData.body,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        showToast(`Template ${isEdit ? 'updated' : 'created'}`, 'success');
        closeModal();
        loadTemplates();
      } else {
        showToast(result.error || 'Failed to save template', 'error');
      }
    } catch (error) {
      showToast('Failed to save template', 'error');
    }
  };

  const deleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(`/.netlify/functions/fan-templates-crud?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        showToast('Template deleted', 'success');
        loadTemplates();
      } else {
        showToast('Failed to delete template', 'error');
      }
    } catch (error) {
      showToast('Failed to delete template', 'error');
    }
  };

  const duplicateTemplate = (template: Template) => {
    setEditingTemplate(null);
    setFormData({
      name: `${template.name} (Copy)`,
      category: template.category,
      body: template.body,
    });
    setShowModal(true);
  };

  const insertVariable = (variable: string) => {
    setFormData({
      ...formData,
      body: formData.body + variable,
    });
  };

  const filteredTemplates = categoryFilter === 'all'
    ? templates
    : templates.filter((t) => t.category === categoryFilter);

  if (loading || seeding) {
    return <div className="text-center py-12 text-gray-400">Loading templates...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Message Templates</h2>
          <p className="text-gray-400 text-sm mt-1">
            Create reusable messages with variables
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            categoryFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          All ({templates.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = templates.filter((t) => t.category === cat.value).length;
          return (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                categoryFilter === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <Sparkles className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No templates yet</p>
          <p className="text-gray-500 text-sm mb-4">
            Create your first template to save time messaging fans
          </p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <div key={template.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                    {CATEGORIES.find((c) => c.value === template.category)?.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => duplicateTemplate(template)}
                    className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(template)}
                    className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteTemplate(template.id, template.name)}
                    className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-400 bg-black rounded p-3 mb-3 max-h-32 overflow-y-auto">
                {template.body}
              </div>

              <div className="text-xs text-gray-500">
                Created {new Date(template.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingTemplate ? 'Edit Template' : 'Create Template'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New Release Announcement"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Message Body
                </label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-32"
                  placeholder="Hey {{first_name}}! Check out my new release..."
                />
                <div className="text-sm text-gray-500 mt-1">
                  {formData.body.length} characters
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Insert Variables
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_VARIABLES.map((variable) => (
                    <button
                      key={variable.value}
                      onClick={() => insertVariable(variable.value)}
                      className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-xs rounded border border-gray-700 transition-colors"
                    >
                      {variable.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {formData.body && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Preview</label>
                  <div className="bg-black border border-gray-700 rounded-lg p-3 text-sm text-gray-300">
                    {formData.body
                      .replace(/\{\{first_name\}\}/g, 'John')
                      .replace(/\{\{artist_name\}\}/g, 'Your Artist Name')
                      .replace(/\{\{smart_link\}\}/g, 'https://link.example.com')
                      .replace(/\{\{city\}\}/g, 'Los Angeles')
                      .replace(/\{\{release_name\}\}/g, 'New Single')
                      .replace(/\{\{release_type\}\}/g, 'single')
                      .replace(/\{\{date\}\}/g, 'Friday')
                      .replace(/\{\{ticket_link\}\}/g, 'https://tickets.example.com')
                      .replace(/\{\{merch_link\}\}/g, 'https://shop.example.com')}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveTemplate}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                {editingTemplate ? 'Update Template' : 'Create Template'}
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
