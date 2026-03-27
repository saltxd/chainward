export const FRAMEWORK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  virtuals: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Virtuals' },
  olas: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Olas' },
  elizaos: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'ElizaOS' },
  agentkit: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'AgentKit' },
  custom: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Custom' },
} as const;

export const DIRECTION_STYLES = {
  IN: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'IN' },
  OUT: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'OUT' },
} as const;
