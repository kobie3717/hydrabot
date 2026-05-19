"""
Example usage of the HydraBot agents library
"""

import asyncio
import json
from registry import list_packs, run_pack


async def main():
    # List available agent packs
    print("Available Agent Packs:")
    print("=" * 80)
    for pack in list_packs():
        print(f"\nID: {pack['id']}")
        print(f"Name: {pack['name']}")
        print(f"Description: {pack['description']}")
        print(f"Input: {pack['input']}")
        print(f"Output: {pack['output']}")

    print("\n" + "=" * 80)
    print("\nExample: Running Red Team analysis")
    print("=" * 80)

    # Example document (simplified business plan excerpt)
    document = """
    ACME SaaS Business Plan - Q1 2026

    Financial Projections:
    - Current ARR: $500K
    - Projected ARR (12 months): $5M (10x growth)
    - Customer acquisition cost: $1,200
    - Lifetime value: $3,600
    - Team size: 8 people
    - Burn rate: $150K/month

    Market Analysis:
    - Total addressable market: $50B
    - We expect to capture 1% in 3 years
    - No direct competitors identified
    - Proprietary technology provides strong moat

    Corporate Structure:
    - Founder owns 80% voting shares, 40% economic shares
    - Board has 3 seats, founder controls 2
    - No term limits for board members
    - Founder employment agreement includes $5M change-of-control bonus

    Go-to-Market Strategy:
    - Plan to scale from 8 to 50 employees in 12 months
    - Enter 3 new international markets simultaneously
    - Founder will personally close all enterprise deals
    """

    try:
        # Run the red team pack
        result = await run_pack("redteam", document)

        # Pretty print the result
        print("\nRed Team Analysis Result:")
        print(json.dumps(result, indent=2))

    except Exception as e:
        print(f"\nError running red team analysis: {e}")


if __name__ == "__main__":
    asyncio.run(main())
