"""
Quick test to verify all imports work correctly
"""

import sys

def test_imports():
    """Test that all modules can be imported"""

    print("Testing core imports...")
    try:
        from agents import list_packs, run_pack, AGENT_PACKS, BaseAgent, run_parallel, run_sequential
        print("✓ Core imports successful")
    except ImportError as e:
        print(f"✗ Core import failed: {e}")
        return False

    print("\nTesting redteam imports...")
    try:
        from agents.redteam import (
            run_redteam,
            cfo_agent,
            market_agent,
            legal_agent,
            competitor_agent,
            execution_agent,
            synthesis_agent
        )
        print("✓ Red team imports successful")
    except ImportError as e:
        print(f"✗ Red team import failed: {e}")
        return False

    print("\nTesting registry...")
    try:
        packs = list_packs()
        print(f"✓ Found {len(packs)} agent pack(s):")
        for pack in packs:
            print(f"  - {pack['id']}: {pack['name']}")
    except Exception as e:
        print(f"✗ Registry test failed: {e}")
        return False

    print("\nTesting agent instantiation...")
    try:
        assert cfo_agent.name == "cfo"
        assert market_agent.name == "market"
        assert legal_agent.name == "legal"
        assert competitor_agent.name == "competitor"
        assert execution_agent.name == "execution"
        assert synthesis_agent.name == "synthesis"
        print("✓ All agents instantiated correctly")
    except Exception as e:
        print(f"✗ Agent instantiation failed: {e}")
        return False

    print("\nTesting agent configuration...")
    try:
        assert cfo_agent.model == "claude-sonnet-4-6"
        assert cfo_agent.max_tokens == 2000
        assert synthesis_agent.max_tokens == 4000
        print("✓ Agent configuration correct")
    except Exception as e:
        print(f"✗ Configuration test failed: {e}")
        return False

    print("\n" + "=" * 60)
    print("All import tests passed!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)
