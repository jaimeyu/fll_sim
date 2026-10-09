import { SimulationPhysicsEngine } from './physics/engine';
import { Viewport3D } from './view/viewport';
import { Robot3DRenderer } from './view/robot-renderer';
import { VirtualSensorManager } from './sensors/sensor-manager';
import { VirtualSpikeApi } from './runtime/spike-api';
import { PythonScriptRunner } from './runtime/python-runner';
import { SimulatorHud } from './ui/hud';
import { LDrawImporter } from './cad/ldraw-importer';
import { MissionManager } from './missions/mission-manager';
import { SandboxInteractionTool } from './sandbox/interaction-tool';

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
  viewport.setRobotVisualRoot(robotRenderer.rootGroup);

  // 5. Initialize Mission Elements Manager & Interactive Sandbox Tool
  const missionManager = new MissionManager();
  missionManager.init(engine.world, viewport.scene);

  const interactionTool = new SandboxInteractionTool();
  interactionTool.init(engine.world, viewport.scene);
  interactionTool.setActive(false); // Inactive until sandbox mode
  viewport.setInteractionTool(interactionTool);

  // 6. Initialize Virtual SPIKE Prime API & Python Runner
  let api = new VirtualSpikeApi(engine, sensors);
  let runner = new PythonScriptRunner(api);

  // Setup automatic safety sanity recovery handler
  engine.onSanityReset = (reason: string) => {
    runner.abort();
    sensors.resetYaw();
    hud.setExecutionState('ERROR');
    hud.logConsole(`⚠️ [Safety Sanity System] Robot reset to Launch Area: ${reason}`);
  };

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
      hud.setExecutionState('IDLE');
    },
    onResetRobot: () => {
      runner.abort();
      engine.robot.motors.get('A')?.stop();
      engine.robot.motors.get('B')?.stop();
      const spawnPose = hud.getSpawnPose();
      engine.resetRobot(spawnPose);
      sensors.resetYaw();
      hud.setExecutionState('IDLE');
    },
    onSpawnPoseChange: (pose) => {
      engine.setDefaultPose(pose);
    },
    onMoveRobotToPose: (pose, label) => {
      runner.abort();
      engine.robot.motors.get('A')?.stop();
      engine.robot.motors.get('B')?.stop();
      engine.resetRobot(pose);
      engine.setDefaultPose(pose);
      sensors.resetYaw();
      hud.setExecutionState('IDLE');
      hud.setSpawnPose(pose);
      const targetName = label || `(X=${pose.x.toFixed(2)}m, Z=${pose.z.toFixed(2)}m, Yaw=${pose.yawDegrees.toFixed(1)}°)`;
      hud.logConsole(`⏹ Stopped run and relocated robot to: ${targetName}`);
    },
    onCaptureCurrentPose: () => {
      const pos = engine.robot.getPosition();
      const yaw = engine.robot.getYawDegrees();
      const pose = {
        x: Number(pos.x.toFixed(2)),
        y: 0.035,
        z: Number(pos.z.toFixed(2)),
        yawDegrees: Number(yaw.toFixed(1)),
      };
      hud.setSpawnPose(pose);
      engine.setDefaultPose(pose);
      hud.logConsole(`📌 Captured current pose: X=${pose.x}m, Z=${pose.z}m, Yaw=${pose.yawDegrees}°`);
    },
    onCameraChange: (preset) => {
      viewport.setCameraPreset(preset);
    },
    onMapChange: async (mapType) => {
      hud.logConsole(`Loading map "${mapType}"...`);
      await viewport.matTexture.loadMap(mapType);
      hud.logConsole(`Map updated.`);
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
    onModeChange: (mode) => {
      missionManager.setMode(mode);
      if (mode === 'ARENA') {
        interactionTool.setActive(false);
        viewport.setCameraPreset('ISO');
        hud.logConsole('Switched to Competition Arena (4x8 ft mat).');
      } else {
        interactionTool.setActive(true);
        viewport.focusOnElement({ x: 0, y: 0.05, z: 0 });
        hud.logConsole(`Switched to Sandbox Mode. Mouse pusher tool active.`);
      }
    },
    onTogglePusherTool: (active) => {
      interactionTool.setActive(active);
    },
    onSpawnTestBlock: () => {
      interactionTool.spawnTestBlock();
    },
    onToggleDynoMode: (active) => {
      engine.setRobotStationary(active);
    },
    onResetMission: () => {
      missionManager.resetCurrent();
      interactionTool.resetAll();
    },
  });

  // Initialize HUD spawn inputs with default pose
  hud.setSpawnPose(engine.getDefaultPose());

  // Hook 3D Viewport Interactive Drag-and-Drop Placement
  viewport.onRobotDragStart = () => {
    runner.abort();
    engine.robot.motors.get('A')?.stop();
    engine.robot.motors.get('B')?.stop();
    hud.setExecutionState('IDLE');
  };

  viewport.onRobotDragMove = (x: number, z: number) => {
    const currentPose = hud.getSpawnPose();
    const livePose = {
      x: Number(x.toFixed(2)),
      y: 0.035,
      z: Number(z.toFixed(2)),
      yawDegrees: currentPose.yawDegrees,
    };
    // Direct physics body update under cursor: syncs meshes, wheels, proxy, and sensors accurately
    engine.resetRobot(livePose);
    viewport.updateReticleYaw(livePose.yawDegrees);
    hud.setSpawnPose(livePose);
  };

  viewport.onRobotDrop = (x: number, z: number) => {
    runner.abort();
    engine.robot.motors.get('A')?.stop();
    engine.robot.motors.get('B')?.stop();
    hud.setExecutionState('IDLE');
    const currentPose = hud.getSpawnPose();
    const newPose = {
      x: Number(x.toFixed(2)),
      y: 0.035,
      z: Number(z.toFixed(2)),
      yawDegrees: currentPose.yawDegrees,
    };
    engine.resetRobot(newPose);
    engine.setDefaultPose(newPose);
    hud.setSpawnPose(newPose);
    sensors.resetYaw();
    hud.logConsole(`📍 Robot placed at (X: ${newPose.x}m, Z: ${newPose.z}m). Spawn pose updated.`);
  };

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

    // Sync mission elements & sandbox interaction tool
    missionManager.update(deltaSeconds);
    interactionTool.syncVisuals();

    // Update active mission element score chip in HUD
    const activeElem = missionManager.getActiveElement();
    if (activeElem) {
      hud.updateMissionScore(activeElem.getScore(), activeElem.isSolved());
    }

    // Camera follow update and live hit proxy synchronization
    const robotPos = engine.robot.getPosition();
    const robotYaw = engine.robot.getYawDegrees();
    viewport.updateCameraFollow(robotPos.x, robotPos.y, robotPos.z, robotYaw);
    viewport.updateRobotHitProxy(robotPos.x, robotPos.y, robotPos.z);

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
