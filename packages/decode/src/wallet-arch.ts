import type { WalletType } from './types.js';

const VIRTUALS_FACTORY_PROXY_PREFIX = '0x363d3d373d3d363d7f';

export function isVirtualsFactoryProxy(code: string): boolean {
  if (!code || code === '0x') return false;
  return code.toLowerCase().startsWith(VIRTUALS_FACTORY_PROXY_PREFIX);
}

export interface ClassifyInput {
  code: string;
  nonce: number;
}

export interface ClassifyResult {
  type: WalletType;
  nonce: number;
  code_size: number;
  is_virtuals_factory: boolean;
}

export function classifyWallet(input: ClassifyInput): ClassifyResult {
  const code = input.code ?? '0x';
  const codeSize = code === '0x' ? 0 : (code.length - 2) / 2;
  const isVirtuals = isVirtualsFactoryProxy(code);

  let type: WalletType;
  if (codeSize === 0) {
    type = 'eoa';
  } else if (isVirtuals) {
    type = 'erc1967_proxy';
  } else {
    type = 'contract';
  }

  return {
    type,
    nonce: input.nonce,
    code_size: codeSize,
    is_virtuals_factory: isVirtuals,
  };
}
