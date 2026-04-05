// src/types.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Type Definitions
// Verification-First Intelligence Platform
// ══════════════════════════════════════════════════════════════════

export enum AIModel {
  GPT4   = 'OpenAI GPT-4',
  CLAUDE = 'Anthropic Claude',
  GEMINI = 'Google Gemini',
  NANO_BANANA_PRO = 'Nano Banana Pro',
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface User {
  id: string;
  email: string;
  createdAt: number;
  isAdmin?: boolean;
  tier: UserTier;
  personification?: string;
  responseStyle?: string;
  language?: string;
  theme?: 'light' | 'dark';
}

export interface MessageImage {
  inlineData: { data: string };
  mimeType: string;
}

export interface AttachedDocument {
  title:     string;
  content:   string;
  type:      string;
  /** 'text' = plain UTF-8 string | 'base64' = binary (PDF etc). Default: 'text' */
  encoding?: 'text' | 'base64';
  /** Canonical MIME type — used for Gemini inlineData (e.g. 'application/pdf') */
  mimeType?: string;
  /** File size in KB for display in attachment chips */
  sizeKB?:   number;
}

export interface GroundingChunk {
  web?:  { uri: string; title: string };
  maps?: { uri: string; title: string };
}

export type QueryIntent = 'reasoning' | 'coding' | 'math' | 'live' | 'research' | 'general' | 'image_generation';

export interface RoutingContext {
  reason: string;
  confidence: number;
  complexity: number;
  engine: string;
  explanation: string;
  intent?: QueryIntent;
  isLiveEnabled?: boolean;
  // ── Agent fields (added for multi-agent pipeline) ─────────────
  // Populated by agentOrchestrator.dispatch() — optional so existing
  // messages without these fields never break.
  agentType?:     'reasoning' | 'coding' | 'rag' | 'general';
  agentProvider?: 'claude' | 'openai' | 'gemini-search' | 'gemini-fallback' | 'perplexity';
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  model?: AIModel;
  timestamp: number;
  image?: MessageImage;
  images?: MessageImage[];
  documents?: AttachedDocument[];
  conversationId?: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  groundingChunks?: GroundingChunk[];
  routingContext?: RoutingContext;
  suggestions?: string[];
  feedback?: 'good' | 'bad' | null;
  generatedImageUrl?: string;
  // Codebase reference — set on user messages when a project is indexed.
  // Displayed as a small reference card below the user bubble.
  codebaseRef?: {
    projectName: string;
    totalFiles:  number;
  };
  // SEDREX: Confidence signal attached to assistant messages
  confidence?: {
    level: 'high' | 'moderate' | 'low' | 'live';
    label: string;
    reason: string;
  };
  // Thinking content shown in collapsible reasoning block
  thinkingContent?: string;
  thinkingState?: {
    phase: 'idle' | 'planning' | 'thinking' | 'answering' | 'done';
    steps: Array<{
      id: string;
      label: string;
      icon: string;
      detail: string;
      status: 'pending' | 'active' | 'done';
    }>;
    activeStepIndex: number;
  };
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastModified: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  preferredModel?: AIModel | 'auto';
}

export type UserTier = 'free' | 'pro' | 'enterprise';

export interface DailyUsage {
  date: string;
  count: number;
  tokens: number;
}

export interface BillingHistoryItem {
  id: string;
  date: string;
  amount: number;
  status: string;
}

export interface UserStats {
  userId: string;
  tier: UserTier;
  totalMessagesSent: number;
  monthlyMessagesSent: number;
  monthlyMessagesLimit: number;
  tokensEstimated: number;
  modelUsage: Record<string, number>;
  dailyHistory: DailyUsage[];
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  billingHistory?: BillingHistoryItem[];
}

export interface SedrexRoute {
  model: AIModel;
  reason: string;
  explanation: string;
  confidence: number;
  complexity: number;
  intent: QueryIntent;
}

// ── SESSION 8: SedrexResponse — added isDiff flag ─────────────────
// isDiff: true when the AI returned a surgical diff block (```diff)
// rather than a full file. Used by App.tsx to skip artifact extraction
// and by ChatArea.tsx to render the diff inline via hljs diff highlighting.
export interface SedrexResponse {
  content:          string;
  model:            AIModel;
  tokens:           number;
  inputTokens:      number;
  outputTokens:     number;
  confidence: {
    level:  'high' | 'moderate' | 'low' | 'live';
    label:  string;
    reason: string;
  };
  generatedImageUrl?: string;
  groundingChunks?: GroundingChunk[];
  // true when response is a surgical diff, not a full file rewrite.
  // Prevents artifact extraction and signals diff rendering in ChatArea.
  isDiff?: boolean;
  // Thinking content captured from Gemini's extended thinking mode
  thinkingContent?: string;
  routingContext: SedrexRoute & {
    engine:          string;
    thinking:        boolean;
    agentType?:      string;
    agentProvider?:  string;
  };
}

export interface AnalyticsEvent {
  eventName: string;
  userId: string;
  params: Record<string, any>;
  timestamp: number;
}

export interface ErrorLog {
  id: string;
  timestamp: number;
  message: string;
  userId?: string;
  model?: AIModel;
  stack?: string;
  critical: boolean;
}

export interface AdminStats {
  totalUsers: number;
  messagesToday: number;
  messagesThisMonth: number;
  totalRevenue: number;
  avgResponseTime: number;
  errorRate: number;
  modelDistribution: Record<AIModel, number>;
  growthHistory: { date: string; users: number; revenue: number }[];
  errorLogs: ErrorLog[];
}