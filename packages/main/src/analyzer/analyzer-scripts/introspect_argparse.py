#!/usr/bin/env python3
"""
Introspect an argparse-based CLI by monkey-patching ArgumentParser.

Usage: python introspect_argparse.py <entrypoint_module_or_file>

Output: JSON to stdout with the structure:
  { "arguments": [...], "subcommands": [...] }
"""

import sys
import json
import importlib
import importlib.util
import os

def serialize_action(action):
    """Convert an argparse action to a JSON-serializable dict."""
    name = action.dest if not action.option_strings else (
        next((s for s in action.option_strings if s.startswith('--')), action.option_strings[0])
    )
    aliases = [s for s in action.option_strings if s != name] if action.option_strings else []

    # Resolve type name
    type_name = None
    if action.type is not None:
        type_name = getattr(action.type, '__name__', str(action.type))

    # Serialize choices
    choices = None
    if action.choices is not None:
        choices = [str(c) for c in action.choices]

    # Serialize default
    default = None
    if action.default is not None and action.default != '==SUPPRESS==':
        try:
            json.dumps(action.default)
            default = action.default
        except (TypeError, ValueError):
            default = str(action.default)

    return {
        'name': name,
        'aliases': aliases,
        'type': type_name,
        'required': action.required if hasattr(action, 'required') else False,
        'default': default,
        'choices': choices,
        'help': action.help if action.help != '==SUPPRESS==' else None,
        'nargs': str(action.nargs) if action.nargs is not None else None,
        'action': type(action).__name__,
        'metavar': action.metavar,
    }


captured_parsers = []

def patch_argparse():
    import argparse

    OriginalParser = argparse.ArgumentParser

    class PatchedParser(OriginalParser):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            captured_parsers.append(self)

        def parse_args(self, args=None, namespace=None):
            # Intercept and exit without parsing
            raise SystemExit(0)

        def parse_known_args(self, args=None, namespace=None):
            raise SystemExit(0)

    argparse.ArgumentParser = PatchedParser
    return argparse


def load_entrypoint(entrypoint):
    """
    Try to invoke the entrypoint so argparse parsers get created.
    entrypoint can be:
      - "yt_dlp:main"    (module:function from console_scripts)
      - "myapp.cli:run"  (dotted module:function)
      - "main.py"        (file path)
      - "yt_dlp"         (plain module name)
    """
    # module:function format (from console_scripts in pyproject.toml)
    if ':' in entrypoint and not os.path.exists(entrypoint):
        module_name, func_name = entrypoint.split(':', 1)
        mod = importlib.import_module(module_name)
        func = getattr(mod, func_name)
        func()
        return

    # File path
    if entrypoint.endswith('.py') or os.path.exists(entrypoint):
        spec = importlib.util.spec_from_file_location('__main__', entrypoint)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            sys.modules['__main__'] = mod
            spec.loader.exec_module(mod)
            return

    # Plain module name — try importing it; if it has a main(), call it
    mod = importlib.import_module(entrypoint)
    if hasattr(mod, 'main'):
        mod.main()
    elif hasattr(mod, 'cli'):
        mod.cli()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: introspect_argparse.py <entrypoint>'}))
        sys.exit(1)

    entrypoint = sys.argv[1]

    # Add repo root (current working dir and /repo) to path
    for p in ['/repo', os.getcwd(), os.path.dirname(os.path.abspath(entrypoint))]:
        if p not in sys.path:
            sys.path.insert(0, p)

    patch_argparse()

    try:
        sys.argv = [entrypoint]
        load_entrypoint(entrypoint)
    except SystemExit:
        pass
    except Exception as e:
        # Even on error, try to emit what we captured
        if not captured_parsers:
            print(json.dumps({'error': str(e), 'arguments': [], 'subcommands': []}))
            sys.exit(0)

    if not captured_parsers:
        print(json.dumps({'error': 'No ArgumentParser instances found', 'arguments': [], 'subcommands': []}))
        sys.exit(0)

    # Use the first (likely the top-level) parser
    parser = captured_parsers[0]
    arguments = []
    subcommands = []

    for action in parser._actions:
        # Skip help action and subparser action
        if isinstance(action, __import__('argparse')._HelpAction):
            continue
        if hasattr(action, '_parser_class'):  # _SubParsersAction
            # Collect subcommands
            if hasattr(action, '_name_parser_map'):
                for sub_name, sub_parser in action._name_parser_map.items():
                    sub_args = []
                    for sub_action in sub_parser._actions:
                        if isinstance(sub_action, __import__('argparse')._HelpAction):
                            continue
                        sub_args.append(serialize_action(sub_action))
                    subcommands.append({
                        'name': sub_name,
                        'description': sub_parser.description,
                        'arguments': sub_args,
                    })
            continue
        arguments.append(serialize_action(action))

    print(json.dumps({'arguments': arguments, 'subcommands': subcommands}))


if __name__ == '__main__':
    main()
