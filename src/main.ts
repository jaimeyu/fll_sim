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
import { CustomImportedMissionElement } from './missions/custom-imported-element';
import { CadModelInspector } from './ui/cad-inspector';
import './ui/cad-inspector.css';

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

  // 5. Initialize Mission Elements Manager & Interactive Sandbox Tool (starts with clean field)
  const missionManager = new MissionManager();
  missionManager.init(engine.world, viewport.scene, {
    loadSampleMechanisms: false,
    autoLoadSeasonMissions: false,
  });

  const interactionTool = new SandboxInteractionTool();
  interactionTool.init(engine.world, viewport.scene);
  interactionTool.setActive(false); // Inactive until sandbox mode
  viewport.setInteractionTool(interactionTool);
  viewport.setMissionManager(missionManager);

  // Helper to synchronize all mission elements to HUD Asset Drawer
  const syncHudMissionElements = () => {
    const allElems = missionManager.getAllElements().map((elem) => ({
      id: elem.id,
      name: elem.name,
      description: elem.description,
      sourceFile: elem.sourceFile,
      isPlacedOnField: elem.isPlacedOnField !== false,
      position: elem.getPosition(),
      yawDegrees: elem.getYawDegrees ? elem.getYawDegrees() : 0,
      isCustom: elem instanceof CustomImportedMissionElement,
    }));
    hud.setMissionElements(allElems, missionManager.getSeasonMissionsStatus());
  };
  missionManager.onMissionListChanged = syncHudMissionElements;

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
  let cadInspector: CadModelInspector;
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
      viewport.setRobotYaw(spawnPose.yawDegrees);
      sensors.resetYaw();
      hud.setExecutionState('IDLE');
    },
    onSpawnPoseChange: (pose) => {
      engine.setDefaultPose(pose);
      viewport.setRobotYaw(pose.yawDegrees);
    },
    onMoveRobotToPose: (pose, label) => {
      runner.abort();
      engine.robot.motors.get('A')?.stop();
      engine.robot.motors.get('B')?.stop();
      engine.resetRobot(pose);
      engine.setDefaultPose(pose);
      viewport.setRobotYaw(pose.yawDegrees);
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
      viewport.setRobotYaw(pose.yawDegrees);
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
      hud.logConsole(`Loading robot model "${file.name}"...`);
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
        hud.logConsole(`Imported robot "${file.name}" successfully! Clustered into ${spec.clusters.length} rigid bodies.`);
      } catch (err: any) {
        hud.logConsole(`Robot CAD Import Failed: ${err.message || err}`);
      }
    },
    onImportMissionElement: async (file: File) => {
      hud.logConsole(`Importing mission model "${file.name}" into asset library...`);
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

        const customElem = new CustomImportedMissionElement(spec, {
          id: `custom_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          description: `Imported Studio/LDraw model (${file.name})`,
          sourceFile: file.name,
        });

        // Place on field mat
        customElem.init(missionManager.getWorld(), { x: 0.10, y: 0.002, z: 0.20 }, 0);
        missionManager.registerCustomElement(customElem);
        syncHudMissionElements();
        viewport.selectMissionElement(customElem.id);
        hud.logConsole(`✅ Imported mission model "${file.name}"! Added to field and asset library.`);
      } catch (err: any) {
        hud.logConsole(`Mission Model Import Failed: ${err.message || err}`);
      }
    },
    onResetAllMissions: () => {
      missionManager.resetAll();
      interactionTool.resetAll();
      syncHudMissionElements();
      hud.logConsole('🔄 Reset all mission elements back to starting idle state.');
    },
    onElementTransformChange: (id, x, z, yaw) => {
      missionManager.setElementTransform(id, { x, y: 0.002, z }, yaw);
      viewport.updateElementTransform(id, { x, y: 0.002, z }, yaw);
    },
    onElementTogglePlaced: (id, placed) => {
      missionManager.setElementPlaced(id, placed);
      if (placed) {
        viewport.selectMissionElement(id);
      }
      syncHudMissionElements();
      hud.logConsole(`${placed ? 'Deployed' : 'Stowed'} element "${id}" ${placed ? 'on field' : 'in drawer'}.`);
    },
    onElementDelete: (id) => {
      missionManager.removeElement(id);
      syncHudMissionElements();
      viewport.selectMissionElement(null);
      hud.logConsole(`Removed mission element "${id}".`);
    },
    onElementFocus: (id) => {
      const elem = missionManager.getElement(id);
      if (elem) {
        viewport.selectMissionElement(id);
        viewport.focusOnElement(elem.getPosition());
      }
    },
    onFocusTarget: (target) => {
      if (target === 'robot') {
        viewport.selectMissionElement(null);
        viewport.focusOnElement(engine.robot.getPosition());
      } else if (target === 'center') {
        viewport.selectMissionElement(null);
        viewport.focusOnElement({ x: 0, y: 0.05, z: 0 });
      } else {
        const elem = missionManager.getElement(target);
        if (elem) {
          viewport.selectMissionElement(target);
          viewport.focusOnElement(elem.getPosition());
        }
      }
    },
    onToggleSeasonMission: async (id, enable) => {
      hud.logConsole(`${enable ? 'Loading' : 'Unloading'} season mission ${id}...`);
      try {
        await missionManager.toggleSeasonMission(id, enable);
        syncHudMissionElements();
        hud.logConsole(`✅ Season mission ${id} ${enable ? 'loaded onto mat' : 'unloaded'}.`);
      } catch (err: any) {
        hud.logConsole(`Failed to toggle season mission ${id}: ${err.message || err}`);
      }
    },
    onApplyMissionPreset: async (presetKey) => {
      hud.logConsole(`Applying mission preset "${presetKey}"...`);
      try {
        const loadedIds = await missionManager.applyMissionPreset(presetKey);
        syncHudMissionElements();
        hud.logConsole(`✅ Applied preset "${presetKey}": ${loadedIds.length > 0 ? loadedIds.join(', ') : 'None (cleared)'} active on mat.`);
      } catch (err: any) {
        hud.logConsole(`Failed to apply mission preset: ${err.message || err}`);
      }
    },
    onOpenInspector: (missionId?: string) => {
      cadInspector.open(missionId || 'M01');
    },
    onModeChange: (mode) => {
      missionManager.setMode(mode);
      viewport.setMode(mode);
      syncHudMissionElements();
      if (mode === 'ARENA') {
        interactionTool.setActive(false);
        viewport.setCameraPreset('ISO');
        engine.setRobotStationary(false);
        const spawnPose = hud.getSpawnPose();
        engine.resetRobot(spawnPose);
        viewport.setRobotYaw(spawnPose.yawDegrees);
        hud.logConsole('Switched to Competition Arena (4x8 ft mat).');
      } else {
        interactionTool.setActive(true);
        hud.setPusherActive(true);
        if (mode === 'SANDBOX_RISER') {
          interactionTool.setPusherInitialPose({ x: -0.22, y: 0.02, z: 0.0 });
        } else if (mode === 'SANDBOX_DIAL') {
          interactionTool.setPusherInitialPose({ x: 0.12, y: 0.02, z: 0.08 });
        } else if (mode === 'SANDBOX_CASCADE') {
          interactionTool.setPusherInitialPose({ x: -0.045, y: 0.02, z: 0.08 });
        }
        viewport.focusOnElement({ x: 0, y: 0.05, z: 0 });
        if (hud.isDynoModeActive()) {
          engine.setRobotStationary(true);
          engine.resetRobot({ x: 0.30, y: 0.035, z: 0.0, yawDegrees: -90 });
          viewport.setRobotYaw(-90);
        } else {
          engine.resetRobot({ x: 0, y: -20, z: 0, yawDegrees: 0 });
        }
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
      if (missionManager.currentMode !== 'ARENA') {
        if (active) {
          engine.resetRobot({ x: 0.30, y: 0.035, z: 0.0, yawDegrees: -90 });
          viewport.setRobotYaw(-90);
          hud.logConsole('Robot mounted on Workbench Dyno Jig (facing mechanism, pinned in place).');
        } else {
          engine.resetRobot({ x: 0, y: -20, z: 0, yawDegrees: 0 });
          hud.logConsole('Robot parked off-stage (workbench cleared).');
        }
      }
    },
    onResetMission: () => {
      missionManager.resetCurrent();
      interactionTool.resetAll();
      syncHudMissionElements();
      if (missionManager.currentMode === 'SANDBOX_RISER') {
        interactionTool.setPusherInitialPose({ x: -0.22, y: 0.02, z: 0.0 });
      } else if (missionManager.currentMode === 'SANDBOX_DIAL') {
        interactionTool.setPusherInitialPose({ x: 0.12, y: 0.02, z: 0.08 });
      } else if (missionManager.currentMode === 'SANDBOX_CASCADE') {
        interactionTool.setPusherInitialPose({ x: -0.15, y: 0.02, z: 0.15 });
      }
      if (missionManager.currentMode !== 'ARENA' && hud.isDynoModeActive()) {
        engine.resetRobot({ x: 0.30, y: 0.035, z: 0.0, yawDegrees: -90 });
        viewport.setRobotYaw(-90);
      }
    },
  });

  // 7. Initialize CAD Model Inspector & Diagnostic Validator
  cadInspector = new CadModelInspector({
    onDeployToField: async (missionId: string) => {
      await missionManager.toggleSeasonMission(missionId, true);
      syncHudMissionElements();
      viewport.selectMissionElement(missionId);
      const elem = missionManager.getElement(missionId);
      if (elem) {
        viewport.focusOnElement(elem.getPosition());
      }
      hud.logConsole(`🚀 Deployed inspected mission "${missionId}" to field mat.`);
    },
    onToggleSolidMode: (missionId: string, solid: boolean) => {
      const elem = missionManager.getElement(missionId);
      if (elem && elem instanceof CustomImportedMissionElement) {
        elem.setSolidRigidMode(solid);
        hud.logConsole(`⚙️ Set mission "${missionId}" physics mode: ${solid ? 'Solid Anchor' : 'Articulated Physics'}`);
      }
    },
  });

  // Initialize HUD spawn inputs with default pose
  const defaultPose = engine.getDefaultPose();
  hud.setSpawnPose(defaultPose);
  viewport.setRobotYaw(defaultPose.yawDegrees);
  syncHudMissionElements();

  // Hook 3D Viewport Interactive Drag-and-Drop Placement & Rotation
  viewport.onRobotDragStart = () => {
    runner.abort();
    engine.robot.motors.get('A')?.stop();
    engine.robot.motors.get('B')?.stop();
    hud.setExecutionState('IDLE');
  };

  viewport.onRobotRotate = (yawDegrees: number) => {
    const currentPose = hud.getSpawnPose();
    const updatedPose = { ...currentPose, yawDegrees };
    engine.resetRobot(updatedPose);
    engine.setDefaultPose(updatedPose);
    hud.setSpawnPose(updatedPose);
  };

  viewport.onRobotDragMove = (x: number, z: number, yawDegrees?: number) => {
    const currentPose = hud.getSpawnPose();
    const liveYaw = yawDegrees !== undefined ? yawDegrees : currentPose.yawDegrees;
    const livePose = {
      x: Number(x.toFixed(2)),
      y: 0.035,
      z: Number(z.toFixed(2)),
      yawDegrees: liveYaw,
    };
    engine.resetRobot(livePose);
    viewport.updateReticleYaw(liveYaw);
    hud.setSpawnPose(livePose);
  };

  viewport.onRobotDrop = (x: number, z: number, yawDegrees?: number) => {
    runner.abort();
    engine.robot.motors.get('A')?.stop();
    engine.robot.motors.get('B')?.stop();
    hud.setExecutionState('IDLE');
    const currentPose = hud.getSpawnPose();
    const finalYaw = yawDegrees !== undefined ? yawDegrees : currentPose.yawDegrees;
    const newPose = {
      x: Number(x.toFixed(2)),
      y: 0.035,
      z: Number(z.toFixed(2)),
      yawDegrees: finalYaw,
    };
    engine.resetRobot(newPose);
    engine.setDefaultPose(newPose);
    hud.setSpawnPose(newPose);
    viewport.setRobotYaw(finalYaw);
    sensors.resetYaw();
    hud.logConsole(`📍 Robot placed at (X: ${newPose.x}m, Z: ${newPose.z}m) Heading: ${newPose.yawDegrees}°.`);
  };

  // Hook Mission Element 3D Drag & Drop Placement
  viewport.onElementDragMove = (_id: string, _x: number, _z: number, _yaw: number) => {
    syncHudMissionElements();
  };

  viewport.onElementDrop = (id: string, x: number, z: number, yaw: number) => {
    syncHudMissionElements();
    hud.logConsole(`📍 Placed mission element "${id}" at (X: ${x.toFixed(2)}m, Z: ${z.toFixed(2)}m) Yaw: ${yaw.toFixed(0)}°`);
  };

  viewport.onElementSelected = (id: string | null) => {
    if (id) {
      hud.logConsole(`Selected mission element "${id}". Use mouse wheel or R key to rotate.`);
    }
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
