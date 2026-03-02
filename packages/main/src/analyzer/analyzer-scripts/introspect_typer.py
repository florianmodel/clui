#!/usr/bin/env python3
"""
Introspect a Typer-based CLI by converting the typer app to a click command,
then using the same click introspection logic.

Usage: python introspect_typer.py <entrypoint_module_or_file>

Output: JSON to stdout (same format as introspect_click.py)
"""

import sys
import json
import importlib
import importlib.util
import os


def load_module(entrypoint):
    # module:function format — load the module part
    if ':' in entrypoint and not os.path.exists(entrypoint):
        module_name = entrypoint.split(':', 1)[0]
        return importlib.import_module(module_name)
    # File path
    if entrypoint.endswith('.py') or os.path.exists(entrypoint):
        spec = importlib.util.spec_from_file_location('__target__', entrypoint)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
    # Plain module name
    return importlib.import_module(entrypoint)


def find_typer_app(module):
    """Find the typer.Typer instance in a module."""
    try:
        import typer
    except ImportError:
        return None

    for name in dir(module):
        obj = getattr(module, name, None)
        if isinstance(obj, typer.Typer):
            return obj
    return None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: introspect_typer.py <entrypoint>'}))
        sys.exit(1)

    entrypoint = sys.argv[1]

    for p in ['/repo', os.getcwd(), os.path.dirname(os.path.abspath(entrypoint))]:
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        import typer
        import typer.main as typer_main
    except ImportError:
        print(json.dumps({'error': 'typer not installed in this environment', 'params': [], 'commands': []}))
        sys.exit(0)

    try:
        mod = load_module(entrypoint)
    except Exception as e:
        print(json.dumps({'error': f'Failed to load module: {e}', 'params': [], 'commands': []}))
        sys.exit(0)

    app = find_typer_app(mod)
    if app is None:
        print(json.dumps({'error': 'No typer.Typer instance found', 'params': [], 'commands': []}))
        sys.exit(0)

    try:
        # Convert typer app to underlying click command
        click_cmd = typer_main.get_command(app)
    except Exception as e:
        print(json.dumps({'error': f'Failed to convert typer to click: {e}', 'params': [], 'commands': []}))
        sys.exit(0)

    # Reuse click serialization — inline the relevant functions here to avoid import issues
    # Add introspect_click.py directory to path and import it
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)

    try:
        import introspect_click
        result = introspect_click.serialize_command(click_cmd)
        print(json.dumps({
            'params': result['params'],
            'commands': result['commands'],
            'help': result['help'],
        }))
    except Exception as e:
        print(json.dumps({'error': f'Serialization failed: {e}', 'params': [], 'commands': []}))


if __name__ == '__main__':
    main()
