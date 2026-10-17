import { describe, it, expect } from 'vitest';
import { PythonScriptRunner } from '../src/runtime/python-runner';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';

async function createRunner() {
  const engine = new SimulationPhysicsEngine();
  await engine.init();
  const sensors = new VirtualSensorManager(engine.robot);
  const api = new VirtualSpikeApi(engine, sensors);
  const runner = new PythonScriptRunner(api);
  return { runner, engine, sensors, api };
}

describe('PythonScriptRunner - Stepper & Instruction Debugging', () => {
  it('correctly instruments lines in transpilePythonToJs', () => {
    const py = `
# Comment on line 2
from spike import PrimeHub, MotorPair

hub = PrimeHub()
motors = MotorPair('A', 'B')

for i in range(3):
    print(i)

while hub.motion_sensor.get_yaw_angle() < 90:
    wait_for_seconds(0.1)

if True:
    val = 1
elif False:
    val = 2
else:
    val = 3
`;
    const js = PythonScriptRunner.transpilePythonToJs(py);

    // Comments and imports should NOT be instrumented
    expect(js).not.toContain('await __traceLine(2);');
    expect(js).not.toContain('await __traceLine(3);');

    // Executable statements should have instrumentation
    expect(js).toContain('await __traceLine(5);');
    expect(js).toContain('hub = PrimeHub();');

    expect(js).toContain('await __traceLine(6);');
    expect(js).toContain("motors = MotorPair('A', 'B');");

    // Loop heads: before and inside loop
    expect(js).toContain('await __traceLine(8);');
    expect(js).toContain('for (let i = 0; i < 3; i += 1) { await __traceLine(8); await __yield();');

    expect(js).toContain('await __traceLine(9);');
    expect(js).toContain('console.log(i);');

    expect(js).toContain('await __traceLine(11);');
    expect(js).toContain('while (hub.motion_sensor.get_yaw_angle() < 90) { await __traceLine(11); await __yield();');

    expect(js).toContain('await __traceLine(14);');
    expect(js).toContain('if (true) {');

    expect(js).toContain('} else if (await __traceLine(16), (false)) {');
  });

  it('normal execution calls onLine for executed lines in sequential order', async () => {
    const { runner } = await createRunner();

    const py = `
# Line 2: comment
from spike import PrimeHub  # Line 3: import
hub = PrimeHub()           # Line 4
x = 10                     # Line 5
y = 20                     # Line 6
z = x + y                  # Line 7
`;

    const lines: number[] = [];
    await runner.execute(py, undefined, (lineNum) => {
      lines.push(lineNum);
    });

    expect(lines).toEqual([4, 5, 6, 7]);
    expect(runner.currentLine).toBe(0);
    expect(runner.isPaused).toBe(false);
    expect(runner.active).toBe(false);
  });

  it('normal execution traces loop iterations sequentially', async () => {
    const { runner } = await createRunner();

    const py = `
count = 0
for i in range(2):
    count = count + 1
`;

    const lines: number[] = [];
    await runner.execute(py, undefined, (lineNum) => {
      lines.push(lineNum);
    });

    // Line 2 is sum = 0
    // Line 3 is for loop head (before loop + inside iteration 0)
    // Line 4 is count = count + 1
    // Line 3 is for loop head (iteration 1)
    // Line 4 is count = count + 1
    expect(lines).toEqual([2, 3, 3, 4, 3, 4]);
    expect(runner.active).toBe(false);
  });

  it('starts paused and steps through instructions 1-by-1 with runner.step()', async () => {
    const { runner } = await createRunner();

    const py = `
a = 100
b = 200
c = a + b
`;

    const visitedLines: number[] = [];
    const execPromise = runner.execute(py, undefined, (l) => visitedLines.push(l), true);

    // Wait until paused at line 2
    await runner.waitForPause();

    expect(runner.active).toBe(true);
    expect(runner.isPaused).toBe(true);
    expect(runner.currentLine).toBe(2);
    expect(visitedLines).toEqual([2]);

    // Step 1 -> Line 3: b = 200
    runner.step();
    await runner.waitForPause();

    expect(runner.isPaused).toBe(true);
    expect(runner.currentLine).toBe(3);
    expect(visitedLines).toEqual([2, 3]);

    // Step 2 -> Line 4: c = a + b
    runner.step();
    await runner.waitForPause();

    expect(runner.isPaused).toBe(true);
    expect(runner.currentLine).toBe(4);
    expect(visitedLines).toEqual([2, 3, 4]);

    // Step 3 -> Completes execution
    runner.step();
    await execPromise;

    expect(runner.active).toBe(false);
    expect(runner.isPaused).toBe(false);
    expect(runner.currentLine).toBe(0);
  });

  it('pauses during continuous execution and resumes with runner.resume()', async () => {
    const { runner } = await createRunner();
    runner.stepDelayMs = 15;

    const py = `
i = 0
while i < 30:
    i = i + 1
`;

    const visitedLines: number[] = [];
    const execPromise = runner.execute(py, undefined, (l) => visitedLines.push(l));

    // Let execution start running
    await new Promise((r) => setTimeout(r, 35));
    expect(runner.active).toBe(true);
    expect(visitedLines.length).toBeGreaterThan(0);

    // Pause execution and wait until runner pauses at the next traceLine
    runner.pause();
    await runner.waitForPause();

    expect(runner.isPaused).toBe(true);
    expect(runner.active).toBe(true);

    const pausedLine = runner.currentLine;
    const countAtPause = visitedLines.length;

    // Wait further and confirm execution did not advance while paused
    await new Promise((r) => setTimeout(r, 40));
    expect(runner.currentLine).toBe(pausedLine);
    expect(visitedLines.length).toBe(countAtPause);

    // Resume execution
    runner.resume();
    expect(runner.isPaused).toBe(false);

    // Wait for script to complete
    await execPromise;

    expect(runner.active).toBe(false);
    expect(runner.isPaused).toBe(false);
    expect(runner.currentLine).toBe(0);
    expect(visitedLines.length).toBeGreaterThan(countAtPause);
  });

  it('aborts cleanly while paused', async () => {
    const { runner } = await createRunner();

    const py = `
x = 1
y = 2
z = 3
`;

    const visitedLines: number[] = [];
    const execPromise = runner.execute(py, undefined, (l) => visitedLines.push(l), true);

    await runner.waitForPause();
    expect(runner.isPaused).toBe(true);
    expect(runner.currentLine).toBe(2);

    runner.abort();
    await execPromise;

    expect(runner.active).toBe(false);
    expect(runner.isPaused).toBe(false);
    expect(runner.currentLine).toBe(0);
    expect(visitedLines).toEqual([2]);
  });

  it('aborts cleanly while stepping', async () => {
    const { runner } = await createRunner();

    const py = `
x = 10
y = 20
z = 30
`;

    const visitedLines: number[] = [];
    const execPromise = runner.execute(py, undefined, (l) => visitedLines.push(l), true);

    await runner.waitForPause();
    expect(runner.currentLine).toBe(2);

    // Step once to line 3
    runner.step();
    await runner.waitForPause();
    expect(runner.currentLine).toBe(3);

    // Abort while paused at line 3
    runner.abort();
    await execPromise;

    expect(runner.active).toBe(false);
    expect(runner.isPaused).toBe(false);
    expect(runner.currentLine).toBe(0);
    expect(visitedLines).toEqual([2, 3]);
  });

  it('honors stepDelayMs pacing delay during normal run', async () => {
    const { runner } = await createRunner();
    runner.stepDelayMs = 25;

    const py = `
a = 1
b = 2
c = 3
`;

    const t0 = Date.now();
    await runner.execute(py);
    const elapsed = Date.now() - t0;

    // 3 statements * ~25ms delay >= 70ms
    expect(elapsed).toBeGreaterThanOrEqual(65);
    expect(runner.active).toBe(false);
  });
});
