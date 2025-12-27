import React, { useState } from 'react';
import { supabase } from '@/lib/supabase.client';

type PromptParts = {
  vibe: string;
  scene: string;
  mood: string;
  camera: string;
  textStyle: string;
  seconds: number;
  orientation: string;
};

type PromptMakerProps = {
  onUsePrompt: (prompt: string, parts: PromptParts) => void;
};

const VIBES = ['VHS', 'cinematic', 'glossy SaaS', 'tour doc', 'glitch', 'dreamy', 'retro', 'futuristic'];
const SCENES = ['studio', 'street', 'stage', 'crowd', 'car', 'rooftop', 'warehouse', 'nature'];
const MOODS = ['hype', 'emotional', 'confident', 'chill', 'energetic', 'mysterious'];
const CAMERAS = ['handheld', 'dolly', 'tripod', 'drone', 'POV', 'tracking shot'];
const TEXT_STYLES = ['minimal', 'bold', 'subtitles', 'kinetic', 'glitch', 'none'];
const DURATIONS = [4, 8, 12, 15, 30, 60];
const ORIENTATIONS = [
  { label: 'Vertical (9:16)', value: 'vertical', size: '720x1280' },
  { label: 'Horizontal (16:9)', value: 'horizontal', size: '1280x720' },
  { label: 'Square (1:1)', value: 'square', size: '1024x1024' },
];

export function PromptMaker({ onUsePrompt }: PromptMakerProps) {
  const [vibe, setVibe] = useState('cinematic');
  const [scene, setScene] = useState('studio');
  const [mood, setMood] = useState('confident');
  const [camera, setCamera] = useState('handheld');
  const [textStyle, setTextStyle] = useState('minimal');
  const [seconds, setSeconds] = useState(8);
  const [orientation, setOrientation] = useState('vertical');
  const [customPrompt, setCustomPrompt] = useState('');
  const [presetName, setPresetName] = useState('');
  const [saving, setSaving] = useState(false);

  const currentSize = ORIENTATIONS.find(o => o.value === orientation)?.size || '720x1280';

  const generatedPrompt = customPrompt ||
    `Create a ${seconds}-second ${orientation} music marketing video with a ${vibe} ${mood} vibe. Scene: ${scene}. Camera: ${camera} movement. Text overlays: ${textStyle} style. High quality, professional music video aesthetic.`;

  const handleUsePrompt = () => {
    const parts: PromptParts = {
      vibe,
      scene,
      mood,
      camera,
      textStyle,
      seconds,
      orientation,
    };
    onUsePrompt(customPrompt || generatedPrompt, parts);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to save presets');
        return;
      }

      const presetJson = {
        vibe,
        scene,
        mood,
        camera,
        textStyle,
        seconds,
        orientation,
        customPrompt: customPrompt || null,
      };

      const { error } = await supabase.from('prompt_presets').insert({
        user_id: user.id,
        name: presetName,
        preset_json: presetJson,
      });

      if (error) throw error;

      alert('Preset saved!');
      setPresetName('');
    } catch (err: any) {
      console.error('Save preset error:', err);
      alert('Failed to save preset: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-xl font-bold mb-4 text-white">Prompt Maker</h3>

      <div className="space-y-4">
        {/* Vibe */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Vibe</label>
          <div className="flex flex-wrap gap-2">
            {VIBES.map(v => (
              <button
                key={v}
                onClick={() => setVibe(v)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  vibe === v
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Scene */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Scene</label>
          <div className="flex flex-wrap gap-2">
            {SCENES.map(s => (
              <button
                key={s}
                onClick={() => setScene(s)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  scene === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Mood */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Mood</label>
          <div className="flex flex-wrap gap-2">
            {MOODS.map(m => (
              <button
                key={m}
                onClick={() => setMood(m)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  mood === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Camera */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Camera</label>
          <div className="flex flex-wrap gap-2">
            {CAMERAS.map(c => (
              <button
                key={c}
                onClick={() => setCamera(c)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  camera === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Text Style */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Text Style</label>
          <div className="flex flex-wrap gap-2">
            {TEXT_STYLES.map(t => (
              <button
                key={t}
                onClick={() => setTextStyle(t)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  textStyle === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Duration (seconds)</label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setSeconds(d)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  seconds === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* Orientation */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Orientation</label>
          <div className="flex flex-wrap gap-2">
            {ORIENTATIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setOrientation(o.value)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  orientation === o.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Size: {currentSize}</p>
        </div>

        {/* Custom Prompt Override */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Custom Prompt (optional)
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Override with your own prompt..."
            className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
          />
        </div>

        {/* Generated Prompt Preview */}
        <div className="bg-gray-900 rounded p-4 border border-gray-700">
          <p className="text-xs text-gray-400 mb-2">Generated Prompt:</p>
          <p className="text-sm text-gray-200">{generatedPrompt}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleUsePrompt}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Use Prompt
          </button>

          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              className="flex-1 px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-sm"
            />
            <button
              onClick={handleSavePreset}
              disabled={saving || !presetName.trim()}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium py-3 px-4 rounded-lg transition-colors text-sm"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
