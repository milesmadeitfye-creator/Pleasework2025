import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Play, Pause, Trash2, Copy, Save, AlertCircle, CheckCircle, Sparkles, ArrowDown, X } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Automation {
  id: string;
  owner_user_id: string;
  name: string;
  status: 'draft' | 'active' | 'paused';
  description?: string;
  created_at: string;
  updated_at: string;
}

interface AutomationNode {
  id: string;
  automation_id: string;
  kind: 'trigger' | 'condition' | 'action' | 'delay';
  config: Record<string, any>;
  position?: any;
  created_at: string;
}

interface AutomationEdge {
  id: string;
  automation_id: string;
  from_node_id: string;
  to_node_id: string;
  condition?: any;
}

interface TriggerConfig {
  type: 'inbound_message_received' | 'keyword';
  keyword?: string;
  match_mode?: 'contains' | 'exact';
}

interface ActionConfig {
  type: 'send_message' | 'add_tag' | 'grant_optin';
  text?: string;
  tag_name?: string;
  optin_type?: 'otn' | 'recurring' | '24h';
  optin_topic?: string;
}

export default function Automations() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [edges, setEdges] = useState<AutomationEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [testConversationId, setTestConversationId] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  // Form state
  const [automationName, setAutomationName] = useState('');
  const [automationStatus, setAutomationStatus] = useState<'draft' | 'active' | 'paused'>('draft');
  const [trigger, setTrigger] = useState<TriggerConfig>({ type: 'inbound_message_received' });
  const [actions, setActions] = useState<ActionConfig[]>([]);

  const automationsEnabled = import.meta.env.VITE_FAN_AUTOMATIONS_ENABLED === 'true';

  useEffect(() => {
    if (user) {
      loadAutomations();
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedAutomation) {
      loadAutomationDetails(selectedAutomation.id);
    }
  }, [selectedAutomation]);

  const loadAutomations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fan_dm_automations')
      .select('*')
      .eq('owner_user_id', user?.id)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setAutomations(data);
      if (data.length > 0 && !selectedAutomation) {
        setSelectedAutomation(data[0]);
      }
    }
    setLoading(false);
  };

  const loadAutomationDetails = async (automationId: string) => {
    const [nodesRes, edgesRes] = await Promise.all([
      supabase
        .from('fan_dm_automation_nodes')
        .select('*')
        .eq('automation_id', automationId),
      supabase
        .from('fan_dm_automation_edges')
        .select('*')
        .eq('automation_id', automationId),
    ]);

    if (nodesRes.data) {
      setNodes(nodesRes.data);

      // Parse existing nodes into form state
      const triggerNode = nodesRes.data.find((n) => n.kind === 'trigger');
      const actionNodes = nodesRes.data.filter((n) => n.kind === 'action');

      if (triggerNode) {
        setTrigger(triggerNode.config);
      }

      if (actionNodes.length > 0) {
        setActions(actionNodes.map((n) => n.config));
      }
    }

    if (edgesRes.data) {
      setEdges(edgesRes.data);
    }

    if (selectedAutomation) {
      setAutomationName(selectedAutomation.name);
      setAutomationStatus(selectedAutomation.status);
    }
  };

  const loadConversations = async () => {
    const { data } = await supabase
      .from('fan_dm_conversations')
      .select('id, fan_name, fan_username, platform, updated_at')
      .eq('owner_user_id', user?.id)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (data) {
      setConversations(data);
    }
  };

  const createNewAutomation = () => {
    setSelectedAutomation(null);
    setAutomationName('New Automation');
    setAutomationStatus('draft');
    setTrigger({ type: 'inbound_message_received' });
    setActions([]);
    setNodes([]);
    setEdges([]);
  };

  const duplicateAutomation = async (automation: Automation) => {
    if (!confirm(`Duplicate "${automation.name}"?`)) return;

    const { data: newAuto, error } = await supabase
      .from('fan_dm_automations')
      .insert([
        {
          owner_user_id: user?.id,
          name: `${automation.name} (Copy)`,
          status: 'draft',
          description: automation.description,
        },
      ])
      .select()
      .single();

    if (!error && newAuto) {
      // Copy nodes and edges
      const { data: oldNodes } = await supabase
        .from('fan_dm_automation_nodes')
        .select('*')
        .eq('automation_id', automation.id);

      if (oldNodes) {
        const nodeIdMap: Record<string, string> = {};

        for (const node of oldNodes) {
          const { data: newNode } = await supabase
            .from('fan_dm_automation_nodes')
            .insert([
              {
                automation_id: newAuto.id,
                kind: node.kind,
                config: node.config,
                position: node.position,
              },
            ])
            .select()
            .single();

          if (newNode) {
            nodeIdMap[node.id] = newNode.id;
          }
        }

        const { data: oldEdges } = await supabase
          .from('fan_dm_automation_edges')
          .select('*')
          .eq('automation_id', automation.id);

        if (oldEdges) {
          for (const edge of oldEdges) {
            await supabase.from('fan_dm_automation_edges').insert([
              {
                automation_id: newAuto.id,
                from_node_id: nodeIdMap[edge.from_node_id],
                to_node_id: nodeIdMap[edge.to_node_id],
                condition: edge.condition,
              },
            ]);
          }
        }
      }

      showToast('Automation duplicated', 'success');
      loadAutomations();
    }
  };

  const deleteAutomation = async () => {
    if (!selectedAutomation) return;

    const { error } = await supabase
      .from('fan_dm_automations')
      .delete()
      .eq('id', selectedAutomation.id);

    if (!error) {
      showToast('Automation deleted', 'success');
      setShowDeleteModal(false);
      setSelectedAutomation(null);
      loadAutomations();
    } else {
      showToast('Failed to delete automation', 'error');
    }
  };

  const saveAutomation = async () => {
    if (!automationName.trim()) {
      showToast('Automation name is required', 'error');
      return;
    }

    setSaving(true);

    try {
      let automationId = selectedAutomation?.id;

      // Create or update automation
      if (automationId) {
        await supabase
          .from('fan_dm_automations')
          .update({
            name: automationName,
            status: automationStatus,
          })
          .eq('id', automationId);
      } else {
        const { data: newAuto, error } = await supabase
          .from('fan_dm_automations')
          .insert([
            {
              owner_user_id: user?.id,
              name: automationName,
              status: automationStatus,
            },
          ])
          .select()
          .single();

        if (error || !newAuto) {
          throw new Error('Failed to create automation');
        }

        automationId = newAuto.id;
        setSelectedAutomation(newAuto);
      }

      // Delete existing nodes/edges
      await supabase.from('fan_dm_automation_nodes').delete().eq('automation_id', automationId);

      // Create nodes in linear chain
      const nodeIds: string[] = [];

      // 1. Trigger node
      const { data: triggerNode } = await supabase
        .from('fan_dm_automation_nodes')
        .insert([
          {
            automation_id: automationId,
            kind: 'trigger',
            config: trigger,
            position: { x: 100, y: 100 },
          },
        ])
        .select()
        .single();

      if (triggerNode) {
        nodeIds.push(triggerNode.id);
      }

      // 2. Action nodes
      for (let i = 0; i < actions.length; i++) {
        const { data: actionNode } = await supabase
          .from('fan_dm_automation_nodes')
          .insert([
            {
              automation_id: automationId,
              kind: 'action',
              config: actions[i],
              position: { x: 100, y: 200 + i * 100 },
            },
          ])
          .select()
          .single();

        if (actionNode) {
          nodeIds.push(actionNode.id);
        }
      }

      // 3. Create edges (sequential connections)
      for (let i = 0; i < nodeIds.length - 1; i++) {
        await supabase.from('fan_dm_automation_edges').insert([
          {
            automation_id: automationId,
            from_node_id: nodeIds[i],
            to_node_id: nodeIds[i + 1],
          },
        ]);
      }

      showToast('Automation saved successfully', 'success');
      loadAutomations();
      loadAutomationDetails(automationId);
    } catch (err: any) {
      showToast(err.message || 'Failed to save automation', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testAutomation = async () => {
    if (!selectedAutomation || !testConversationId) {
      showToast('Please select a conversation to test', 'error');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-automation-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: testConversationId,
        }),
      });

      const result = await response.json();
      setTestResult(result);

      if (response.ok && result.success) {
        showToast('Test run completed', 'success');
      } else {
        showToast(result.message || 'Test run failed', 'error');
      }
    } catch (err: any) {
      showToast('Failed to run test', 'error');
    } finally {
      setTesting(false);
    }
  };

  const addAction = () => {
    setActions([...actions, { type: 'send_message', text: '' }]);
  };

  const updateAction = (index: number, updated: ActionConfig) => {
    const newActions = [...actions];
    newActions[index] = updated;
    setActions(newActions);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading automations...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Automations List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Automations</h3>
          <button
            onClick={createNewAutomation}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            title="New Automation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {automations.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No automations yet. Create one to get started!
            </div>
          ) : (
            automations.map((automation) => (
              <div
                key={automation.id}
                onClick={() => setSelectedAutomation(automation)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedAutomation?.id === automation.id
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium truncate">{automation.name}</div>
                  <div className="flex items-center gap-1">
                    {automation.status === 'active' && (
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Active</span>
                    )}
                    {automation.status === 'paused' && (
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">Paused</span>
                    )}
                    {automation.status === 'draft' && (
                      <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded">Draft</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Updated {new Date(automation.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Editor */}
      <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-6">
        {selectedAutomation || automationName ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {selectedAutomation ? 'Edit Automation' : 'New Automation'}
              </h3>
              <div className="flex items-center gap-2">
                {selectedAutomation && (
                  <>
                    <button
                      onClick={() => duplicateAutomation(selectedAutomation)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
              <input
                type="text"
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Welcome Message"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={automationStatus === 'draft'}
                    onChange={() => setAutomationStatus('draft')}
                    className="text-blue-600"
                  />
                  <span>Draft</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={automationStatus === 'active'}
                    onChange={() => setAutomationStatus('active')}
                    className="text-blue-600"
                    disabled={!automationsEnabled}
                  />
                  <span>Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={automationStatus === 'paused'}
                    onChange={() => setAutomationStatus('paused')}
                    className="text-blue-600"
                  />
                  <span>Paused</span>
                </label>
              </div>
              {!automationsEnabled && (
                <div className="mt-2 text-xs text-yellow-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Enable automations in environment settings to activate
                </div>
              )}
            </div>

            {/* Trigger */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h4 className="font-semibold text-purple-300">Trigger</h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">When</label>
                <select
                  value={trigger.type}
                  onChange={(e) =>
                    setTrigger({ type: e.target.value as any, keyword: '', match_mode: 'contains' })
                  }
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="inbound_message_received">Inbound DM received</option>
                  <option value="keyword">Keyword match</option>
                </select>
              </div>

              {trigger.type === 'keyword' && (
                <>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Keyword</label>
                    <input
                      type="text"
                      value={trigger.keyword || ''}
                      onChange={(e) => setTrigger({ ...trigger, keyword: e.target.value })}
                      className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="help"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Match Mode</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={trigger.match_mode === 'contains'}
                          onChange={() => setTrigger({ ...trigger, match_mode: 'contains' })}
                          className="text-purple-600"
                        />
                        <span>Contains</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={trigger.match_mode === 'exact'}
                          onChange={() => setTrigger({ ...trigger, match_mode: 'exact' })}
                          className="text-purple-600"
                        />
                        <span>Exact</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-blue-400" />
                  <h4 className="font-semibold text-blue-300">Actions</h4>
                </div>
                <button
                  onClick={addAction}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Action
                </button>
              </div>

              {actions.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">No actions yet. Add one to get started.</div>
              ) : (
                <div className="space-y-3">
                  {actions.map((action, index) => (
                    <div key={index} className="bg-black/40 border border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-400">Action {index + 1}</span>
                        <button
                          onClick={() => removeAction(index)}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <select
                          value={action.type}
                          onChange={(e) => updateAction(index, { type: e.target.value as any })}
                          className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="send_message">Send Message</option>
                          <option value="add_tag">Add Tag</option>
                          <option value="grant_optin">Grant Opt-In</option>
                        </select>

                        {action.type === 'send_message' && (
                          <textarea
                            value={action.text || ''}
                            onChange={(e) => updateAction(index, { ...action, text: e.target.value })}
                            className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-20"
                            placeholder="Your message..."
                          />
                        )}

                        {action.type === 'add_tag' && (
                          <input
                            type="text"
                            value={action.tag_name || ''}
                            onChange={(e) => updateAction(index, { ...action, tag_name: e.target.value })}
                            className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Tag name"
                          />
                        )}

                        {action.type === 'grant_optin' && (
                          <div className="space-y-2">
                            <select
                              value={action.optin_type || 'otn'}
                              onChange={(e) => updateAction(index, { ...action, optin_type: e.target.value as any })}
                              className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="otn">One-Time Notification</option>
                              <option value="recurring">Recurring</option>
                              <option value="24h">24-Hour Window</option>
                            </select>
                            <input
                              type="text"
                              value={action.optin_topic || ''}
                              onChange={(e) => updateAction(index, { ...action, optin_topic: e.target.value })}
                              className="w-full px-3 py-2 bg-black border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Topic (optional)"
                            />
                          </div>
                        )}
                      </div>

                      {index < actions.length - 1 && (
                        <div className="flex justify-center mt-2">
                          <ArrowDown className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Test Runner */}
            {selectedAutomation && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <h4 className="font-semibold mb-3">Test Automation</h4>
                <div className="flex gap-2">
                  <select
                    value={testConversationId}
                    onChange={(e) => setTestConversationId(e.target.value)}
                    className="flex-1 px-3 py-2 bg-black border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select conversation...</option>
                    {conversations.map((conv) => (
                      <option key={conv.id} value={conv.id}>
                        {conv.fan_name || conv.fan_username || `${conv.platform} conversation`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={testAutomation}
                    disabled={testing || !testConversationId}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {testing ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Test
                      </>
                    )}
                  </button>
                </div>

                {testResult && (
                  <div className="mt-3 p-3 bg-black/50 rounded text-xs">
                    <pre className="text-gray-300 whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-3">
              <button
                onClick={saveAutomation}
                disabled={saving}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Save className="w-4 h-4 animate-pulse" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Automation
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Sparkles className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p>Select an automation or create a new one to get started</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Delete Automation?</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to delete "{selectedAutomation?.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={deleteAutomation}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
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
