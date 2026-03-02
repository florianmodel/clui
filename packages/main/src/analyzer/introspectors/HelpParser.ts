import type { ArgumentInfo, ArgumentType, SubcommandInfo } from '@gui-bridge/shared';

/**
 * Parses raw --help output into structured ArgumentInfo[] and SubcommandInfo[].
 * This is the fallback parser used when Python introspection is unavailable.
 */
export class HelpParser {
  static parse(helpText: string): { arguments: ArgumentInfo[]; subcommands: SubcommandInfo[] } {
    const lines = helpText.split('\n');
    const args = HelpParser.parseArguments(lines);
    const positionals = HelpParser.parsePositionals(helpText);
    const subcommands = HelpParser.parseSubcommands(lines);

    // Merge positionals (they won't duplicate flagged args)
    const argNames = new Set(args.map((a) => a.name));
    for (const p of positionals) {
      if (!argNames.has(p.name)) {
        args.push(p);
      }
    }

    return { arguments: args, subcommands };
  }

  // ── Flag argument parsing ────────────────────────────────────────────────

  private static parseArguments(lines: string[]): ArgumentInfo[] {
    const results: ArgumentInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const flagMatch = HelpParser.extractFlags(line);
      if (!flagMatch) continue;

      const { flags, indicator, rest } = flagMatch;
      if (flags.length === 0) continue;

      // description = inline value indicator + rest + continuation lines.
      // Including the indicator ensures type inference sees "INTEGER", "<NUM>", etc.
      let description = (indicator ? indicator + ' ' : '') + rest.trim();
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].trim() &&
        !HelpParser.extractFlags(lines[j]) &&
        lines[j].startsWith(' ')
      ) {
        description += ' ' + lines[j].trim();
        j++;
      }

      const primaryFlag = flags.find((f) => f.startsWith('--')) ?? flags[0];
      const name = primaryFlag;
      const aliases = flags.filter((f) => f !== primaryFlag);

      // inferType uses the indicator (metavar) for type keywords, full description for choices
      const inferredType = HelpParser.inferType(primaryFlag, indicator, description);
      // Only call looksLikeBoolFlag when type is still undetermined ('string')
      const isFlag =
        inferredType === 'bool' ||
        (inferredType === 'string' && HelpParser.looksLikeBoolFlag(primaryFlag, indicator, description));
      const type = isFlag ? 'bool' : inferredType;

      const defaultVal = HelpParser.extractDefault(description);
      const choices = HelpParser.extractChoices(description);
      const metavar = !isFlag ? HelpParser.extractMetavar(line, primaryFlag) : undefined;
      const required = HelpParser.isRequired(description);
      const multiple = HelpParser.isMultiple(description);

      results.push({
        name,
        aliases,
        positional: false,
        type,
        required,
        default: defaultVal,
        choices: choices.length > 0 ? choices : undefined,
        description: HelpParser.cleanDescription(description),
        isFlag,
        multiple,
        metavar,
      });
    }

    return results;
  }

  /**
   * Extract flags and any inline value indicator from a help line.
   * Handles formats:
   *   -c, --count               → indicator="" (bool flag)
   *   -l, --line-length INTEGER → indicator="INTEGER"
   *   -o FILE, --output=FILE    → indicator="FILE =FILE"
   *   --from=FORMAT             → indicator="=FORMAT"
   *   -A, --after-context <NUM> → indicator="<NUM>"
   */
  private static extractFlags(
    line: string,
  ): { flags: string[]; indicator: string; rest: string } | null {
    // Line must start with 1-10 spaces followed immediately by a dash
    const leadingMatch = line.match(/^(\s{1,10})-/);
    if (!leadingMatch) return null;

    const content = line.slice(leadingMatch[1].length);
    const flags: string[] = [];
    const indicators: string[] = [];
    let pos = 0;

    while (pos < content.length) {
      // Skip spaces and commas between tokens
      const skip = content.slice(pos).match(/^[\s,]+/);
      if (skip) { pos += skip[0].length; continue; }

      // Match a flag: -x or --long-name, optionally with =VALUE suffix
      const flagM = content.slice(pos).match(/^(-{1,2}[\w][\w-]*)(?:=(\S*))?/);
      if (flagM) {
        flags.push(flagM[1]);
        if (flagM[2] !== undefined) indicators.push('=' + flagM[2]); // =VALUE suffix
        pos += flagM[0].length;
        continue;
      }

      // Capture a standalone uppercase metavar (2+ chars) or angle-bracket metavar
      const metaM = content.slice(pos).match(/^(?:[A-Z][A-Z_0-9]+|<[^>]+>)/);
      if (metaM && flags.length > 0) {
        indicators.push(metaM[0]);
        pos += metaM[0].length;
        continue;
      }

      break; // start of description text
    }

    if (flags.length === 0) return null;

    return {
      flags,
      indicator: indicators.join(' '),
      rest: content.slice(pos).trim(),
    };
  }

  /**
   * Infer the argument type.
   * @param flag        The primary flag name
   * @param indicator   The inline value indicator (metavar or =VALUE from the flag line)
   * @param description The full description text (indicator + natural language + continuation)
   */
  private static inferType(flag: string, indicator: string, description: string): ArgumentType {
    // Check type keywords in the indicator (the actual metavar) — reliable signal
    const ind = indicator.toUpperCase();
    const flagUp = flag.toUpperCase();

    if (/\b(INTEGER|INT|NUM|NUMBER)\b/.test(ind) || /\b(INTEGER|INT|NUM)\b/.test(flagUp)) return 'int';
    if (/\bFLOAT\b/.test(ind)) return 'float';
    if (/\b(PATH|FILE|FILENAME)\b/.test(ind) || /\b(FILE|PATH)\b/.test(flagUp)) return 'file';
    if (/\bDIR(ECTORY)?\b/.test(ind) || /\b(DIR|DIRECTORY)\b/.test(flagUp)) return 'directory';
    if (/\b(BOOLEAN|FLAG)\b/.test(ind)) return 'bool';

    // Choices from the full description (e.g. [possible values: ...], {a|b|c}, [a|b|c])
    if (HelpParser.extractChoices(description).length > 0) return 'choice';

    // Inline type hints like [type: int] in the description
    if (/\[type:\s*int\b/i.test(description)) return 'int';
    if (/\[type:\s*float\b/i.test(description)) return 'float';

    return 'string';
  }

  /**
   * Determine if a flag is boolean (no value) vs value-taking.
   * Only called when inferType() returned 'string' (i.e. type is undetermined).
   *
   * @param flag      The primary flag string (e.g. '--count')
   * @param indicator Inline value indicators extracted from the flag line (metavars, =VALUE)
   * @param fullDesc  The full joined description
   */
  private static looksLikeBoolFlag(flag: string, indicator: string, fullDesc: string): boolean {
    // Explicit toggle-style flag name patterns → definitely a bool flag
    if (/^--(?:no-|enable-|disable-|with-|without-)/.test(flag)) return true;
    if (/\bstore_true\b|\bstore_false\b/i.test(fullDesc)) return true;
    if (/\[no-\w+\]/.test(fullDesc)) return true;

    // Any inline value indicator on the same line → takes a value, not a flag
    if (indicator.length > 0) return false;

    // No value indicator found → treat as bool flag (best-effort heuristic)
    return true;
  }

  private static extractDefault(description: string): string | undefined {
    const patterns = [
      /\[default[:\s]+([^\]]+)\]/i,
      /\(default[:\s]+([^)]+)\)/i,
      /default[:\s]+"([^"]+)"/i,
      /default[:\s]+'([^']+)'/i,
      /default[:\s]+(\S+)/i,
    ];
    for (const re of patterns) {
      const m = description.match(re);
      if (m) return m[1].trim();
    }
    return undefined;
  }

  private static extractChoices(description: string): string[] {
    // [possible values: a, b, c]
    let m = description.match(/\[(?:possible\s+)?values?[:\s]+([^\]]+)\]/i);
    if (m) return m[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean);

    // choices: a, b, c
    m = description.match(/choices?[:\s]+([^.)\]]+)/i);
    if (m) return m[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean);

    // {a|b|c}
    m = description.match(/\{([^}]+)\}/);
    if (m) {
      const parts = m[1].split(/[,|]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }

    // [a|b|c] — square bracket pipe-separated (Click's multi-choice format)
    m = description.match(/\[([^\]]*\|[^\]]*)\]/);
    if (m) {
      const parts = m[1].split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }

    // (a|b|c)
    m = description.match(/\(([^)]+\|[^)]+)\)/);
    if (m) {
      const parts = m[1].split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }

    return [];
  }

  private static extractMetavar(line: string, flag: string): string | undefined {
    // Match: --flag=VAL or --flag <VAL> or --flag VAL (uppercase word)
    const patterns = [
      new RegExp(`${flag.replace(/[-]/g, '\\$&')}[=\\s]+<([^>]+)>`),
      new RegExp(`${flag.replace(/[-]/g, '\\$&')}=([A-Z][A-Z_0-9]+)`),
      new RegExp(`${flag.replace(/[-]/g, '\\$&')}\\s+([A-Z][A-Z_0-9]+)`),
    ];
    for (const re of patterns) {
      const m = line.match(re);
      if (m) return m[1];
    }
    return undefined;
  }

  private static isRequired(description: string): boolean {
    return /\brequired\b/i.test(description) && !/\bnot\s+required\b/i.test(description);
  }

  private static isMultiple(description: string): boolean {
    return /\b(multiple|repeat|more than once|can be used multiple times|nargs\s*[=:]\s*[*+])\b/i.test(description);
  }

  private static cleanDescription(description: string): string {
    return description
      .replace(/\[default[:\s]+[^\]]+\]/gi, '')
      .replace(/\(default[:\s]+[^)]+\)/gi, '')
      .replace(/\[possible values?[:\s]+[^\]]+\]/gi, '')
      .trim()
      .replace(/\s{2,}/g, ' ');
  }

  // ── Positional argument parsing ──────────────────────────────────────────

  private static parsePositionals(helpText: string): ArgumentInfo[] {
    const results: ArgumentInfo[] = [];

    // Look for usage line: "usage: prog [options] <INPUT> OUTPUT"
    const usageMatch = helpText.match(/usage:\s+\S+\s+(.*)/i);
    if (!usageMatch) return results;

    const usagePart = usageMatch[1];
    // Find angle-bracket or uppercase words not preceded by --
    const positionalRegex = /<([^>]+)>|(?<![a-z-])([A-Z][A-Z_0-9]{1,})\b(?!\s*=)/g;
    let m: RegExpExecArray | null;

    while ((m = positionalRegex.exec(usagePart)) !== null) {
      const name = (m[1] ?? m[2]).toLowerCase();
      // Skip common noise
      if (['options', 'args', 'arguments', 'flags', 'command', 'cmd'].includes(name)) continue;
      results.push({
        name,
        aliases: [],
        positional: true,
        type: 'string',
        required: !usagePart.slice(m.index - 1, m.index).includes('['),
        isFlag: false,
        multiple: false,
      });
    }

    return results;
  }

  // ── Subcommand parsing ───────────────────────────────────────────────────

  private static parseSubcommands(lines: string[]): SubcommandInfo[] {
    const results: SubcommandInfo[] = [];

    // Find sections like "SUBCOMMANDS:", "Commands:", "Available commands:"
    let inSubcommandSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^(?:SUBCOMMANDS?|[Cc]ommands?|[Aa]vailable\s+[Cc]ommands?)\s*:/m.test(line)) {
        inSubcommandSection = true;
        continue;
      }

      if (inSubcommandSection) {
        // End of section: blank + non-indented line, or new heading
        if (!line.startsWith(' ') && line.trim() && !/^\s/.test(line)) {
          inSubcommandSection = false;
          continue;
        }

        // Parse "  subcommand   description" lines
        const subMatch = line.match(/^\s{1,6}(\w[\w-]*)(?:\s{2,}(.*))?$/);
        if (subMatch) {
          results.push({
            name: subMatch[1],
            description: subMatch[2]?.trim(),
            arguments: [],
          });
        }
      }
    }

    return results;
  }
}
