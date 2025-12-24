import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Film, Type, Trash2 } from 'lucide-react';

interface VideoProject {
  id: string;
  title: string;
  video_url: string;
  captions: Array<{ text: string; time: number; duration: number; style: string }>;
  thumbnail_url: string;
  duration: number;
  created_at: string;
}

export default function VideoEditor() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    video_url: '',
  });

  const [captionForm, setCaptionForm] = useState({
    text: '',
    time: 0,
    duration: 2,
    style: 'default',
  });

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('video_projects')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (data) {
      setProjects(data);
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('video_projects')
      .insert([{
        user_id: user?.id,
        ...formData,
        captions: [],
      }]);

    if (!error) {
      fetchProjects();
      setFormData({ title: '', video_url: '' });
      setShowModal(false);
    }
  };

  const addCaption = async () => {
    if (!selectedProject) return;

    const updatedCaptions = [...selectedProject.captions, captionForm];

    await supabase
      .from('video_projects')
      .update({ captions: updatedCaptions, updated_at: new Date().toISOString() })
      .eq('id', selectedProject.id);

    fetchProjects();
    setCaptionForm({ text: '', time: 0, duration: 2, style: 'default' });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this project?')) {
      await supabase.from('video_projects').delete().eq('id', id);
      fetchProjects();
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Video Editor</h2>
          <p className="text-gray-400">Add captions and text overlays to your videos</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No video projects yet</h3>
          <p className="text-gray-400 mb-6">Create your first video project with custom captions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div key={project.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{project.title}</h3>
                  <p className="text-xs text-gray-400">{project.captions.length} captions</p>
                </div>
                <button
                  onClick={() => handleDelete(project.id)}
                  className="p-2 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-black rounded-lg aspect-video mb-3 flex items-center justify-center">
                <Film className="w-12 h-12 text-gray-600" />
              </div>

              <button
                onClick={() => setSelectedProject(project)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Type className="w-4 h-4" />
                Add Captions
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-md w-full">
            <h3 className="text-2xl font-bold mb-6">New Video Project</h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Project Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Video URL *</label>
                <input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">Add Caption to "{selectedProject.title}"</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">Caption Text</label>
                <input
                  type="text"
                  value={captionForm.text}
                  onChange={(e) => setCaptionForm({ ...captionForm, text: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter caption text..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Time (seconds)</label>
                  <input
                    type="number"
                    value={captionForm.time}
                    onChange={(e) => setCaptionForm({ ...captionForm, time: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Duration (seconds)</label>
                  <input
                    type="number"
                    value={captionForm.duration}
                    onChange={(e) => setCaptionForm({ ...captionForm, duration: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.1"
                  />
                </div>
              </div>

              <button
                onClick={addCaption}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Caption
              </button>
            </div>

            <div className="border-t border-gray-800 pt-6">
              <h4 className="font-semibold mb-4">Existing Captions ({selectedProject.captions.length})</h4>
              <div className="space-y-2">
                {selectedProject.captions.map((caption, idx) => (
                  <div key={idx} className="bg-black rounded-lg p-3">
                    <div className="font-medium mb-1">{caption.text}</div>
                    <div className="text-xs text-gray-400">
                      {caption.time}s - {caption.time + caption.duration}s
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelectedProject(null)}
              className="w-full mt-6 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
