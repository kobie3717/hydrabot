# HydraBot Agents Library

Multi-agent orchestration using Anthropic Claude SDK. Ported from galatro's Google ADK/Gemini red team agents.

## Structure

```
agents/
├── __init__.py          # Package exports
├── base.py              # BaseAgent class (Anthropic SDK)
├── runner.py            # Parallel/sequential execution
├── registry.py          # Agent pack registry
├── requirements.txt     # Python dependencies
├── example.py          # Usage example
└── redteam/            # Red Team agent pack
    ├── __init__.py
    ├── cfo.py           # Financial skepticism
    ├── market.py        # Customer/demand analysis
    ├── legal.py         # Corporate structure/conflicts
    ├── competitor.py    # Competitive threats
    ├── execution.py     # Operational feasibility
    ├── synthesis.py     # Aggregates 5 agents
    └── orchestrator.py  # Runs pack (parallel + synthesis)
```

## Installation

```bash
cd /root/hydrabot/agents
pip install -r requirements.txt
```

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

### List Available Packs

```python
from agents import list_packs

packs = list_packs()
for pack in packs:
    print(f"{pack['id']}: {pack['name']}")
```

### Run Red Team Analysis

```python
import asyncio
from agents import run_pack

document = """
Your strategic document here:
- Business plan
- IPO filing
- M&A memo
- Product strategy
"""

async def analyze():
    result = await run_pack("redteam", document)
    print(f"Risk Score: {result['risk_score']}/100")
    print(f"Verdict: {result['verdict']}")
    
    for vuln in result['vulnerabilities']:
        print(f"\n{vuln['severity']}: {vuln['title']}")
        print(f"Agent: {vuln['agent']}")
        print(f"Attack: {vuln['attack']}")

asyncio.run(analyze())
```

### Direct Agent Usage

```python
from agents.redteam import cfo_agent

result = await cfo_agent.run(document)
print(result)
```

### Custom Orchestration

```python
from agents import run_parallel, BaseAgent

# Create custom agents
agent1 = BaseAgent("agent1", "You are...", model="claude-sonnet-4-6")
agent2 = BaseAgent("agent2", "You are...", model="claude-sonnet-4-6")

# Run in parallel
results = await run_parallel([agent1, agent2], document)
```

## Red Team Agent Pack

Attacks your strategy from 5 adversarial angles:

1. **CFO Agent** - Financial skepticism
   - Finds concrete financial flaws
   - Challenges projections vs historical reality
   - Identifies invented metrics

2. **Market Agent** - Customer/demand skepticism
   - Attacks demand assumptions
   - Identifies customer churn risks
   - Questions moat durability

3. **Legal Agent** - Corporate structure analysis
   - Finds conflicts of interest
   - Identifies control issues
   - Assesses regulatory exposure

4. **Competitor Agent** - Competitive threats
   - Analyzes barriers to entry
   - Identifies competitive moves
   - Questions valuation gaps

5. **Execution Agent** - Operational feasibility
   - Challenges execution capacity
   - Identifies single points of failure
   - Questions organizational readiness

### Output Format

```json
{
  "risk_score": 75,
  "executive_summary": "...",
  "vulnerabilities": [
    {
      "id": "cfo_1",
      "agent": "cfo",
      "title": "Unrealistic 10x growth projection",
      "severity": "CRITICAL",
      "attack": "...",
      "question": "..."
    }
  ],
  "top_3_questions": ["...", "...", "..."],
  "verdict": "PROCEED_WITH_CAUTION"
}
```

Verdict options:
- `PROCEED` - Low risk, go ahead
- `PROCEED_WITH_CAUTION` - Medium risk, address key questions first
- `DO_NOT_PROCEED` - High risk, fundamental flaws

## Configuration

### Models

Default: `claude-sonnet-4-6`

Change per agent:
```python
agent = BaseAgent("name", "prompt", model="claude-opus-4")
```

### Max Tokens

- Individual agents: 2000 tokens (default)
- Synthesis agent: 4000 tokens (default)

Override:
```python
agent = BaseAgent("name", "prompt", max_tokens=3000)
```

## Architecture

1. **BaseAgent** - Wraps Anthropic AsyncAnthropic client
2. **Runner** - Executes agents in parallel (asyncio.gather) or sequential
3. **Orchestrator** - Coordinates multi-agent workflows
4. **Registry** - Central dispatch for agent packs

## Adding New Agent Packs

1. Create new directory under `agents/`
2. Implement agents using `BaseAgent`
3. Create orchestrator function
4. Register in `registry.py`:

```python
from .mypack.orchestrator import run_mypack

AGENT_PACKS["mypack"] = {
    "name": "My Pack",
    "description": "...",
    "run": run_mypack,
    "input": "...",
    "output": "..."
}
```

## Notes

- Uses Anthropic SDK exclusively (no Google ADK/Gemini)
- Maintains galatro's adversarial tone exactly
- No RAG retrieval - document passed as full context
- Async/await throughout for concurrent execution
- JSON output from synthesis for structured consumption
