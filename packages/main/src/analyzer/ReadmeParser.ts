import * as fs from 'fs';
import * as path from 'path';
import type { ReadmeInfo } from './types.js';

const MAX_CONTENT = 4000;

/**
 * Reads the README from a repo directory and extracts structured info.
 */
export class ReadmeParser {
  static parse(repoDir: string): ReadmeInfo {
    const content = ReadmeParser.readReadme(repoDir);
    if (!content) {
      return { usageExamples: [], fullContent: '' };
    }

    const fullContent = content.slice(0, MAX_CONTENT);

    return {
      description: ReadmeParser.extractDescription(content),
      usageExamples: ReadmeParser.extractUsageExamples(content),
      installInstructions: ReadmeParser.extractInstallInstructions(content),
      fullContent,
    };
  }

  private static readReadme(repoDir: string): string | null {
    for (const name of ['README.md', 'README.rst', 'README.txt', 'README']) {
      const fp = path.join(repoDir, name);
      if (fs.existsSync(fp)) {
        try {
          return fs.readFileSync(fp, 'utf8');
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private static extractDescription(content: string): string | undefined {
    const lines = content.split('\n');
    let inParagraph = false;
    const paragraphLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip headings
      if (/^#{1,6}\s/.test(trimmed) || /^[=\-]{3,}$/.test(trimmed)) {
        if (inParagraph) break;
        continue;
      }

      // Skip badge lines (markdown image links)
      if (/!\[.*?\]\(.*?\)/.test(trimmed) || /\[!\[.*?\]\(.*?\)\]/.test(trimmed)) {
        if (inParagraph) break;
        continue;
      }

      // Skip empty lines that start or separate paragraphs
      if (!trimmed) {
        if (inParagraph && paragraphLines.length > 0) break;
        continue;
      }

      inParagraph = true;
      paragraphLines.push(trimmed);
    }

    const description = paragraphLines.join(' ').trim();
    return description.length > 10 ? description : undefined;
  }

  private static extractUsageExamples(content: string): string[] {
    const examples: string[] = [];

    // Extract fenced code blocks
    const fenceRegex = /```[^\n]*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(content)) !== null) {
      const block = match[1].trim();
      // Only include blocks that look like shell commands
      if (/(?:^\$\s|^>\s|--|\bpython\b|\bpip\b)/m.test(block)) {
        examples.push(block.slice(0, 500));  // cap per example
      }
    }

    return examples.slice(0, 10);  // max 10 examples
  }

  private static extractInstallInstructions(content: string): string | undefined {
    const installHeadingRegex = /^#{1,4}\s+.*(install|setup|getting\s+started|quickstart).*/im;
    const lines = content.split('\n');

    let startIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (installHeadingRegex.test(lines[i])) {
        startIdx = i + 1;
        break;
      }
    }

    if (startIdx === -1) return undefined;

    // Collect until next heading of same or higher level
    const collected: string[] = [];
    for (let i = startIdx; i < lines.length && collected.length < 50; i++) {
      if (/^#{1,4}\s/.test(lines[i]) && i > startIdx) break;
      collected.push(lines[i]);
    }

    const result = collected.join('\n').trim();
    return result.length > 10 ? result.slice(0, 1000) : undefined;
  }
}
