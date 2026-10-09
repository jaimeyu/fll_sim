import { VirtualSpikeApi } from './spike-api';

export class PythonScriptRunner {
  private api: VirtualSpikeApi;
  private abortController: AbortController | null = null;
  private isRunning = false;

  constructor(api: VirtualSpikeApi) {
    this.api = api;
  }

  public get active(): boolean {
    return this.isRunning;
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  /**
   * Transpiles a subset of Python into async JavaScript
   */
  public static transpilePythonToJs(pyCode: string): string {
    const lines = pyCode.split(/\r?\n/);
    const outputLines: string[] = [];
    const indentStack: number[] = [0];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex];
      // Skip empty lines or pure comments
      if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
        continue;
      }

      // Calculate current indentation
      const indent = rawLine.search(/\S|$/);
      let line = rawLine.trim();

      // Strip comments (respecting string literals)
      let inQuote: string | null = null;
      let commentIdx = -1;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if ((char === '"' || char === "'") && (c === 0 || line[c - 1] !== '\\')) {
          if (!inQuote) inQuote = char;
          else if (inQuote === char) inQuote = null;
        } else if (char === '#' && !inQuote) {
          commentIdx = c;
          break;
        }
      }
      if (commentIdx !== -1) {
        line = line.substring(0, commentIdx).trimEnd();
      }
      if (!line) continue;

      // Handle closing braces when indent decreases
      while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        outputLines.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
      }

      // Skip import statements
      if (line.startsWith('import ') || line.startsWith('from ')) {
        continue;
      }

      let transformed = line;

      // Convert while loops
      if (transformed.startsWith('while ') && transformed.endsWith(':')) {
        let condition = transformed.slice(6, -1).trim();
        condition = condition.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
        outputLines.push(' '.repeat(indent) + `while (${condition}) { await __yield();`);
        indentStack.push(indent + 2);
        continue;
      }

      // Convert for i in range(...)
      const forRangeMatch = transformed.match(/^for\s+([a-zA-Z0-9_]+)\s+in\s+range\((.*?)\)\s*:/);
      if (forRangeMatch) {
        const varName = forRangeMatch[1];
        const rangeArgs = forRangeMatch[2].split(',').map((s) => s.trim());
        let init = '0', end = '0', step = '1';
        if (rangeArgs.length === 1) {
          end = rangeArgs[0];
        } else if (rangeArgs.length === 2) {
          init = rangeArgs[0];
          end = rangeArgs[1];
        } else if (rangeArgs.length === 3) {
          init = rangeArgs[0];
          end = rangeArgs[1];
          step = rangeArgs[2];
        }
        outputLines.push(' '.repeat(indent) + `for (let ${varName} = ${init}; ${varName} < ${end}; ${varName} += ${step}) { await __yield();`);
        indentStack.push(indent + 2);
        continue;
      }

      // Convert if / elif / else
      if (transformed.startsWith('if ') && transformed.endsWith(':')) {
        let condition = transformed.slice(3, -1).trim();
        condition = condition.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
        outputLines.push(' '.repeat(indent) + `if (${condition}) {`);
        indentStack.push(indent + 2);
        continue;
      }
      if (transformed.startsWith('elif ') && transformed.endsWith(':')) {
        let condition = transformed.slice(5, -1).trim();
        condition = condition.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
        // Close previous block if on same indent
        if (indentStack.length > 1) indentStack.pop();
        outputLines.push(' '.repeat(indent) + `} else if (${condition}) {`);
        indentStack.push(indent + 2);
        continue;
      }
      if (transformed === 'else:') {
        if (indentStack.length > 1) indentStack.pop();
        outputLines.push(' '.repeat(indent) + `} else {`);
        indentStack.push(indent + 2);
        continue;
      }

      // Convert Python ternary: var = val1 if cond else val2
      const ternaryMatch = transformed.match(/^([a-zA-Z0-9_]+)\s*=\s*(.*?)\s+if\s+(.*?)\s+else\s+(.*)$/);
      if (ternaryMatch) {
        const varName = ternaryMatch[1];
        const valTrue = ternaryMatch[2].trim();
        let cond = ternaryMatch[3].trim().replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
        const valFalse = ternaryMatch[4].trim();
        transformed = `${varName} = (${cond}) ? (${valTrue}) : (${valFalse})`;
      }

      // Convert Python boolean & null literals
      transformed = transformed
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');

      // Auto-await asynchronous SPIKE methods
      transformed = transformed.replace(/\b([a-zA-Z0-9_]+)\.move\(/g, 'await $1.move(');
      transformed = transformed.replace(/\b([a-zA-Z0-9_]+)\.move_tank\(/g, 'await $1.move_tank(');
      transformed = transformed.replace(/\b([a-zA-Z0-9_]+)\.run_for_degrees\(/g, 'await $1.run_for_degrees(');
      transformed = transformed.replace(/\bwait_for_seconds\(/g, 'await wait_for_seconds(');
      transformed = transformed.replace(/\btime\.sleep\(/g, 'await wait_for_seconds(');

      // Handle simple print
      transformed = transformed.replace(/\bprint\((.*?)\)/g, 'console.log($1)');

      outputLines.push(' '.repeat(indent) + transformed + ';');
    }

    // Close any remaining open braces
    while (indentStack.length > 1) {
      indentStack.pop();
      outputLines.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
    }

    return outputLines.join('\n');
  }

  /**
   * Run a SPIKE Python script asynchronously
   */
  public async execute(pyCode: string, onLog?: (msg: string) => void): Promise<void> {
    this.abortController = new AbortController();
    this.isRunning = true;

    const signal = this.abortController.signal;

    // Build execution context environment
    const PrimeHub = () => this.api.createPrimeHub();
    const Motor = (port: any) => this.api.createMotor(port);
    const MotorPair = (l: any, r: any) => this.api.createMotorPair(l, r);
    const ColorSensor = (port: any) => this.api.createColorSensor(port);
    const DistanceSensor = () => this.api.createDistanceSensor();
    const wait_for_seconds = async (sec: number) => {
      await this.api.wait(sec);
    };
    const time = {
      sleep: async (sec: number) => {
        await this.api.wait(sec);
      },
    };

    const __yield = async () => {
      if (signal.aborted) throw new Error('Aborted');
      await new Promise((r) => setTimeout(r, 10)); // Cooperative yield to UI
    };

    const consoleLog = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a))).join(' ');
      if (onLog) onLog(msg);
      console.log(`[Robot Python]:`, ...args);
    };

    const jsCode = PythonScriptRunner.transpilePythonToJs(pyCode);

    try {
      // Execute within async function scope
      const fn = new Function(
        'PrimeHub',
        'Motor',
        'MotorPair',
        'ColorSensor',
        'DistanceSensor',
        'wait_for_seconds',
        'time',
        '__yield',
        'console',
        `return (async () => {\n${jsCode}\n})();`
      );

      await fn(
        PrimeHub,
        Motor,
        MotorPair,
        ColorSensor,
        DistanceSensor,
        wait_for_seconds,
        time,
        __yield,
        { log: consoleLog }
      );
    } catch (err: any) {
      if (err.message !== 'Aborted' && err.message !== 'Simulation execution stopped by user') {
        throw err;
      }
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }
}
