import readline from 'node:readline';

export function createAsk({ input = process.stdin, output = process.stdout } = {}) {
  // terminal:false + a hand-rolled line queue so buffered/piped input is never dropped. Relying on
  // readline/promises' rl.question() in a loop races against 'line' events that arrive between
  // questions (all-at-once piped input), silently swallowing answers. Queueing every line as it
  // arrives and handing it out on demand makes the wizard work the same interactively or piped.
  const rl = readline.createInterface({ input, output, terminal: false });
  const lines = [];     // input lines received but not yet consumed
  const waiters = [];   // resolvers awaiting the next line
  let closed = false;

  rl.on('line', (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });

  function nextLine() {
    if (lines.length) return Promise.resolve(lines.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  }

  async function ask(question, { default: def, validate, choices } = {}) {
    // Show choices AND the default together when both are set, e.g. "(prod/dev) [dev]".
    const parts = [];
    if (choices) parts.push(`(${choices.join('/')})`);
    if (def) parts.push(`[${def}]`);
    const suffix = parts.length ? ` ${parts.join(' ')}` : '';
    for (;;) {
      output.write(`${question}${suffix}: `);
      const raw = await nextLine();
      if (raw === null) return def || ''; // input exhausted (EOF / non-interactive): best-effort default
      const answer = (raw.trim() || def || '');
      // For a choices prompt, a blank answer with no default is invalid (must match a choice),
      // so check membership unconditionally rather than skipping it when `answer` is empty.
      if (choices && !choices.includes(answer)) {
        output.write(`  must be one of: ${choices.join(', ')}\n`);
        continue;
      }
      if (validate) {
        const err = validate(answer);
        if (err) { output.write(`  ${err}\n`); continue; }
      }
      return answer;
    }
  }
  ask.close = () => rl.close();
  return ask;
}
