# CDP SDK Patches (coinbase-agentkit 0.7.4 / cdp-sdk 1.39.1)

The CDP Python SDK has 6 bugs that prevent swaps from working. These are patched
directly in the venv site-packages. **If you recreate the venv or pip install, you
must re-apply these patches.**

All paths below are relative to `venv/lib/python3.11/site-packages/`.

## Patch 1: CommonSwapResponseFees — Optional fields

**File:** `cdp/openapi_client/models/common_swap_response_fees.py`

The API returns `null` for `gasFee` and `protocolFee` but the model declares them
as required `TokenFee` fields.

```python
# BEFORE (line 31-32):
gas_fee: TokenFee = Field(...)
protocol_fee: TokenFee = Field(...)

# AFTER:
gas_fee: Optional[TokenFee] = Field(default=None, ...)
protocol_fee: Optional[TokenFee] = Field(default=None, ...)
```

## Patch 2: CommonSwapResponseIssues — Optional fields

**File:** `cdp/openapi_client/models/common_swap_response_issues.py`

Same pattern — `allowance`, `balance`, `simulation_incomplete` declared required
but API returns null.

```python
# BEFORE:
allowance: CommonSwapResponseIssuesAllowance = ...
balance: CommonSwapResponseIssuesBalance = ...
simulation_incomplete: StrictBool = Field(...)

# AFTER:
allowance: Optional[CommonSwapResponseIssuesAllowance] = None
balance: Optional[CommonSwapResponseIssuesBalance] = None
simulation_incomplete: Optional[StrictBool] = Field(default=None, ...)
```

## Patch 3: CommonSwapResponse — Optional fees/issues

**File:** `cdp/openapi_client/models/common_swap_response.py`

```python
# BEFORE:
fees: CommonSwapResponseFees = ...
issues: CommonSwapResponseIssues = ...

# AFTER:
fees: Optional[CommonSwapResponseFees] = None
issues: Optional[CommonSwapResponseIssues] = None
```

## Patch 4: CreateSwapQuoteResponse — Optional fields + validator fix

**File:** `cdp/openapi_client/models/create_swap_quote_response.py`

Multiple issues:
- `fees`, `issues`, `liquidity_available`, `min_to_amount`, `from_amount`,
  `from_token`, `permit2`, `transaction` all declared required but API returns null
- `liquidity_available` has a broken validator that checks `value not in set(['true'])`
  which rejects Python `True` (bool)

```python
# Make fields Optional (same pattern as above)
fees: Optional[CommonSwapResponseFees] = None
issues: Optional[CommonSwapResponseIssues] = None
liquidity_available: Optional[bool] = Field(default=None, ...)
min_to_amount: Optional[str] = Field(default=None, ...)
from_amount: Optional[str] = Field(default=None, ...)
from_token: Optional[str] = Field(default=None, ...)
permit2: Optional[CreateSwapQuoteResponseAllOfPermit2] = None
transaction: Optional[CreateSwapQuoteResponseAllOfTransaction] = None

# Fix validator (replace the entire method):
@field_validator('liquidity_available', mode='before')
def liquidity_available_validate_enum(cls, value):
    """Validates the enum — accept bool True or string 'true'"""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.lower() == 'true':
        return True
    return value
```

Also change the import line to include `StrictBool` → replace with just `bool`
usage, and add `field_validator` mode='before'.

## Patch 5: CdpEvmWalletActionProvider — async/sync mismatch

**File:** `coinbase_agentkit/action_providers/cdp/cdp_evm_wallet_action_provider.py`

Two bugs in the `swap()` method's `_execute_swap()` async function:

### 5a: Remove `await` on sync method (line ~286)

`wallet_provider.wait_for_transaction_receipt()` is synchronous (returns web3
`AttributeDict`) but was called with `await`, causing
`"object AttributeDict can't be used in 'await' expression"`.

```python
# BEFORE:
receipt = await wallet_provider.wait_for_transaction_receipt(swap_result.transaction_hash)

# AFTER:
receipt = wallet_provider.wait_for_transaction_receipt(swap_result.transaction_hash)
```

### 5b: Fix receipt status check (line ~291)

Web3's `AttributeDict` receipt uses `status = 1` (int) for success, not string `"success"`.

```python
# BEFORE:
if receipt.status != "success":

# AFTER:
if receipt.status not in (1, "success"):
```

## Patch 6: CdpEvmWalletActionProvider — ERC20 approval for Permit2

**File:** `coinbase_agentkit/action_providers/cdp/cdp_evm_wallet_action_provider.py`

The original code checks `swap_quote.issues.allowance` to decide if ERC20 approval
is needed. But `QuoteSwapResult` (from `account.quote_swap()`) has no `issues`
attribute, so the approval is silently skipped. USDC→ETH swaps revert because
USDC was never approved for the Permit2 contract.

Replace the entire allowance check block (lines ~241-274) with a direct on-chain
allowance check:

```python
# Check if ERC20 approval to Permit2 is needed (for non-ETH tokens)
approval_tx_hash = None
if validated_args.from_token.lower() != "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee":
    # Check on-chain allowance directly
    w3 = wallet_provider._web3
    token_contract = w3.eth.contract(
        address=Web3.to_checksum_address(validated_args.from_token),
        abi=ERC20_ABI,
    )
    current_allowance = token_contract.functions.allowance(
        Web3.to_checksum_address(wallet_provider.get_address()),
        Web3.to_checksum_address(PERMIT2_ADDRESS),
    ).call()

    from_amount_atomic = int(parse_units(validated_args.from_amount, from_token_decimals))
    if current_allowance < from_amount_atomic:
        # Send max approval to Permit2 via wallet provider
        approve_data = token_contract.encode_abi(
            "approve",
            [Web3.to_checksum_address(PERMIT2_ADDRESS), 2**256 - 1],
        )
        approval_tx_hash = wallet_provider.send_transaction({
            "to": validated_args.from_token,
            "data": approve_data,
            "value": 0,
        })
        receipt = wallet_provider.wait_for_transaction_receipt(approval_tx_hash)
        if receipt.status != 1:
            return {"success": False, "error": "Approval transaction failed"}
```

Note: the original code also used `Web3().eth.contract(abi=ERC20_ABI).encodeABI()`
which doesn't work in web3 v7. Use `contract.encode_abi()` on an address-bound
contract instance instead.

---

## How to verify patches are applied

```bash
cd agents/test-agent
source venv/bin/activate
python test_swap.py
```

If the round-trip swap works, patches are good.

## When can we remove these patches?

When Coinbase releases a fixed version of `cdp-sdk` and `coinbase-agentkit`.
Check their GitHub issues / changelogs. These are all OpenAPI-generated model
validation issues, likely fixed in a future SDK release.
