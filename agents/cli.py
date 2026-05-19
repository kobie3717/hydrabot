#!/usr/bin/env python3
"""
Command-line interface for HydraBot agents
"""

import sys
import asyncio
import argparse
import json
from pathlib import Path

# Ensure agents package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents import list_packs, run_pack


def main():
    parser = argparse.ArgumentParser(
        description="HydraBot Multi-Agent Orchestration CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List available agent packs
  python3 cli.py list

  # Run red team analysis on a file
  python3 cli.py run redteam document.txt

  # Run red team analysis from stdin
  cat document.txt | python3 cli.py run redteam -

  # Save output to file
  python3 cli.py run redteam document.txt -o report.json
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # List command
    list_parser = subparsers.add_parser("list", help="List available agent packs")
    list_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed information"
    )

    # Run command
    run_parser = subparsers.add_parser("run", help="Run an agent pack")
    run_parser.add_argument(
        "pack",
        help="Agent pack ID (e.g., 'redteam')"
    )
    run_parser.add_argument(
        "document",
        help="Path to document file (use '-' for stdin)"
    )
    run_parser.add_argument(
        "--output", "-o",
        help="Output file path (default: stdout)"
    )
    run_parser.add_argument(
        "--pretty", "-p",
        action="store_true",
        help="Pretty-print JSON output"
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "list":
        handle_list(args)
    elif args.command == "run":
        asyncio.run(handle_run(args))


def handle_list(args):
    """Handle the list command"""
    packs = list_packs()

    if not packs:
        print("No agent packs available")
        return

    print(f"Available Agent Packs ({len(packs)}):")
    print("=" * 80)

    for pack in packs:
        print(f"\nID: {pack['id']}")
        print(f"Name: {pack['name']}")

        if args.verbose:
            print(f"Description: {pack['description']}")
            print(f"Input: {pack['input']}")
            print(f"Output: {pack['output']}")

    print()


async def handle_run(args):
    """Handle the run command"""
    # Read document
    if args.document == "-":
        document = sys.stdin.read()
    else:
        try:
            with open(args.document, "r") as f:
                document = f.read()
        except FileNotFoundError:
            print(f"Error: File not found: {args.document}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error reading file: {e}", file=sys.stderr)
            sys.exit(1)

    if not document.strip():
        print("Error: Document is empty", file=sys.stderr)
        sys.exit(1)

    # Run agent pack
    try:
        result = await run_pack(args.pack, document)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error running agent pack: {e}", file=sys.stderr)
        sys.exit(1)

    # Format output
    indent = 2 if args.pretty else None
    output = json.dumps(result, indent=indent)

    # Write output
    if args.output:
        try:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"Output written to: {args.output}")
        except Exception as e:
            print(f"Error writing output: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(output)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        sys.exit(130)
