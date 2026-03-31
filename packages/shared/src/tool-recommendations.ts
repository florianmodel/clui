export interface CuratedTool {
  owner: string;
  repo: string;
  icon: string;
  description: string;
  why: string;
  keywords: string[];
}

export const CURATED_TOOLS: CuratedTool[] = [
  {
    owner: 'FFmpeg', repo: 'FFmpeg',
    icon: '🎬',
    description: 'The leading multimedia framework for decoding, encoding, transcoding, muxing, streaming and filtering audio and video.',
    why: 'Industry-standard video and audio processing that handles virtually every format.',
    keywords: ['video', 'ffmpeg', 'compress', 'transcode', 'convert', 'mp4', 'mkv', 'avi', 'mov', 'h264', 'h265', 'hevc', 'encode', 'decode', 'stream', 'clip', 'trim', 'cut', 'merge', 'audio', 'mp3', 'aac', 'gif', 'webm'],
  },
  {
    owner: 'yt-dlp', repo: 'yt-dlp',
    icon: '📺',
    description: 'A youtube-dl fork with additional features and fixes for downloading videos from YouTube and thousands of sites.',
    why: 'Reliable video downloader supporting many sites including YouTube, Vimeo, Twitter, and TikTok.',
    keywords: ['download', 'youtube', 'video', 'yt', 'yt-dlp', 'ytdl', 'vimeo', 'twitter', 'instagram', 'tiktok', 'twitch', 'stream', 'url', 'web'],
  },
  {
    owner: 'ImageMagick', repo: 'ImageMagick',
    icon: '🖼️',
    description: 'Create, edit, compose, or convert digital images. Resize, flip, mirror, rotate, distort, shear and transform images.',
    why: 'Swiss-army knife for image processing with strong batch resize and conversion workflows.',
    keywords: ['image', 'photo', 'resize', 'convert', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'bmp', 'svg', 'thumbnail', 'crop', 'rotate', 'compress', 'magick', 'batch'],
  },
  {
    owner: 'openai', repo: 'whisper',
    icon: '🎤',
    description: 'Automatic speech recognition (ASR) system trained on multilingual and multitask supervised data.',
    why: 'Excellent transcription for turning audio or video into text or subtitles.',
    keywords: ['transcribe', 'transcription', 'speech', 'audio', 'voice', 'subtitle', 'caption', 'srt', 'whisper', 'recognize', 'recognition', 'text', 'mp3', 'wav', 'translate'],
  },
  {
    owner: 'jgm', repo: 'pandoc',
    icon: '📝',
    description: 'Universal document converter that handles Markdown, HTML, LaTeX, Word, PDF, and more.',
    why: 'The go-to tool for converting documents between common text formats.',
    keywords: ['document', 'convert', 'markdown', 'html', 'pdf', 'word', 'docx', 'latex', 'epub', 'pandoc', 'text', 'rst', 'asciidoc', 'format'],
  },
  {
    owner: 'tesseract-ocr', repo: 'tesseract',
    icon: '🔍',
    description: 'An OCR engine with support for 100+ languages. Extracts text from images and scanned documents.',
    why: 'Strong fit for extracting readable text from images, scanned PDFs, or screenshots.',
    keywords: ['ocr', 'text', 'extract', 'scan', 'image', 'pdf', 'tesseract', 'recognize', 'recognition', 'handwriting', 'document', 'read'],
  },
  {
    owner: 'Stirling-Tools', repo: 'Stirling-PDF',
    icon: '📄',
    description: 'A powerful locally hosted PDF toolkit that can split, merge, convert, and edit PDFs.',
    why: 'All-in-one PDF toolkit for merging, splitting, compressing, rotating, and converting PDFs.',
    keywords: ['pdf', 'merge', 'split', 'compress', 'rotate', 'convert', 'extract', 'pages', 'watermark', 'encrypt', 'decrypt', 'password', 'document'],
  },
  {
    owner: 'py-pdf', repo: 'pypdf',
    icon: '📑',
    description: 'A pure-python PDF library capable of splitting, merging, cropping, and transforming PDF pages.',
    why: 'Simple and reliable PDF manipulation for splitting, merging, and extracting pages.',
    keywords: ['pdf', 'merge', 'split', 'extract', 'pages', 'crop', 'rotate', 'python', 'pypdf'],
  },
  {
    owner: 'HandBrake', repo: 'HandBrake',
    icon: '📦',
    description: 'An open-source video transcoder that converts videos into modern, widely supported codecs.',
    why: 'Great for compressing large video files while keeping quality reasonable.',
    keywords: ['video', 'compress', 'transcode', 'encode', 'h264', 'h265', 'mp4', 'mkv', 'handbrake', 'reduce', 'size', 'quality', 'bluray', 'dvd'],
  },
  {
    owner: 'lovell', repo: 'sharp',
    icon: '⚡',
    description: 'High-performance Node.js image processing for resizing, converting, and manipulating images.',
    why: 'Blazing-fast image resizing and format conversion for batch workflows.',
    keywords: ['image', 'resize', 'convert', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'sharp', 'thumbnail', 'batch', 'optimize', 'compress'],
  },
  {
    owner: 'svg', repo: 'svgo',
    icon: '🎨',
    description: 'SVG Optimizer, a Node.js tool for removing redundant SVG metadata and markup.',
    why: 'A good fit for reducing SVG file sizes without visible quality loss.',
    keywords: ['svg', 'optimize', 'compress', 'minify', 'vector', 'image', 'clean', 'reduce', 'size'],
  },
  {
    owner: 'mozilla', repo: 'mozjpeg',
    icon: '🖼️',
    description: 'Mozilla JPEG encoder improvements that produce smaller JPEG files at the same visual quality.',
    why: 'Excellent for shrinking JPEG file sizes for the web.',
    keywords: ['jpeg', 'jpg', 'compress', 'optimize', 'image', 'web', 'size', 'reduce', 'quality', 'mozjpeg'],
  },
  {
    owner: 'kornelski', repo: 'gifski',
    icon: '🎞️',
    description: 'GIF encoder based on pngquant that produces high-quality GIFs from video frames.',
    why: 'Strong choice for making smooth, high-quality GIFs from video clips.',
    keywords: ['gif', 'animate', 'animation', 'convert', 'video', 'frames', 'gifski', 'create'],
  },
  {
    owner: 'bbc', repo: 'audiowaveform',
    icon: '🔊',
    description: 'Generate waveform data and images from audio files such as MP3, WAV, FLAC, OGG, and OPUS.',
    why: 'Good for turning audio into waveform images or peak data.',
    keywords: ['audio', 'waveform', 'visualize', 'mp3', 'wav', 'flac', 'ogg', 'image', 'peaks', 'sound'],
  },
  {
    owner: 'saulpw', repo: 'visidata',
    icon: '📊',
    description: 'An interactive multitool for exploring, cleaning, and converting CSV, JSON, Excel, and more.',
    why: 'A good fit for inspecting and converting tabular data files quickly.',
    keywords: ['data', 'csv', 'json', 'excel', 'table', 'explore', 'convert', 'clean', 'tsv', 'spreadsheet', 'filter', 'sort'],
  },
  {
    owner: 'aristocratos', repo: 'btop',
    icon: '📈',
    description: 'Resource monitor showing processor, memory, disk, network, and process stats.',
    why: 'Useful when the goal is watching live system resource usage.',
    keywords: ['monitor', 'system', 'cpu', 'memory', 'disk', 'network', 'process', 'resource', 'performance', 'stats'],
  },
  {
    owner: 'nicowillis', repo: 'croc',
    icon: '🐊',
    description: 'Easily and securely send things from one computer to another.',
    why: 'Simple, fast, and encrypted file transfer between two computers.',
    keywords: ['transfer', 'send', 'file', 'share', 'network', 'receive', 'copy', 'croc', 'peer'],
  },
  {
    owner: 'BurntSushi', repo: 'ripgrep',
    icon: '🔎',
    description: 'A line-oriented search tool that recursively searches directories for a regex pattern.',
    why: 'Extremely fast search across files when you need to find text in a folder.',
    keywords: ['search', 'grep', 'find', 'text', 'regex', 'files', 'directory', 'ripgrep', 'rg', 'pattern'],
  },
];

function tokenize(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input.join(' ') : input;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

export function findCuratedToolMatches(query: string | string[], limit = 3): CuratedTool[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = CURATED_TOOLS.map((tool) => {
    let score = 0;
    const haystack = [
      tool.repo.toLowerCase(),
      tool.owner.toLowerCase(),
      tool.description.toLowerCase(),
      tool.why.toLowerCase(),
    ].join(' ');

    for (const token of tokens) {
      if (tool.keywords.includes(token)) {
        score += 4;
      } else if (tool.keywords.some((keyword) => keyword.startsWith(token) || token.startsWith(keyword))) {
        score += 2;
      }

      if (tool.repo.toLowerCase().includes(token)) {
        score += 3;
      } else if (haystack.includes(token)) {
        score += 1;
      }
    }

    return { tool, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.tool);
}

export function friendlyProjectName(repo: string): string {
  return repo.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getToolIconForRepo(repo: string): string {
  const lower = repo.toLowerCase();
  if (lower.includes('ffmpeg') || lower.includes('video')) return '🎬';
  if (lower.includes('image') || lower.includes('magick')) return '🖼️';
  if (lower.includes('pdf')) return '📄';
  if (lower.includes('audio') || lower.includes('mp3')) return '🎵';
  if (lower.includes('yt') || lower.includes('youtube')) return '📺';
  if (lower.includes('pandoc') || lower.includes('doc')) return '📝';
  if (lower.includes('zip') || lower.includes('compress')) return '📦';
  return '⚙️';
}
