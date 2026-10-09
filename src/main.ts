import { SimulationPhysicsEngine } from './physics/engine';
import { Viewport3D } from './view/viewport';
import { Robot3DRenderer } from './view/robot-renderer';
import { VirtualSensorManager } from './sensors/sensor-manager';
import { VirtualSpikeApi } from './runtime/spike-api';
import { PythonScriptRunner } from './runtime/python-runner';
import { SimulatorHud } from './ui/hud';
import { LDrawImporter } from './cad/ldraw-importer';

async function bootstrapSimulator() {
  const viewportContainer = document.getElementById('viewport-container');
  if (!viewportContainer) {
    throw new Error('Viewport container element not found');
  }

  // 1. Initialize Rapier3D Physics Engine
  const engine = new SimulationPhysicsEngine();
  await engine.init();

  // 2. Initialize Three.js WebGL Viewport
  const viewport = new Viewport3D(viewportContainer);

  // 3. Initialize Sensor Manager & Hook to Competition Mat
  const sensors = new VirtualSensorManager(engine.robot);
  sensors.setMatSampler(viewport.matTexture);

  // 4. Initialize 3D Robot Visual Representation
  const robotRenderer = new Robot3DRenderer();
  robotRenderer.setSensorManager(sensors);
  viewport.scene.add(robotRenderer.rootGroup);

  // 5. Initialize Virtual SPIKE Prime API & Python Runner
  let api = new VirtualSpikeApi(engine, sensors);
  let runner = new PythonScriptRunner(api);

  // 6. Initialize Simulator HUD & Controls
  const hud = new SimulatorHud(document.body, {
    onRunScript: async (code: string) => {
      hud.logConsole('Executing SPIKE Python script...');
      try {
        await runner.execute(code, (msg) => hud.logConsole(msg));
        hud.setExecutionState('IDLE');
        hud.logConsole('Script completed successfully.');
      } catch (err: any) {
        hud.setExecutionState('ERROR');
        hud.logConsole(`Runtime Error: ${err.message || err}`);
      }
    },
    onStopScript: () => {
      runner.abort();
      engine.robot.motors.get('A')?.stop();
      engine.robot.motors.get('B')?.stop();
    },
    onResetRobot: () => {
      runner.abort();
      engine.resetRobot();
      sensors.resetYaw();
    },
    onCameraChange: (preset) => {
      viewport.setCameraPreset(preset);
    },
    onImportFile: async (file: File) => {
      hud.logConsole(`Loading model "${file.name}"...`);
      try {
        let spec;
        if (file.name.endsWith('.io')) {
          const buffer = await file.arrayBuffer();
          spec = await LDrawImporter.parseStudioIo(buffer);
        } else {
          const text = await file.text();
          const parsed = LDrawImporter.parseLDrawText(text, file.name);
          const { CadClusteringPreSolver } = await import('./cad/clustering-solver');
          spec = CadClusteringPreSolver.solve(parsed);
        }

        // Re-spawn robot with imported CAD specification
        await engine.init(spec);
        hud.logConsole(`Imported "${file.name}" successfully! Clustered into ${spec.clusters.length} rigid bodies.`);
      } catch (err: any) {
        hud.logConsole(`CAD Import Failed: ${err.message || err}`);
      }
    },
  });

  // 7. Main Animation & Physics Loop
  let lastTime = performance.now();
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let currentFps = 60;

  function animate(now: number) {
    requestAnimationFrame(animate);

    const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // FPS calculation
    frameCount++;
    if (now - lastFpsUpdate >= 500) {
      currentFps = (frameCount * 1000) / (now - lastFpsUpdate);
      frameCount = 0;
      lastFpsUpdate = now;
    }

    // Physics step
    engine.update(deltaSeconds);

    // Sync visual meshes with physics bodies
    robotRenderer.syncWithPhysics(engine.robot);

    // Camera follow update
    const robotPos = engine.robot.getPosition();
    const robotYaw = engine.robot.getYawDegrees();
    viewport.updateCameraFollow(robotPos.x, robotPos.y, robotPos.z, robotYaw);

    // Render viewport
    viewport.render();

    // Push live telemetry to HUD
    const motorA = engine.robot.motors.get('A');
    const motorB = engine.robot.motors.get('B');
    const colorC = sensors.sampleColorSensor('C');
    const colorD = sensors.sampleColorSensor('D');
    const distCm = sensors.sampleDistanceSensor();

    hud.updateTelemetry({
      timeSeconds: now / 1000,
      matchTimerSeconds: 150,
      fps: currentFps,
      physicsHz: 60,
      robot: {
        x: robotPos.x,
        y: robotPos.y,
        z: robotPos.z,
        yawDegrees: robotYaw,
      },
      motors: {
        left: {
          port: 'A',
          degrees: Math.round(motorA?.degrees || 0),
          speed: Math.round(motorA?.velocityDegPerSec || 0),
        },
        right: {
          port: 'B',
          degrees: Math.round(motorB?.degrees || 0),
          speed: Math.round(motorB?.velocityDegPerSec || 0),
        },
      },
      sensors: {
        colorC: {
          reflectedLight: colorC.reflectedLight,
          color: colorC.color,
          rgb: colorC.rgb,
        },
        colorD: {
          reflectedLight: colorD.reflectedLight,
          color: colorD.color,
          rgb: colorD.rgb,
        },
        distanceCm: distCm,
      },
    });
  }

  requestAnimationFrame(animate);
  hud.logConsole('FLL Simulator ready! Ready to run SPIKE Prime code.');
}

bootstrapSimulator().catch((err) => {
  console.error('Fatal initialization error:', err);
});
