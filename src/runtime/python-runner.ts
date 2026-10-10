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
    this.api.stopAllMotors();
  }

  public static findMatchingParen(str: string, openIndex: number): number {
    let depth = 0;
    let inQuote: string | null = null;
    for (let i = openIndex; i < str.length; i++) {
      const ch = str[i];
      if ((ch === '"' || ch === "'") && (i === 0 || str[i - 1] !== '\\')) {
        if (!inQuote) inQuote = ch;
        else if (inQuote === ch) inQuote = null;
      } else if (!inQuote) {
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) return i;
        }
      }
    }
    return -1;
  }

  public static splitArguments(argsStr: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let inQuote: string | null = null;
    let start = 0;
    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if ((ch === '"' || ch === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
        if (!inQuote) inQuote = ch;
        else if (inQuote === ch) inQuote = null;
      } else if (!inQuote) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) {
          result.push(argsStr.substring(start, i).trim());
          start = i + 1;
        }
      }
    }
    const last = argsStr.substring(start).trim();
    if (last) result.push(last);
    return result;
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

      let transformed = line
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');

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
      transformed = transformed.replace(/\bcontrol\.wait_for_seconds\(/g, 'wait_for_seconds(');
      transformed = transformed.replace(/\bwait_for_seconds\(/g, 'await wait_for_seconds(');
      transformed = transformed.replace(/\btime\.sleep\(/g, 'await wait_for_seconds(');

      // Transform .start(...) with keyword arguments (e.g. steering=int(steering), speed=BASE_SPEED)
      const startCallIdx = transformed.indexOf('.start(');
      if (startCallIdx !== -1) {
        const parenOpen = startCallIdx + 6; // index of '('
        const parenClose = PythonScriptRunner.findMatchingParen(transformed, parenOpen);
        if (parenClose !== -1) {
          const argsStr = transformed.substring(parenOpen + 1, parenClose);
          const args = PythonScriptRunner.splitArguments(argsStr);
          const hasKwargs = args.some((a) => /^[a-zA-Z_]\w*\s*=/.test(a));
          if (hasKwargs) {
            const props: string[] = [];
            for (const arg of args) {
              const eqIdx = arg.indexOf('=');
              if (eqIdx !== -1) {
                const k = arg.substring(0, eqIdx).trim();
                const v = arg.substring(eqIdx + 1).trim();
                props.push(`${k}: ${v}`);
              } else {
                props.push(arg);
              }
            }
            const before = transformed.substring(0, parenOpen + 1);
            const after = transformed.substring(parenClose);
            transformed = `${before}{ ${props.join(', ')} }${after}`;
          }
        }
      }

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
    const self = this;
    const PrimeHub = () => this.api.createPrimeHub();
    const Motor = (port: any) => this.api.createMotor(port);
    const MotorPair = (l: any = 'A', r: any = 'B') => this.api.createMotorPair(l, r);
    const ColorSensor = (port: any = 'C') => this.api.createColorSensor(port);
    const DistanceSensor = () => this.api.createDistanceSensor();
    const Timer = function () {
      return self.api.createTimer();
    };
    const wait_for_seconds = async (sec: number) => {
      await this.api.wait(sec);
    };
    const time = {
      sleep: async (sec: number) => {
        await this.api.wait(sec);
      },
    };

    const control = {
      Timer: () => this.api.createTimer(),
      wait_for_seconds,
    };

    const spike = {
      PrimeHub,
      Motor,
      MotorPair,
      ColorSensor,
      DistanceSensor,
      Timer: () => this.api.createTimer(),
      control,
    };

    // Python built-in functions
    const int = (v: any) => Math.trunc(Number(v)) || 0;
    const float = (v: any) => Number(v) || 0;
    const round = (v: any, d = 0) => {
      const f = Math.pow(10, d);
      return Math.round(Number(v) * f) / f;
    };
    const abs = (v: any) => Math.abs(Number(v));
    const min = (...args: any[]) => Math.min(...(Array.isArray(args[0]) ? args[0] : args));
    const max = (...args: any[]) => Math.max(...(Array.isArray(args[0]) ? args[0] : args));
    const len = (v: any) => (v && typeof v.length === 'number' ? v.length : 0);
    const str = (v: any) => String(v);

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
        'Timer',
        'wait_for_seconds',
        'time',
        'spike',
        'control',
        'int',
        'float',
        'round',
        'abs',
        'min',
        'max',
        'len',
        'str',
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
        Timer,
        wait_for_seconds,
        time,
        spike,
        control,
        int,
        float,
        round,
        abs,
        min,
        max,
        len,
        str,
        __yield,
        { log: consoleLog }
      );
    } catch (err: any) {
      if (err.message !== 'Aborted' && err.message !== 'Simulation execution stopped by user') {
        throw err;
      }
    } finally {
      this.api.stopAllMotors();
      this.isRunning = false;
      this.abortController = null;
    }
  }
}
