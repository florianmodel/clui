#!/usr/bin/env python3
"""
Introspect a Click-based CLI by importing the module and walking the Click command tree.

Usage: python introspect_click.py <entrypoint_module_or_file>

Output: JSON to stdout with the structure:
  { "params": [...], "commands": [...], "help": "..." }
"""

import sys
import json
import importlib
import importlib.util
import os


def serialize_param(param):
    """Convert a click.Parameter to a dict."""
    import click

    param_type_name = 'string'
    choices = None

    if isinstance(param.type, click.Choice):
        param_type_name = 'choice'
        choices = list(param.type.choices)
    elif isinstance(param.type, click.INT):
        param_type_name = 'int'
    elif isinstance(param.type, click.FLOAT):
        param_type_name = 'float'
    elif isinstance(param.type, click.BOOL):
        param_type_name = 'bool'
    elif isinstance(param.type, (click.Path, click.File)):
        param_type_name = 'path'
    elif hasattr(param.type, 'name'):
        param_type_name = param.type.name

    is_option = isinstance(param, click.Option)
    is_argument = isinstance(param, click.Argument)
    is_flag = getattr(param, 'is_flag', False) if is_option else False

    # Default value
    default = None
    if param.default is not None:
        try:
            json.dumps(param.default)
            default = param.default
        except (TypeError, ValueError):
            default = str(param.default)

    return {
        'name': param.name,
        'type': param_type_name,
        'required': param.required,
        'default': default,
        'help': getattr(param, 'help', None),
        'is_flag': is_flag,
        'multiple': getattr(param, 'multiple', False),
        'choices': choices,
        'nargs': param.nargs if param.nargs != 1 else None,
        'param_type': 'argument' if is_argument else 'option',
    }


def serialize_command(cmd):
    """Recursively serialize a Click command."""
    import click

    result = {
        'name': cmd.name,
        'help': cmd.help,
        'params': [serialize_param(p) for p in cmd.params if p.name != 'help'],
        'commands': [],
    }

    if isinstance(cmd, click.MultiCommand):
        try:
            ctx = click.Context(cmd)
            for sub_name in cmd.list_commands(ctx):
                try:
                    sub_cmd = cmd.get_command(ctx, sub_name)
                    if sub_cmd:
                        result['commands'].append(serialize_command(sub_cmd))
                except Exception:
                    result['commands'].append({'name': sub_name, 'help': None, 'params': [], 'commands': []})
        except Exception:
            pass

    return result


def find_click_command(module):
    """Find the main click command/group in the module."""
    import click

    # Look for decorated click commands
    candidates = []
    for name in dir(module):
        obj = getattr(module, name, None)
        if isinstance(obj, click.BaseCommand):
            candidates.append((name, obj))

    if not candidates:
        return None

    # Prefer 'cli', 'main', 'app' — or the first one found
    for preferred in ['cli', 'main', 'app', 'cmd']:
        for name, cmd in candidates:
            if name == preferred:
                return cmd

    return candidates[0][1]


def load_module(entrypoint):
    """
    Load a Python module from:
      - "black:patched_main"  (module:function — load the module part)
      - "myapp.cli:run"       (dotted module:function)
      - "main.py"             (file path)
      - "black"               (plain module name)
    """
    # module:function format — load the module part only
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

    # Plain dotted module name
    return importlib.import_module(entrypoint)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: introspect_click.py <entrypoint>'}))
        sys.exit(1)

    entrypoint = sys.argv[1]

    for p in ['/repo', os.getcwd(), os.path.dirname(os.path.abspath(entrypoint))]:
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        import click
    except ImportError:
        print(json.dumps({'error': 'click not installed in this environment', 'params': [], 'commands': []}))
        sys.exit(0)

    try:
        mod = load_module(entrypoint)
    except Exception as e:
        print(json.dumps({'error': f'Failed to load module: {e}', 'params': [], 'commands': []}))
        sys.exit(0)

    cmd = find_click_command(mod)
    if cmd is None:
        print(json.dumps({'error': 'No click command found', 'params': [], 'commands': []}))
        sys.exit(0)

    result = serialize_command(cmd)
    # Flatten: top-level params and commands
    print(json.dumps({
        'params': result['params'],
        'commands': result['commands'],
        'help': result['help'],
    }))


if __name__ == '__main__':
    main()
