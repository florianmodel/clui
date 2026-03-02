import { describe, it, expect } from 'vitest';
import { HelpParser } from '../introspectors/HelpParser.js';

// ── Sample --help outputs ──────────────────────────────────────────────────

const RIPGREP_HELP = `
ripgrep 14.1.0

USAGE:
    rg [OPTIONS] PATTERN [PATH ...]
    rg [OPTIONS] -e PATTERN ... [PATH ...]
    rg [OPTIONS] -f PATTERNFILE ... [PATH ...]

OPTIONS:
    -A, --after-context <NUM>
            Show NUM lines after each match. [default: 0]

    -B, --before-context <NUM>
            Show NUM lines before each match. [default: 0]

    -c, --count
            Only print a count of matching lines per file.

    -e, --regexp <PATTERN>
            A pattern to search for. This option can be provided multiple times.

    -i, --ignore-case
            Searches case insensitively.

    -l, --files-with-matches
            Only print the paths of files that contain matches.

    -o, --only-matching
            Print only matched parts of each line.

    --type <TYPE>
            Only search files matching TYPE. [possible values: c, cpp, go, js, py, rust]

    -n, --line-number
            Show line numbers (1-based). This is enabled by default.

    --max-depth <NUM>
            Limit the depth of directory traversal to NUM levels beyond the command line argument.

    -v, --invert-match
            Invert matching. Show lines that don't match the given patterns.
`;

const BLACK_HELP = `
Usage: black [OPTIONS] SRC ...

  The uncompromising code formatter.

Options:
  -c, --code TEXT                     Format the code passed in as a string.
  -l, --line-length INTEGER           How many characters per line to allow.
                                      [default: 88]
  -t, --target-version [py33|py34|py35|py36|py37|py38|py39|py310|py311|py312]
                                      Python versions that should be supported
                                      by Black's output.
  --pyi                               Format all input files like typing stubs
                                      regardless of file extension.
  --ipynb                             Format all input files like Jupyter
                                      Notebooks regardless of file extension.
  -S, --skip-string-normalization     Don't normalize string quotes or
                                      prefixes.
  -C, --no-magic-trailing-comma       Don't use trailing commas as a reason to
                                      split lines.
  --check                             Don't write the files back, just return
                                      the status.
  --diff                              Don't write the files back, just output a
                                      diff for each file on stdout.
  --color / --no-color                Show colored diff. Only applies when
                                      --diff is also given.
  -q, --quiet                         Stop emitting all non-critical output.
  -v, --verbose                       Also emit messages to stderr about files
                                      that were not changed.
  --version                           Show the version and exit.
  -h, --help                          Show this message and exit.
`;

const SUBCOMMAND_HELP = `
Usage: tool [OPTIONS] COMMAND [ARGS]...

  A CLI tool with subcommands.

Options:
  --verbose  Enable verbose output.
  --version  Show the version and exit.
  --help     Show this message and exit.

Commands:
  build    Build the project.
  deploy   Deploy to production.
  test     Run the test suite.
`;

const PANDOC_HELP = `
pandoc [OPTIONS] [FILES]

Input formats:  commonmark, docbook, docx, epub, html, json, latex,
                markdown, mediawiki, odt, org, rst, textile
Output formats: asciidoc, beamer, context, docx, epub, html, html5,
                json, latex, man, markdown, odt, opendocument, org,
                pdf, plain, revealjs, rst, rtf, s5, texinfo, textile

Options:
  -f FORMAT, --from=FORMAT  Specify input format.
  -t FORMAT, --to=FORMAT    Specify output format.
  -o FILE, --output=FILE    Write output to FILE instead of stdout.
  -s, --standalone          Produce a standalone document.
  --data-dir=DIRECTORY      Specify the user data directory to search for
                            pandoc data files.
  --verbose                 Give verbose debugging output.
  -q, --quiet               Suppress warnings.
  --fail-if-warnings        Exit with error status if there are any warnings.
  -N, --number-sections     Number section headings in LaTeX, ConTeXt, HTML,
                            or EPUB output.
  --highlight-style=STYLE   Specifies the coloring style to be used in
                            highlighted source code. [default: pygments]
`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HelpParser', () => {
  describe('ripgrep', () => {
    it('detects short and long flag aliases', () => {
      const { arguments: args } = HelpParser.parse(RIPGREP_HELP);
      const afterCtx = args.find((a) => a.name === '--after-context');
      expect(afterCtx).toBeDefined();
      expect(afterCtx?.aliases).toContain('-A');
    });

    it('extracts numeric type from NUM metavar', () => {
      const { arguments: args } = HelpParser.parse(RIPGREP_HELP);
      const afterCtx = args.find((a) => a.name === '--after-context');
      expect(afterCtx?.type).toBe('int');
    });

    it('extracts default value', () => {
      const { arguments: args } = HelpParser.parse(RIPGREP_HELP);
      const afterCtx = args.find((a) => a.name === '--after-context');
      expect(afterCtx?.default).toBe('0');
    });

    it('identifies --count as a bool flag', () => {
      const { arguments: args } = HelpParser.parse(RIPGREP_HELP);
      const count = args.find((a) => a.name === '--count');
      expect(count?.isFlag).toBe(true);
      expect(count?.type).toBe('bool');
    });

    it('extracts choices from [possible values: ...]', () => {
      const { arguments: args } = HelpParser.parse(RIPGREP_HELP);
      const typeArg = args.find((a) => a.name === '--type');
      expect(typeArg?.choices).toContain('rust');
      expect(typeArg?.type).toBe('choice');
    });
  });

  describe('black', () => {
    it('parses --line-length as INTEGER type', () => {
      const { arguments: args } = HelpParser.parse(BLACK_HELP);
      const ll = args.find((a) => a.name === '--line-length');
      expect(ll).toBeDefined();
      expect(ll?.type).toBe('int');
    });

    it('extracts default 88 for line-length', () => {
      const { arguments: args } = HelpParser.parse(BLACK_HELP);
      const ll = args.find((a) => a.name === '--line-length');
      expect(ll?.default).toBe('88');
    });

    it('identifies --check as a bool flag', () => {
      const { arguments: args } = HelpParser.parse(BLACK_HELP);
      const check = args.find((a) => a.name === '--check');
      expect(check?.isFlag).toBe(true);
    });

    it('extracts target-version choices', () => {
      const { arguments: args } = HelpParser.parse(BLACK_HELP);
      const tv = args.find((a) => a.name === '--target-version');
      expect(tv?.choices).toBeDefined();
      expect(tv?.choices?.length).toBeGreaterThan(3);
    });
  });

  describe('subcommand parsing', () => {
    it('detects Commands: section', () => {
      const { subcommands } = HelpParser.parse(SUBCOMMAND_HELP);
      expect(subcommands.length).toBe(3);
      expect(subcommands.map((s) => s.name)).toContain('build');
      expect(subcommands.map((s) => s.name)).toContain('deploy');
      expect(subcommands.map((s) => s.name)).toContain('test');
    });

    it('captures subcommand descriptions', () => {
      const { subcommands } = HelpParser.parse(SUBCOMMAND_HELP);
      const build = subcommands.find((s) => s.name === 'build');
      expect(build?.description).toContain('Build');
    });
  });

  describe('pandoc', () => {
    it('parses --from and --to with =FORMAT', () => {
      const { arguments: args } = HelpParser.parse(PANDOC_HELP);
      const from = args.find((a) => a.name === '--from' || a.name === '-f');
      expect(from).toBeDefined();
    });

    it('parses --output/-o as file type', () => {
      const { arguments: args } = HelpParser.parse(PANDOC_HELP);
      const output = args.find((a) => a.name === '--output' || a.aliases?.includes('-o'));
      expect(output).toBeDefined();
      expect(output?.type).toBe('file');
    });

    it('identifies --standalone as a flag', () => {
      const { arguments: args } = HelpParser.parse(PANDOC_HELP);
      const standalone = args.find((a) => a.name === '--standalone');
      expect(standalone?.isFlag).toBe(true);
    });

    it('extracts default for --highlight-style', () => {
      const { arguments: args } = HelpParser.parse(PANDOC_HELP);
      const hs = args.find((a) => a.name === '--highlight-style');
      expect(hs?.default).toBe('pygments');
    });
  });

  describe('edge cases', () => {
    it('returns empty arrays for empty input', () => {
      const result = HelpParser.parse('');
      expect(result.arguments).toEqual([]);
      expect(result.subcommands).toEqual([]);
    });

    it('handles input with no flags gracefully', () => {
      const result = HelpParser.parse('This is a description with no flags.');
      expect(result.arguments).toEqual([]);
    });
  });
});
