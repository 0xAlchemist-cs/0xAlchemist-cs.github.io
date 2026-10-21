import { parseArgs } from 'node:util';
import {
  prepareShareArt,
  composeShareArt,
  approveShareArt,
  reviewShareArt,
} from './share-art-workflow';
import type { ShareArtTarget } from '../src/lib/share-art';

const help = `Codex share-art author workflow (no model/network calls in this CLI)
  prepare blog/<slug>|projects/<slug> --out reports/share-art/<new-version>
  compose --bundle <directory> --artwork <image> --brief <markdown> --layout <json> --tool image_gen [--alt <description>] [--model <actual-model-name>]
  approve --candidate <directory> --confirmation <explicit-author-record>
  review blog/<slug>|projects/<slug> --confirmation <explicit-author-record>

Read the complete prepared input with Codex, generate artwork using its built-in
image tool, then compose and preview the exact PNG before requesting approval.
Candidate creation, final image approval and merge approval are separate steps.`;

function target(value: string | undefined): ShareArtTarget {
  const match = /^(blog|projects)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
    value ?? '',
  );
  if (!match)
    throw new Error('Target required: blog/<slug> or projects/<slug>');
  return { kind: match[1] as ShareArtTarget['kind'], slug: match[2]! };
}

try {
  const { values, positionals, tokens } = parseArgs({
    allowPositionals: true,
    tokens: true,
    options: {
      help: { type: 'boolean' },
      out: { type: 'string' },
      bundle: { type: 'string' },
      artwork: { type: 'string' },
      brief: { type: 'string' },
      layout: { type: 'string' },
      tool: { type: 'string' },
      alt: { type: 'string' },
      model: { type: 'string' },
      candidate: { type: 'string' },
      confirmation: { type: 'string' },
    },
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name))
      throw new Error(`Duplicate option: --${token.name}`);
    seen.add(token.name);
  }
  if (values.help) {
    console.log(help);
  } else {
    const command = positionals[0] ?? '';
    const allowed: Record<string, string[]> = {
      prepare: ['out'],
      compose: ['bundle', 'artwork', 'brief', 'layout', 'tool', 'alt', 'model'],
      approve: ['candidate', 'confirmation'],
      review: ['confirmation'],
    };
    if (!allowed[command])
      throw new Error(`Unknown command: ${command || '(missing)'}; use --help`);
    for (const key of seen)
      if (!allowed[command]!.includes(key))
        throw new Error(`Unknown option for ${command}: --${key}`);
    const required = (key: keyof typeof values): string => {
      const value = values[key];
      if (typeof value !== 'string' || !value.trim())
        throw new Error(`--${key} is required`);
      return value;
    };
    const positionalCount =
      command === 'prepare' || command === 'review' ? 2 : 1;
    if (positionals.length !== positionalCount)
      throw new Error(`Unexpected or missing target for ${command}`);
    if (command === 'prepare')
      console.log(
        await prepareShareArt(target(positionals[1]), required('out')),
      );
    else if (command === 'compose')
      console.log(
        await composeShareArt({
          bundle: required('bundle'),
          artwork: required('artwork'),
          brief: required('brief'),
          layout: required('layout'),
          tool: required('tool'),
          ...(values.alt === undefined ? {} : { alt: values.alt }),
          ...(values.model === undefined ? {} : { model: values.model }),
        }),
      );
    else {
      const result =
        command === 'approve'
          ? await approveShareArt(
              required('candidate'),
              required('confirmation'),
            )
          : await reviewShareArt(
              target(positionals[1]),
              required('confirmation'),
            );
      console.log(
        JSON.stringify(
          {
            target: result.target,
            image: result.image,
            sourceDigest: result.sourceDigest,
            approval: result.approval,
          },
          null,
          2,
        ),
      );
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Share-art command failed',
  );
  process.exitCode = 1;
}
