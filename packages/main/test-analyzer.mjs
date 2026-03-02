// Quick smoke-test for the Analyzer across 4 real repos.
// Run with: node packages/main/test-analyzer.mjs
import { Analyzer } from './dist/analyzer/index.js';
import { DockerManager } from './dist/docker/index.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS = '/Users/flo/Documents/Development/.gui-bridge/test-repos';
const SCRIPTS = path.join(__dirname, 'src/analyzer/analyzer-scripts');

const TESTS = [
  { name: 'yt-dlp   (Python/argparse)', repo: `${REPOS}/yt-dlp`,  image: 'gui-bridge/yt-dlp'  },
  { name: 'black    (Python/click)',     repo: `${REPOS}/black`,    image: 'gui-bridge/black'    },
  { name: 'typer    (Python/typer)',     repo: `${REPOS}/typer`,    image: 'gui-bridge/typer'    },
  { name: 'ripgrep  (Rust/--help)',      repo: `${REPOS}/ripgrep`,  image: 'gui-bridge/ripgrep'  },
];

const docker = new DockerManager();
const analyzer = new Analyzer(docker, SCRIPTS);

for (const t of TESTS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${t.name}`);
  console.log(`${'='.repeat(60)}`);

  const start = Date.now();
  try {
    const dump = await analyzer.analyze(t.repo, t.image);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`  method      : ${dump.introspectionMethod}`);
    console.log(`  language    : ${dump.stack.language}`);
    console.log(`  framework   : ${dump.stack.framework}`);
    console.log(`  entrypoint  : ${dump.stack.entrypoint ?? '(none)'} [confidence ${dump.stack.entrypointConfidence}]`);
    console.log(`  key files   : ${dump.stack.keyFiles.join(', ')}`);
    console.log(`  args        : ${dump.arguments.length}`);
    console.log(`  subcommands : ${dump.subcommands.length}`);
    console.log(`  readme desc : ${(dump.readme.description ?? '(none)').slice(0, 80)}`);
    console.log(`  warnings    : ${dump.warnings.length > 0 ? dump.warnings.join('; ') : '(none)'}`);
    console.log(`  time        : ${elapsed}s`);

    if (dump.arguments.length > 0) {
      console.log(`\n  Top 5 arguments:`);
      for (const a of dump.arguments.slice(0, 5)) {
        const extra = [
          a.isFlag ? 'flag' : `type:${a.type}`,
          a.default ? `default:${a.default}` : '',
          a.choices ? `choices:[${a.choices.slice(0,3).join('|')}${a.choices.length>3?'...':''}]` : '',
        ].filter(Boolean).join(' ');
        console.log(`    ${a.name.padEnd(30)} ${extra}`);
      }
    }

    if (dump.subcommands.length > 0) {
      console.log(`\n  First 5 subcommands: ${dump.subcommands.slice(0,5).map(s=>s.name).join(', ')}`);
    }

    if (dump.helpText) {
      console.log(`\n  --help (first 200 chars):\n  ${dump.helpText.slice(0,200).replace(/\n/g,'\n  ')}`);
    }

  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
}
console.log('\n');
