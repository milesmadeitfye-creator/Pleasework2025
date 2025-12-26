/**
 * Ghoste AI Chat Component
 * Uses ai_conversations and ai_messages tables for persistence
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Rocket,
  Link2,
  CalendarClock,
  Sparkles,
  Megaphone,
  Mail,
  MessageSquare,
  Plus,
  AlertCircle,
  Bug,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { ghosteChat } from '../../lib/ghosteAI/edgeClient';
import type { GhosteConversation, GhosteMessage } from '../../types/conversation';
import { GhosteMediaUploader } from '../manager/GhosteMediaUploader';
import { chargeCredits, InsufficientCreditsError, getWallet } from '../../lib/credits';
import InsufficientCreditsModal from '../ui/InsufficientCreditsModal';
import { AIDebugPanel } from './AIDebugPanel';
import { BUILD_STAMP } from '../../lib/buildStamp';

const CONVERSATION_STORAGE_KEY = 'ghoste_ai_conversation_id';

function dedupeMessagesById(list: GhosteMessage[]): GhosteMessage[] {
  const map = new Map<string, GhosteMessage>();
  for (const m of list) {
    const key = m.id ?? `${m.role}:${m.created_at}:${m.content?.slice(0, 50)}`;
    if (!map.has(key)) {
      map.set(key, m);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

type QuickPrompt = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
};

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'meta-ads',
    title: 'Launch a Meta ad',
    description: 'Set up a Meta campaign for my latest release.',
    prompt:
      'Help me launch a Meta ad campaign for my latest single. Ask me for budget, goal, and target audience, then set it up inside Ghoste.',
    icon: Rocket,
  },
  {
    id: 'smart-link',
    title: 'Create a smart link',
    description: 'Build a streaming smart link for my track.',
    prompt:
      'Create a smart link for my latest release and ask me for the Spotify link and release date.',
    icon: Link2,
  },
  {
    id: 'schedule',
    title: 'Plan my schedule',
    description: 'Turn my ideas into tasks and reminders.',
    prompt:
      'Help me plan my music tasks for the week. Ask me what I need to do and create calendar tasks for me in Ghoste.',
    icon: CalendarClock,
  },
  {
    id: 'content',
    title: 'Write ad copy & captions',
    description: 'Get hooks, captions, and ad copy.',
    prompt:
      'Write social media hooks and ad copy for my upcoming release. Ask me for the mood, genre, and target platform.',
    icon: Sparkles,
  },
  {
    id: 'email-fans',
    title: 'Email my fans',
    description: 'Send a Mailchimp email blast.',
    prompt:
      'Help me send an email blast to my Mailchimp audience. Ask me which list or segment to use, the subject line, and the main message, then send it using my connected Mailchimp account.',
    icon: Mail,
  },
  {
    id: 'text-fans',
    title: 'Text my fans',
    description: 'Send a text blast.',
    prompt:
      'Help me send a text blast to my fans. Ask me which audience or segment to target and what the text should say, then use my connected accounts to send it.',
    icon: MessageSquare,
  },
  {
    id: 'release-plan',
    title: 'Plan my release',
    description: 'Get a 4-week rollout plan.',
    prompt:
      'Create a 4-week release plan for my next single, including content ideas, ads, and fan communication.',
    icon: Megaphone,
  },
];

export const GhosteAIChat: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<GhosteConversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<GhosteConversation | null>(null);
  const [messages, setMessages] = useState<GhosteMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    url: string;
    fileName: string;
    type: string;
    size?: number;
  }>>([]);
  const [insufficientModal, setInsufficientModal] = useState<{
    open: boolean;
    cost: number;
    remaining: number;
    featureKey: string;
    plan: string;
  }>({ open: false, cost: 0, remaining: 0, featureKey: '', plan: '' });
  const [creditsWarning, setCreditsWarning] = useState<string | null>(null);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const didLoadRef = useRef(false);
  const loadedConversationIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const getStoredConversationId = useCallback((): string | null => {
    const urlConvoId = searchParams.get('c');
    if (urlConvoId) return urlConvoId;

    try {
      return localStorage.getItem(CONVERSATION_STORAGE_KEY);
    } catch {
      return null;
    }
  }, [searchParams]);

  const setStoredConversationId = useCallback((id: string | null) => {
    try {
      if (id) {
        localStorage.setItem(CONVERSATION_STORAGE_KEY, id);
        setSearchParams({ c: id }, { replace: true });
      } else {
        localStorage.removeItem(CONVERSATION_STORAGE_KEY);
        setSearchParams({}, { replace: true });
      }
    } catch (err) {
      console.warn('[GhosteAIChat] Failed to store conversation ID:', err);
    }
  }, [setSearchParams]);

  const loadMessagesForConversation = useCallback(async (conversationId: string): Promise<GhosteMessage[]> => {
    const { data: msgs, error: msgsError } = await supabase
      .from('ai_messages')
      .select('id, conversation_id, user_id, role, content, meta, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (msgsError) {
      console.error('[GhosteAIChat] Failed to load messages:', msgsError);
      return [];
    }

    return (msgs || []).map(m => ({
      ...m,
      role: m.role as GhosteMessage['role'],
    }));
  }, []);

  useEffect(() => {
    if (!user) {
      setLoadingInitial(false);
      return;
    }

    if (didLoadRef.current) {
      console.log('[GhosteAIChat] Skipping duplicate mount load');
      return;
    }
    didLoadRef.current = true;

    let isMounted = true;

    (async () => {
      setLoadingInitial(true);

      try {
        console.log('[GhosteAIChat] Loading conversations for user:', user.id);

        const { data: convos, error: convosError } = await supabase
          .from('ai_conversations')
          .select('id, user_id, title, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (!isMounted) return;

        if (convosError) {
          console.error('[GhosteAIChat] Supabase error loading conversations:', {
            message: convosError.message,
            details: convosError.details,
            hint: convosError.hint,
            code: convosError.code,
          });
          throw new Error(`Database error: ${convosError.message}`);
        }

        console.log('[GhosteAIChat] Loaded', convos?.length || 0, 'conversations');

        const conversationsWithoutMessages = (convos || []).map(c => ({
          ...c,
          messages: [] as GhosteMessage[],
        }));

        setConversations(conversationsWithoutMessages);

        const storedConvoId = getStoredConversationId();
        let targetConvo: GhosteConversation | null = null;

        if (storedConvoId) {
          targetConvo = conversationsWithoutMessages.find(c => c.id === storedConvoId) || null;

          if (!targetConvo && storedConvoId) {
            const { data: fetchedConvo } = await supabase
              .from('ai_conversations')
              .select('id, user_id, title, created_at, updated_at')
              .eq('id', storedConvoId)
              .eq('user_id', user.id)
              .maybeSingle();

            if (fetchedConvo) {
              targetConvo = { ...fetchedConvo, messages: [] };
            }
          }
        }

        if (!targetConvo && conversationsWithoutMessages.length > 0) {
          targetConvo = conversationsWithoutMessages[0];
        }

        if (targetConvo) {
          const rawMsgs = await loadMessagesForConversation(targetConvo.id);
          const msgs = dedupeMessagesById(rawMsgs);
          targetConvo.messages = msgs;
          setActiveConversation(targetConvo);
          setMessages(msgs);
          loadedConversationIdRef.current = targetConvo.id;
          setStoredConversationId(targetConvo.id);
          console.log('[GhosteAIChat] Set active conversation:', targetConvo.id, 'with', msgs.length, 'messages');
        } else {
          setMessages([]);
          console.log('[GhosteAIChat] No conversations found, user can start a new one');
        }
      } catch (err: any) {
        console.error('[GhosteAIChat] Failed to load conversations:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load conversations. Check browser console for details.');
        }
      } finally {
        if (isMounted) {
          setLoadingInitial(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user, getStoredConversationId, setStoredConversationId, loadMessagesForConversation]);

  const createNewConversation = async () => {
    if (!user) {
      console.error('[GhosteAIChat] Cannot create conversation: no user');
      setError('You must be logged in to start a conversation');
      return null;
    }

    try {
      setError(null);
      console.log('[GhosteAIChat] Creating new conversation for user:', user.id);

      const { data: newConvo, error: createError } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          title: 'New Chat',
        })
        .select('id, user_id, title, created_at, updated_at')
        .single();

      if (createError) {
        console.error('[GhosteAIChat] Supabase error creating conversation:', {
          message: createError.message,
          details: createError.details,
          hint: createError.hint,
          code: createError.code,
        });
        throw new Error(`Database error: ${createError.message}`);
      }

      if (!newConvo) {
        throw new Error('Conversation created but no data returned');
      }

      console.log('[GhosteAIChat] Created conversation:', newConvo.id);

      const convoWithMessages: GhosteConversation = {
        ...newConvo,
        messages: [],
      };

      setConversations((prev) => [convoWithMessages, ...prev]);
      setActiveConversation(convoWithMessages);
      setMessages([]);
      setInput('');
      setStoredConversationId(newConvo.id);

      return convoWithMessages;
    } catch (err: any) {
      console.error('[GhosteAIChat] Failed to create conversation:', err);
      setError(err.message || 'Failed to create conversation. Check browser console for details.');
      return null;
    }
  };

  const switchConversation = async (convo: GhosteConversation) => {
    if (activeConversation?.id === convo.id) return;

    console.log('[GhosteAIChat] Switching to conversation:', convo.id);

    const rawMsgs = convo.messages?.length ? convo.messages : await loadMessagesForConversation(convo.id);
    const msgs = dedupeMessagesById(rawMsgs);
    const updatedConvo = { ...convo, messages: msgs };

    setActiveConversation(updatedConvo);
    setMessages(msgs);
    loadedConversationIdRef.current = convo.id;
    setStoredConversationId(convo.id);
    setError(null);
  };

  const sendMessage = async (promptOverride?: string) => {
    const text = promptOverride ?? input.trim();
    const hasAttachments = pendingAttachments.length > 0;

    if (!text && !hasAttachments) {
      console.log('[GhosteAIChat] sendMessage: empty text and no attachments, ignoring');
      return;
    }

    if (!user) {
      console.error('[GhosteAIChat] sendMessage: no user');
      setError('You must be logged in to send messages');
      return;
    }

    // Capture current conversation and messages at the start
    let currentConversation = activeConversation;

    // Create conversation if none exists
    if (!currentConversation) {
      console.log('[GhosteAIChat] No active conversation, creating new one');
      const newConvo = await createNewConversation();

      if (!newConvo) {
        console.error('[GhosteAIChat] Failed to create conversation, cannot send message');
        setError('Could not create conversation. Please check your connection and try again.');
        return;
      }

      currentConversation = newConvo;
      console.log('[GhosteAIChat] Using newly created conversation:', currentConversation.id);
    }

    console.log('[GhosteAIChat] Sending message to conversation:', currentConversation.id);

    setIsSending(true);
    setInput('');
    const attachments = [...pendingAttachments];
    setPendingAttachments([]);
    setError(null);

    const tempUserMessageId = `temp-user-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const userMessage: GhosteMessage = {
      id: tempUserMessageId,
      conversation_id: currentConversation.id,
      user_id: user.id,
      role: 'user',
      content: text || '',
      created_at: now,
      meta: { tempId: tempUserMessageId },
      attachments: attachments as any,
    };

    setMessages((prev) => dedupeMessagesById([...prev, userMessage]));

    try {
      const { data: savedUserMsg, error: userMsgError } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: currentConversation.id,
          user_id: user.id,
          role: 'user',
          content: text || '',
          meta: attachments.length > 0 ? { attachments } : {},
        })
        .select('id')
        .single();

      if (userMsgError) {
        console.error('[GhosteAIChat] Failed to save user message:', userMsgError);
      } else if (savedUserMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempUserMessageId ? { ...m, id: savedUserMsg.id, meta: {} } : m))
        );
        userMessage.id = savedUserMsg.id;
        console.log('[GhosteAIChat] Saved user message:', savedUserMsg.id);
      }

      // SAFE BILLING GUARD: Attempt to charge credits
      let creditsSafeMode = false;
      try {
        await chargeCredits('ai_manager_prompt', {
          conversation_id: currentConversation.id,
          message_length: text.length,
          has_attachments: hasAttachments,
        });
        setCreditsWarning(null);
      } catch (creditErr: any) {
        // Handle insufficient credits - BLOCK sending
        if (creditErr instanceof InsufficientCreditsError) {
          const wallet = await getWallet();
          setInsufficientModal({
            open: true,
            cost: creditErr.cost,
            remaining: creditErr.remaining,
            featureKey: creditErr.feature_key,
            plan: wallet?.plan || 'operator',
          });
          setIsSending(false);
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        // Non-insufficient error (404/500/network) - SAFE MODE
        console.warn('[GhosteAIChat] Credits system unavailable, continuing in safe mode:', creditErr);
        creditsSafeMode = true;
        setCreditsWarning('Credits system temporarily unavailable — continuing without charge.');

        // Log to localStorage for /debug
        try {
          const crashLog = {
            time: new Date().toISOString(),
            kind: 'credits_warning',
            message: 'spend_credits failed; continuing in safe mode',
            details: {
              code: creditErr.code,
              status: creditErr.status,
              error: String(creditErr),
            },
            path: location.pathname + location.search + location.hash,
            supabaseUrl: (window as any).__GHOSTE_CONFIG__?.supabaseUrl,
          };

          const existing = localStorage.getItem('__ghoste_last_crash_v1');
          const crashes = existing ? JSON.parse(existing) : [];
          crashes.push(crashLog);
          localStorage.setItem('__ghoste_last_crash_v1', JSON.stringify(crashes.slice(-10)));
        } catch (storageErr) {
          console.error('[GhosteAIChat] Failed to log to localStorage:', storageErr);
        }
      }

      // Build conversation history for AI
      const conversationMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      console.log('[GhosteAIChat] Calling Ghoste AI with', conversationMessages.length, 'messages');

      // Call Ghoste AI - backend will handle system prompt and setup status via RPC
      const aiResponse = await ghosteChat({
        userId: user.id,
        conversationId: currentConversation.id,
        clientMessageId: tempUserMessageId,
        messages: conversationMessages,
      });

      const aiUnavailable = (aiResponse as any).ai_unavailable === true;
      const assistantContent = aiResponse.message || 'Sorry, I could not respond.';

      if (aiUnavailable) {
        console.warn('[GhosteAIChat] AI service temporarily unavailable, showing fallback message');
      }

      const assistantMessageNow = new Date().toISOString();
      const tempAssistantMessageId = `temp-assistant-${crypto.randomUUID()}`;
      const assistantMessage: GhosteMessage = {
        id: tempAssistantMessageId,
        conversation_id: currentConversation.id,
        user_id: user.id,
        role: 'assistant',
        content: assistantContent,
        created_at: assistantMessageNow,
        meta: { tempId: tempAssistantMessageId },
      };

      console.log('[GhosteAIChat] Got AI response');

      setMessages((prev) => dedupeMessagesById([...prev, assistantMessage]));

      const { data: savedAssistantMsg, error: assistantMsgError } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: currentConversation.id,
          user_id: user.id,
          role: 'assistant',
          content: assistantContent,
          meta: { ai_unavailable: aiUnavailable },
        })
        .select('id')
        .single();

      if (assistantMsgError) {
        console.error('[GhosteAIChat] Failed to save assistant message:', assistantMsgError);
      } else if (savedAssistantMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAssistantMessageId ? { ...m, id: savedAssistantMsg.id, meta: {} } : m))
        );
        assistantMessage.id = savedAssistantMsg.id;
        console.log('[GhosteAIChat] Saved assistant message:', savedAssistantMsg.id);
      }

      const isFirstMessage = messages.length === 0;
      if (isFirstMessage && text) {
        const newTitle = text.slice(0, 60) + (text.length > 60 ? '...' : '');
        await supabase
          .from('ai_conversations')
          .update({ title: newTitle, updated_at: assistantMessageNow })
          .eq('id', currentConversation.id);
        currentConversation.title = newTitle;
      } else {
        await supabase
          .from('ai_conversations')
          .update({ updated_at: assistantMessageNow })
          .eq('id', currentConversation.id);
      }

      const completeMessages = [...messages, userMessage, assistantMessage];

      const updatedConversation = {
        ...currentConversation,
        messages: completeMessages,
        updated_at: assistantMessageNow,
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversation!.id ? updatedConversation : c
        )
      );

      setActiveConversation(updatedConversation);
      setStoredConversationId(currentConversation.id);

      console.log('[GhosteAIChat] Message sent successfully');
    } catch (err: any) {
      console.error('[GhosteAIChat] sendMessage error:', {
        error: err,
        message: err.message,
        name: err.name,
        stack: err.stack,
      });

      // Provide user-friendly error message
      let userMessage = 'Ghoste AI is temporarily unavailable. Your message has been saved.';
      let shouldShowFallback = false;

      if (err.message?.includes('Failed to send a request') || err.message?.includes('Failed to contact')) {
        userMessage = 'Cannot connect to Ghoste AI. Please check your internet connection and try again.';
      } else if (err.message?.includes('OpenAI') || err.message?.includes('API')) {
        userMessage = 'Ghoste AI service is temporarily down. Your message has been saved. Please try again shortly.';
        shouldShowFallback = true;
      } else if (err.message?.includes('Database')) {
        userMessage = 'Database connection issue. Your message may not have been saved. Please try again.';
      } else if (err.message?.includes('billing') || err.message?.includes('quota')) {
        userMessage = 'Ghoste AI is temporarily unavailable due to high usage. Your message has been saved. Please try again in a few minutes.';
        shouldShowFallback = true;
      } else if (err.message) {
        userMessage = err.message;
      }

      // If we should show a fallback, add it as an assistant message
      if (shouldShowFallback) {
        const fallbackMessage: GhosteMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: userMessage,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, fallbackMessage]);
      } else {
        setError(userMessage);
      }

      console.error('[GhosteAIChat] For debugging, check browser console for full error details');
      // DO NOT clear messages - keep them visible
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    // Note: Supabase functions don't support abort controllers in the same way
    // but we can still update the UI state
    setIsSending(false);
    setError('Request cancelled');
  };

  if (loadingInitial) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-50 rounded-3xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-sm text-slate-400">Loading Ghoste AI...</p>
        </div>
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  const handleSuggestionClick = (prompt: string) => {
    void sendMessage(prompt);
  };

  return (
    <div className="flex min-h-[75vh] bg-[#030712] rounded-3xl overflow-hidden border border-white/5">
      {/* LEFT: Conversations list */}
      <aside className="hidden md:flex w-72 flex-col border-r border-white/5 bg-gradient-to-b from-white/5 to-transparent">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-blue-400">
              Ghoste AI
            </h2>
            <p className="text-xs text-white/60">Studio Copilot</p>
          </div>
          <button
            onClick={createNewConversation}
            className="rounded-full p-2 text-xs font-medium bg-blue-500 hover:bg-blue-400 text-white transition-colors"
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="px-4 py-6 text-xs text-white/60">
              No chats yet. Start one on the right.
            </div>
          )}
          {conversations.map((c) => {
            const lastMsg = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
            const preview = lastMsg
              ? lastMsg.content.substring(0, 50) + '...'
              : 'No messages yet';

            return (
              <button
                key={c.id}
                onClick={() => switchConversation(c)}
                className={`w-full text-left px-4 py-3 text-xs border-b border-white/5 hover:bg-white/5 transition-colors ${
                  activeConversation?.id === c.id
                    ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-white">
                    {c.title || 'Ghoste AI chat'}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-white/50 truncate">
                  {preview}
                </div>
                <div className="mt-1 text-[10px] text-white/40">
                  {new Date(c.updated_at).toLocaleDateString()}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* RIGHT: Chat area - centered with max width */}
      <main className="flex-1 flex justify-center overflow-hidden">
        <div className="relative flex flex-col w-full max-w-5xl px-6 py-6">
          {/* Subtle background gradient */}
          <div className="pointer-events-none absolute inset-4 rounded-3xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-black/60 blur-[1px]" />

          {/* Foreground content card */}
          <div className="relative flex flex-col h-full rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <p className="text-sm font-medium text-white">Ghoste AI</p>
                <p className="text-xs text-white/60">
                  Your studio copilot &amp; music manager
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDebugPanelOpen(true)}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                  title="Debug AI Setup"
                >
                  <Bug className="w-3 h-3" />
                  Debug
                </button>
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </div>
                <div className="text-[10px] text-white/20 font-mono" title={BUILD_STAMP}>
                  Build: {BUILD_STAMP.slice(-12)}
                </div>
              </div>
            </header>

            {/* Credits Warning Banner */}
            {creditsWarning && (
              <div className="mx-6 mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-amber-300">{creditsWarning}</p>
                  <div className="mt-1 flex gap-2">
                    <a
                      href="/debug"
                      className="text-[10px] text-amber-400 hover:text-amber-300 underline"
                    >
                      View Debug Console
                    </a>
                  </div>
                </div>
                <button
                  onClick={() => setCreditsWarning(null)}
                  className="text-amber-400 hover:text-amber-300"
                >
                  ×
                </button>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 px-6 py-4 overflow-y-auto custom-scroll min-h-[55vh]">
              <div className="flex flex-col min-h-full justify-end">
                {hasMessages ? (
                  <div className="flex flex-col gap-3 max-w-3xl mx-auto w-full">
                    {messages
                      .filter((m) => m.role !== 'tool')
                      .map((m) => {
                        const isUser = m.role === 'user';
                        return (
                          <div
                            key={m.id}
                            className={`flex w-full ${
                              isUser ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                                isUser
                                  ? 'bg-blue-500 text-white rounded-br-sm'
                                  : 'bg-white/10 text-white rounded-bl-sm'
                              }`}
                            >
                              {isUser ? (
                                <div className="text-[15px] leading-6 whitespace-pre-wrap break-words">
                                  {m.content}
                                </div>
                              ) : (
                                <div className="prose prose-invert prose-sm max-w-full break-words">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      a: ({ node, href, children, ...props }) => {
                                        const text = String(children);
                                        const display =
                                          text.length > 60
                                            ? text.substring(0, 57) + '...'
                                            : text;

                                        return (
                                          <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 underline break-words"
                                            {...props}
                                          >
                                            {display}
                                          </a>
                                        );
                                      },
                                      p: ({ node, ...props }) => (
                                        <p className="mb-2 last:mb-0" {...props} />
                                      ),
                                      ul: ({ node, ...props }) => (
                                        <ul
                                          className="list-disc list-inside mb-2"
                                          {...props}
                                        />
                                      ),
                                      ol: ({ node, ...props }) => (
                                        <ol
                                          className="list-decimal list-inside mb-2"
                                          {...props}
                                        />
                                      ),
                                      code: ({ node, inline, ...props }) =>
                                        inline ? (
                                          <code
                                            className="bg-white/10 px-1 rounded text-blue-300"
                                            {...props}
                                          />
                                        ) : (
                                          <code
                                            className="block bg-white/10 p-2 rounded my-2 text-sm"
                                            {...props}
                                          />
                                        ),
                                    }}
                                  >
                                    {m.content}
                                  </ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                    {isSending && (
                      <div className="flex items-center gap-2 text-xs text-white/60">
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" />
                        Ghoste AI is thinking…
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="max-w-md text-center space-y-6 px-4">
                      <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 text-xl font-bold">
                        G
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">
                          Meet Ghoste AI
                        </h2>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Ask anything about ads, releases, smart links, Mailchimp, or your fans.
                          I'll handle the strategy while you focus on the music.
                        </p>
                      </div>

                      {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-red-300">{error}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap justify-center gap-2">
                        {[
                          'Plan a Meta ad campaign',
                          'Map out my next release',
                          'Write an email to my fans',
                          'Help me use Ghoste Studio',
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleSuggestionClick(prompt)}
                            disabled={isSending}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10 hover:border-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input area */}
            <footer className="border-t border-white/5 px-6 py-4">
              <div className="max-w-3xl mx-auto">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                  className="flex items-end gap-3"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    className="flex-1 resize-y rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[15px] leading-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent min-h-[64px] max-h-[160px]"
                    placeholder="Ask Ghoste AI anything about your release, ads, or fans…"
                    disabled={isSending}
                  />
                  <button
                    type="submit"
                    disabled={isSending || !input.trim()}
                    className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </form>

                {/* Upload media for Ghoste AI */}
                <GhosteMediaUploader
                  bucket="uploads"
                  onUploaded={async (info) => {
                    // Register this media with the backend for AI tools
                    try {
                      const token = await supabase.auth.getSession().then(s => s.data.session?.access_token);
                      if (!token) {
                        console.error('[GhosteAIChat] No auth token for media registration');
                        return;
                      }

                      // Store in user_uploads table
                      await supabase
                        .from('user_uploads')
                        .insert({
                          user_id: user.id,
                          kind: info.type.startsWith('video/') ? 'video' : info.type.startsWith('audio/') ? 'audio' : 'image',
                          filename: info.fileName,
                          mime_type: info.type,
                          public_url: info.url,
                          storage_bucket: 'uploads',
                          storage_path: info.path,
                          size_bytes: info.size || 0,
                        });

                      await fetch('/.netlify/functions/ghoste-media-register', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          url: info.url,
                          path: info.path,
                          type: info.type,
                          fileName: info.fileName,
                          size: info.size,
                        }),
                      });

                      console.log('[GhosteAIChat] Media registered for Ghoste AI');
                    } catch (err) {
                      console.error('[GhosteAIChat] Failed to register media:', err);
                    }

                    // Add to pending attachments (no auto-message)
                    setPendingAttachments((prev) => [...prev, {
                      url: info.url,
                      fileName: info.fileName,
                      type: info.type,
                      size: info.size,
                    }]);
                  }}
                />
              </div>
            </footer>
          </div>
        </div>
      </main>

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={insufficientModal.open}
        onClose={() => setInsufficientModal({ ...insufficientModal, open: false })}
        cost={insufficientModal.cost}
        remaining={insufficientModal.remaining}
        featureKey={insufficientModal.featureKey}
        plan={insufficientModal.plan}
      />

      {/* AI Debug Panel */}
      <AIDebugPanel
        isOpen={debugPanelOpen}
        onClose={() => setDebugPanelOpen(false)}
      />
    </div>
  );
};
