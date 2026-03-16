/** A curated observatory agent with labeled wallet address */
export interface ObservatoryAgent {
  address: string;
  name: string;
  framework: string;
  project: string;
  source: string;
  virtualsId?: number;
  agentType?: string;
}

/** A known DeFi protocol contract on a specific chain */
export interface KnownContract {
  chain: string;
  contractAddress: string;
  protocolName: string;
  contractLabel: string;
}

/** Spam token filter data */
export interface SpamTokenData {
  /** Known spam/scam token contract addresses (lowercased) */
  spamTokens: string[];
  /** Legitimate token addresses that should never be flagged (lowercased) */
  knownTokens: string[];
}

/** All intelligence data combined */
export interface IntelligenceData {
  observatoryAgents: ObservatoryAgent[];
  protocolRegistry: KnownContract[];
  spamTokens: SpamTokenData;
}
