#!/usr/bin/env python3
"""Apply patches to CDP SDK (cdp-sdk 1.39.1) and coinbase-agentkit (0.7.4).

The CDP Python SDK has 6 bugs that prevent swaps from working on Base mainnet.
This script patches the installed site-packages in-place after pip install.

Run this after every `pip install` or venv recreation:
    python apply_patches.py

See CDP_SDK_PATCHES.md for full details on each bug.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def find_package_dir(package_name: str) -> Path:
    """Locate the installed package directory using importlib."""
    spec = importlib.util.find_spec(package_name)
    if spec is None or spec.origin is None:
        print(f"FATAL: Package '{package_name}' not found in site-packages.")
        sys.exit(1)
    # spec.origin points to __init__.py; parent is the package dir
    return Path(spec.origin).parent


def apply_patch(file_path: Path, old: str, new: str, description: str) -> None:
    """Replace `old` with `new` in the given file.

    Exits non-zero if the target string is not found, which means the SDK
    version changed and the patches need updating.
    """
    if not file_path.exists():
        print(f"FATAL: File not found: {file_path}")
        sys.exit(1)

    content = file_path.read_text()

    if new in content:
        print(f"  SKIP (already applied): {description}")
        return

    if old not in content:
        print(f"FATAL: Target string not found for patch: {description}")
        print(f"  File: {file_path}")
        print(f"  Expected to find: {old!r}")
        print()
        print("The SDK version may have changed. Review and update patches.")
        sys.exit(1)

    content = content.replace(old, new, 1)
    file_path.write_text(content)
    print(f"  OK: {description}")


def main() -> None:
    cdp_dir = find_package_dir("cdp")
    agentkit_dir = find_package_dir("coinbase_agentkit")

    models_dir = cdp_dir / "openapi_client" / "models"
    provider_file = (
        agentkit_dir / "action_providers" / "cdp" / "cdp_evm_wallet_action_provider.py"
    )

    print(f"CDP package:      {cdp_dir}")
    print(f"AgentKit package: {agentkit_dir}")
    print()

    # ── Patch 1: CommonSwapResponseFees — make gas_fee and protocol_fee Optional ──
    print("Patch 1: CommonSwapResponseFees — Optional fields")
    fees_file = models_dir / "common_swap_response_fees.py"
    apply_patch(
        fees_file,
        '    gas_fee: TokenFee = Field(description="The estimated gas fee for the swap.", alias="gasFee")\n'
        '    protocol_fee: TokenFee = Field(description="The estimated protocol fee for the swap.", alias="protocolFee")',
        '    gas_fee: Optional[TokenFee] = Field(default=None, description="The estimated gas fee for the swap.", alias="gasFee")\n'
        '    protocol_fee: Optional[TokenFee] = Field(default=None, description="The estimated protocol fee for the swap.", alias="protocolFee")',
        "gas_fee and protocol_fee made Optional",
    )

    # ── Patch 2: CommonSwapResponseIssues — make all fields Optional ──
    print("Patch 2: CommonSwapResponseIssues — Optional fields")
    issues_file = models_dir / "common_swap_response_issues.py"
    apply_patch(
        issues_file,
        "    allowance: CommonSwapResponseIssuesAllowance\n"
        "    balance: CommonSwapResponseIssuesBalance\n"
        '    simulation_incomplete: StrictBool = Field(description="This is set to true when the transaction cannot be validated. This can happen when the taker has an insufficient balance of the `fromToken`. Note that this does not necessarily mean that the trade will revert.", alias="simulationIncomplete")',
        "    allowance: Optional[CommonSwapResponseIssuesAllowance] = None\n"
        "    balance: Optional[CommonSwapResponseIssuesBalance] = None\n"
        '    simulation_incomplete: Optional[StrictBool] = Field(default=None, description="This is set to true when the transaction cannot be validated. This can happen when the taker has an insufficient balance of the `fromToken`. Note that this does not necessarily mean that the trade will revert.", alias="simulationIncomplete")',
        "allowance, balance, simulation_incomplete made Optional",
    )

    # ── Patch 3: CommonSwapResponse — make fees and issues Optional ──
    print("Patch 3: CommonSwapResponse — Optional fees/issues")
    swap_response_file = models_dir / "common_swap_response.py"
    apply_patch(
        swap_response_file,
        "    fees: CommonSwapResponseFees\n"
        "    issues: CommonSwapResponseIssues\n",
        "    fees: Optional[CommonSwapResponseFees] = None\n"
        "    issues: Optional[CommonSwapResponseIssues] = None\n",
        "fees and issues made Optional",
    )

    # ── Patch 4a: CreateSwapQuoteResponse — make fields Optional ──
    print("Patch 4: CreateSwapQuoteResponse — Optional fields + validator fix")
    quote_file = models_dir / "create_swap_quote_response.py"

    # 4a: Make fees and issues Optional
    apply_patch(
        quote_file,
        "    fees: CommonSwapResponseFees\n"
        "    issues: CommonSwapResponseIssues\n"
        '    liquidity_available: StrictBool = Field(description="Whether sufficient liquidity is available to settle the swap. All other fields in the response will be empty if this is false.", alias="liquidityAvailable")\n'
        "    min_to_amount: Annotated[str, Field(strict=True)] = Field(description=\"The minimum amount of the `toToken` that must be received for the swap to succeed, in atomic units of the `toToken`.  For example, `1000000000000000000` when receiving ETH equates to 1 ETH, `1000000` when receiving USDC equates to 1 USDC, etc. This value is influenced by the `slippageBps` parameter.\", alias=\"minToAmount\")\n"
        "    from_amount: Annotated[str, Field(strict=True)] = Field(description=\"The amount of the `fromToken` that will be sent in this swap, in atomic units of the `fromToken`. For example, `1000000000000000000` when sending ETH equates to 1 ETH, `1000000` when sending USDC equates to 1 USDC, etc.\", alias=\"fromAmount\")\n"
        "    from_token: Annotated[str, Field(strict=True)] = Field(description=\"The 0x-prefixed contract address of the token that will be sent.\", alias=\"fromToken\")\n"
        "    permit2: CreateSwapQuoteResponseAllOfPermit2\n"
        "    transaction: CreateSwapQuoteResponseAllOfTransaction",
        "    fees: Optional[CommonSwapResponseFees] = None\n"
        "    issues: Optional[CommonSwapResponseIssues] = None\n"
        '    liquidity_available: Optional[bool] = Field(default=None, description="Whether sufficient liquidity is available to settle the swap.", alias="liquidityAvailable")\n'
        '    min_to_amount: Optional[str] = Field(default=None, description="The minimum amount of the toToken that must be received.", alias="minToAmount")\n'
        '    from_amount: Optional[str] = Field(default=None, description="The amount of the fromToken that will be sent.", alias="fromAmount")\n'
        '    from_token: Optional[str] = Field(default=None, description="The 0x-prefixed contract address of the token that will be sent.", alias="fromToken")\n'
        "    permit2: Optional[CreateSwapQuoteResponseAllOfPermit2] = None\n"
        "    transaction: Optional[CreateSwapQuoteResponseAllOfTransaction] = None",
        "8 fields made Optional (fees through transaction)",
    )

    # 4b: Fix liquidity_available validator (rejects Python bool True)
    apply_patch(
        quote_file,
        "    @field_validator('liquidity_available')\n"
        "    def liquidity_available_validate_enum(cls, value):\n"
        '        """Validates the enum"""\n'
        "        if value not in set(['true']):\n"
        "            raise ValueError(\"must be one of enum values ('true')\")\n"
        "        return value",
        "    @field_validator('liquidity_available', mode='before')\n"
        "    def liquidity_available_validate_enum(cls, value):\n"
        '        """Validates the enum \u2014 accept bool True or string \'true\'"""\n'
        "        if value is None:\n"
        "            return None\n"
        "        if isinstance(value, bool):\n"
        "            return value\n"
        "        if isinstance(value, str) and value.lower() == 'true':\n"
        "            return True\n"
        "        return value",
        "liquidity_available validator fixed for bool values",
    )

    # ── Patch 5a: Remove await on sync wait_for_transaction_receipt ──
    print("Patch 5a: CdpEvmWalletActionProvider — remove await on sync method")
    apply_patch(
        provider_file,
        "                    receipt = await wallet_provider.wait_for_transaction_receipt(\n"
        "                        swap_result.transaction_hash\n"
        "                    )",
        "                    receipt = wallet_provider.wait_for_transaction_receipt(\n"
        "                        swap_result.transaction_hash\n"
        "                    )",
        "removed await on synchronous wait_for_transaction_receipt",
    )

    # ── Patch 5b: Fix receipt status check (int 1, not string "success") ──
    print("Patch 5b: CdpEvmWalletActionProvider — fix receipt status check")
    apply_patch(
        provider_file,
        '                    if receipt.status != "success":\n'
        '                        return {"success": False, "error": "Swap transaction reverted"}',
        "                    # web3 AttributeDict uses int status (1=success, 0=reverted)\n"
        '                    if receipt.status not in (1, "success"):\n'
        '                        return {"success": False, "error": "Swap transaction reverted"}',
        'receipt.status check changed from != "success" to not in (1, "success")',
    )

    # ── Patch 6: Replace allowance check with direct on-chain Permit2 check ──
    print("Patch 6: CdpEvmWalletActionProvider — on-chain Permit2 allowance check")
    apply_patch(
        provider_file,
        '                    # Check if allowance is enough\n'
        '                    approval_tx_hash = None\n'
        '                    if (\n'
        '                        hasattr(swap_quote, "issues")\n'
        '                        and swap_quote.issues\n'
        '                        and hasattr(swap_quote.issues, "allowance")\n'
        '                    ):\n'
        '                        # Send approval transaction\n'
        '                        approve_data = (\n'
        '                            Web3()\n'
        '                            .eth.contract(abi=ERC20_ABI)\n'
        '                            .encodeABI(\n'
        '                                fn_name="approve",\n'
        '                                args=[PERMIT2_ADDRESS, 2**256 - 1],  # Max uint256\n'
        '                            )\n'
        '                        )\n'
        '\n'
        '                        approval_tx_hash = await cdp.evm.send_transaction(\n'
        '                            address=wallet_provider.get_address(),\n'
        '                            transaction={\n'
        '                                "to": validated_args.from_token,\n'
        '                                "data": approve_data,\n'
        '                            },\n'
        '                            network=cdp_network,\n'
        '                        )\n'
        '\n'
        '                        # Wait for approval transaction receipt and check if it was successful\n'
        '                        receipt = await cdp.evm.wait_for_transaction_receipt(\n'
        '                            address=wallet_provider.get_address(),\n'
        '                            transaction_hash=approval_tx_hash,\n'
        '                            network=cdp_network,\n'
        '                        )\n'
        '                        if receipt.status != "success":\n'
        '                            return {"success": False, "error": "Approval transaction failed"}',
        '                    # Check if ERC20 approval to Permit2 is needed (for non-ETH tokens)\n'
        '                    approval_tx_hash = None\n'
        '                    if validated_args.from_token.lower() != "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee":\n'
        '                        # Check on-chain allowance directly\n'
        '                        w3 = wallet_provider._web3\n'
        '                        token_contract = w3.eth.contract(\n'
        '                            address=Web3.to_checksum_address(validated_args.from_token),\n'
        '                            abi=ERC20_ABI,\n'
        '                        )\n'
        '                        current_allowance = token_contract.functions.allowance(\n'
        '                            Web3.to_checksum_address(wallet_provider.get_address()),\n'
        '                            Web3.to_checksum_address(PERMIT2_ADDRESS),\n'
        '                        ).call()\n'
        '\n'
        '                        from_amount_atomic = int(parse_units(validated_args.from_amount, from_token_decimals))\n'
        '                        if current_allowance < from_amount_atomic:\n'
        '                            # Send max approval to Permit2 via wallet provider\n'
        '                            approve_data = token_contract.encode_abi(\n'
        '                                "approve",\n'
        '                                [Web3.to_checksum_address(PERMIT2_ADDRESS), 2**256 - 1],\n'
        '                            )\n'
        '                            approval_tx_hash = wallet_provider.send_transaction({\n'
        '                                "to": validated_args.from_token,\n'
        '                                "data": approve_data,\n'
        '                                "value": 0,\n'
        '                            })\n'
        '                            receipt = wallet_provider.wait_for_transaction_receipt(approval_tx_hash)\n'
        '                            if receipt.status != 1:\n'
        '                                return {"success": False, "error": "Approval transaction failed"}',
        "replaced broken allowance check with direct on-chain Permit2 check",
    )

    print()
    print("All patches applied successfully.")


if __name__ == "__main__":
    main()
