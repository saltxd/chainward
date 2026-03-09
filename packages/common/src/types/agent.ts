import type { SupportedChain } from './chain.js';

export const AGENT_FRAMEWORKS = [
  'elizaos',
  'olas',
  'virtuals',
  'agentkit',
  'crewai',
  'langchain',
  'custom',
] as const;
export type AgentFramework = (typeof AGENT_FRAMEWORKS)[number];

export const REGISTRY_SOURCES = [
  'erc8004',
  'olas',
  'virtuals',
  'manual',
  'heuristic',
] as const;
export type RegistrySource = (typeof REGISTRY_SOURCES)[number];

export interface Agent {
  id: number;
  chain: SupportedChain;
  walletAddress: string;
  agentName: string | null;
  agentFramework: AgentFramework | null;
  registrySource: RegistrySource;
  registryId: string | null;
  isSafe: boolean;
  safeModules: string[];
  confidence: number;
  tags: string[];
  userId: string;
  firstSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentInput {
  chain: SupportedChain;
  walletAddress: string;
  agentName?: string;
  agentFramework?: AgentFramework;
  tags?: string[];
}

export interface UpdateAgentInput {
  agentName?: string;
  agentFramework?: AgentFramework;
  tags?: string[];
  isPublic?: boolean;
}
