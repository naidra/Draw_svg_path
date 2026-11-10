import { buildD, parsePathData } from './path';

const ARGUMENT_COUNTS: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};
const TOKEN = /[a-df-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi;

export function prepareAnimationPath(value: string) {
  const data = value.trim();
  if (!data) return { data: '', signature: '', error: null };

  try {
    if (data.replace(TOKEN, '').replace(/[\s,]/g, '')) {
      throw new Error('Enter SVG path data only, without SVG markup.');
    }
    const tokens = data.match(TOKEN) ?? [];
    if (!/^[Mm]$/.test(tokens[0] ?? '')) {
      throw new Error('Start the path with M or m and a pair of coordinates.');
    }
    let index = 0;
    while (index < tokens.length) {
      const command = tokens[index++].toUpperCase();
      const count = ARGUMENT_COUNTS[command];
      if (count === undefined) throw new Error(`Unsupported path command: ${command}.`);
      const numbers: number[] = [];
      while (index < tokens.length && !/^[a-z]$/i.test(tokens[index])) {
        numbers.push(Number(tokens[index++]));
      }
      if (numbers.some((number) => !Number.isFinite(number))) {
        throw new Error('Coordinates must be finite numbers.');
      }
      if (count === 0 ? numbers.length !== 0 : !numbers.length || numbers.length % count !== 0) {
        throw new Error(`${command} needs ${count} ${count === 1 ? 'number' : 'numbers'} per segment.`);
      }
      if (command === 'A') {
        for (let offset = 0; offset < numbers.length; offset += count) {
          if (numbers[offset] < 0 || numbers[offset + 1] < 0) {
            throw new Error('Arc radii must be zero or greater.');
          }
          if (![0, 1].includes(numbers[offset + 3]) || ![0, 1].includes(numbers[offset + 4])) {
            throw new Error('Arc flags must be 0 or 1.');
          }
        }
      }
    }
    const segments = parsePathData(data);
    if (!segments.some((segment) => segment.type !== 'M' && segment.type !== 'Z')) {
      throw new Error('Add a drawable segment, such as L, C, Q, or A, after the move command.');
    }
    return {
      data: buildD(segments),
      signature: segments.map((segment) => segment.type).join(''),
      error: null,
    };
  } catch (error) {
    return {
      data: '',
      signature: '',
      error: error instanceof Error ? error.message : 'Invalid SVG path data.',
    };
  }
}
