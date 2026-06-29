import readline from 'node:readline/promises';

export function createAsk({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output });
  async function ask(question, { default: def, validate, choices } = {}) {
    const suffix = def ? ` [${def}]` : choices ? ` (${choices.join('/')})` : '';
    for (;;) {
      const raw = await rl.question(`${question}${suffix}: `);
      const answer = (raw.trim() || def || '');
      if (choices && answer && !choices.includes(answer)) {
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
