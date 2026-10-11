import * as THREE from 'three';
import { RobotPhysicsBody } from '../physics/robot-body';
import { VirtualSensorManager } from '../sensors/sensor-manager';
import {
  LEGO_COLORS,
  getLegoMaterial,
  createTechnicBeamGroup,
} from './lego-visuals';
import { consolidateGroupMeshes } from '../cad/mesh-consolidator';

/**
 * High-Fidelity LEGO SPIKE Prime Advance Driving Base 3D Visualizer.
 * Renders an authentic FLL competition robot with real LEGO Technic beams,
 * hole pitch, studs, 5x5 LED light matrix, angular motors, front bumper, and wheels.
 */
export class Robot3DRenderer {
  public rootGroup: THREE.Group;
  public chassisMesh: THREE.Group;
  public leftWheelMesh: THREE.Group;
  public rightWheelMesh: THREE.Group;

  // DroidBot-E Articulated Attachments & Preset System
  public attachmentRoot: THREE.Group;
  public leftAttachmentArm?: THREE.Group;
  public rightAttachmentArm?: THREE.Group;
  public leftAuxMotor?: THREE.Group;
  public rightAuxMotor?: THREE.Group;
  public ultrasonicSensorGroup?: THREE.Group;
  public colorSensorRightGroup?: THREE.Group;
  public activePreset: 'advanced' | 'compact' = 'advanced';

  // Sensor ground spots
  public sensorSpotC: THREE.Mesh;
  public sensorSpotD: THREE.Mesh;

  private sensorManager?: VirtualSensorManager;

  constructor() {
    this.rootGroup = new THREE.Group();
    this.chassisMesh = new THREE.Group();
    this.leftWheelMesh = new THREE.Group();
    this.rightWheelMesh = new THREE.Group();
    this.attachmentRoot = new THREE.Group();

    this.buildLegoChassisVisuals();
    this.buildLegoWheelVisuals(this.leftWheelMesh, 'left');
    this.buildLegoWheelVisuals(this.rightWheelMesh, 'right');

    // Consolidate chassis and wheels into material-merged meshes to reduce draw calls from ~120 to ~22
    consolidateGroupMeshes(this.chassisMesh);
    consolidateGroupMeshes(this.leftWheelMesh);
    consolidateGroupMeshes(this.rightWheelMesh);

    // Build authentic DroidBot-E attachments and articulated motor arms
    this.buildDroidBotEAttachments();

    this.rootGroup.add(this.chassisMesh);
    this.rootGroup.add(this.leftWheelMesh);
    this.rootGroup.add(this.rightWheelMesh);
    this.rootGroup.add(this.attachmentRoot);

    // Ground projection spots for color sensors
    const spotGeom = new THREE.CircleGeometry(0.008, 16);
    spotGeom.rotateX(-Math.PI / 2); // Lay flat on the ground
    const spotMatC = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
    const spotMatD = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });

    this.sensorSpotC = new THREE.Mesh(spotGeom, spotMatC);
    this.sensorSpotD = new THREE.Mesh(spotGeom.clone(), spotMatD);

    this.rootGroup.add(this.sensorSpotC);
    this.rootGroup.add(this.sensorSpotD);
  }

  public setRobotPreset(preset: 'advanced' | 'compact'): void {
    this.activePreset = preset;
    const isAdv = preset === 'advanced';
    this.attachmentRoot.visible = isAdv;
    this.sensorSpotD.visible = isAdv;
  }

  public setSensorManager(sm: VirtualSensorManager): void {
    this.sensorManager = sm;
  }

  private buildLegoChassisVisuals(): void {
    // -------------------------------------------------------------------------
    // 1. LEGO SPIKE Prime Large Hub (Part 45601)
    // -------------------------------------------------------------------------
    const hubGroup = new THREE.Group();
    const hubMat = getLegoMaterial(LEGO_COLORS.YELLOW, 0.3, 0.05);
    const whiteMat = getLegoMaterial(LEGO_COLORS.WHITE, 0.25, 0.0);
    const blackMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.5, 0.0);
    const cyanMat = getLegoMaterial(LEGO_COLORS.AZURE, 0.3, 0.0);

    // Main Yellow Enclosure: 112mm long x 40mm high x 64mm wide
    const hubBodyGeom = new THREE.BoxGeometry(0.064, 0.040, 0.112);
    const hubBodyMesh = new THREE.Mesh(hubBodyGeom, hubMat);
    hubBodyMesh.castShadow = true;
    hubBodyMesh.receiveShadow = true;
    hubGroup.add(hubBodyMesh);

    // White Top Faceplate Panel
    const faceGeom = new THREE.BoxGeometry(0.056, 0.003, 0.096);
    const faceMesh = new THREE.Mesh(faceGeom, whiteMat);
    faceMesh.position.set(0, 0.0205, 0);
    faceMesh.castShadow = true;
    hubGroup.add(faceMesh);

    // 5x5 LED Light Matrix (25 distinct circular white LED lens emitters)
    const ledGeom = new THREE.CircleGeometry(0.0022, 12);
    ledGeom.rotateX(-Math.PI / 2);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 }); // Subtle light blue glow
    const ledPitch = 0.0065;

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const led = new THREE.Mesh(ledGeom, ledMat);
        led.position.set((c - 2) * ledPitch, 0.0222, -0.015 + (r - 2) * ledPitch);
        hubGroup.add(led);
      }
    }

    // Large Center Power Button (White circle with teal ring)
    const buttonRingGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.002, 24);
    const buttonRing = new THREE.Mesh(buttonRingGeom, cyanMat);
    buttonRing.position.set(0, 0.0221, 0.024);
    hubGroup.add(buttonRing);

    const buttonCenterGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.0025, 24);
    const buttonCenter = new THREE.Mesh(buttonCenterGeom, whiteMat);
    buttonCenter.position.set(0, 0.0223, 0.024);
    hubGroup.add(buttonCenter);

    // Bluetooth Pill Button
    const btGeom = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 16);
    const btMesh = new THREE.Mesh(btGeom, cyanMat);
    btMesh.position.set(0.016, 0.0221, 0.038);
    hubGroup.add(btMesh);

    // Side Port Sockets (A, B on Left, C, D on Right)
    for (const side of [-0.0322, 0.0322]) {
      for (const posZ of [-0.035, -0.010, 0.015]) {
        const portGeom = new THREE.BoxGeometry(0.001, 0.010, 0.014);
        const portMesh = new THREE.Mesh(portGeom, blackMat);
        portMesh.position.set(side, 0.005, posZ);
        hubGroup.add(portMesh);
      }
    }

    hubGroup.position.set(0, 0.022, -0.010);
    this.chassisMesh.add(hubGroup);

    // -------------------------------------------------------------------------
    // 2. Technic Structural Chassis Beams & Frames
    // -------------------------------------------------------------------------

    // Left & Right Long Chassis Beams (15L Technic liftarms with 15 holes)
    const beamLeft = createTechnicBeamGroup(15, LEGO_COLORS.DARK_GRAY, { withPinsAt: [0, 4, 7, 10, 14] });
    beamLeft.rotation.y = Math.PI / 2;
    beamLeft.position.set(-0.048, 0.002, -0.005);
    this.chassisMesh.add(beamLeft);

    const beamRight = createTechnicBeamGroup(15, LEGO_COLORS.DARK_GRAY, { withPinsAt: [0, 4, 7, 10, 14] });
    beamRight.rotation.y = Math.PI / 2;
    beamRight.position.set(0.048, 0.002, -0.005);
    this.chassisMesh.add(beamRight);

    // Front & Rear Cross Beams (11L Technic liftarms)
    const beamCrossRear = createTechnicBeamGroup(11, LEGO_COLORS.DARK_GRAY, { withPinsAt: [1, 5, 9] });
    beamCrossRear.position.set(0, 0.002, -0.065);
    this.chassisMesh.add(beamCrossRear);

    const beamCrossFront = createTechnicBeamGroup(11, LEGO_COLORS.DARK_GRAY, { withPinsAt: [1, 5, 9] });
    beamCrossFront.position.set(0, 0.002, 0.055);
    this.chassisMesh.add(beamCrossFront);

    // -------------------------------------------------------------------------
    // 3. Front LEGO Bumper / Pusher Attachment Frame (High-vis Azure & Red)
    // Extends forward at Z = 0.080m, height Y = 0.025m (strikes mission models solidly!)
    // -------------------------------------------------------------------------
    const bumperGroup = new THREE.Group();

    // 13L Wide Front Technic Pusher Beam across front
    const bumperBeam = createTechnicBeamGroup(13, LEGO_COLORS.AZURE, {
      width: 0.009,
      thickness: 0.014,
      withPinsAt: [1, 3, 6, 9, 11],
    });
    bumperBeam.position.set(0, 0.005, 0.078);
    bumperGroup.add(bumperBeam);

    // Red Front Push Contact Plates / Target Tiles
    const pushPlateGeom = new THREE.BoxGeometry(0.088, 0.016, 0.006);
    const pushPlateMat = getLegoMaterial(LEGO_COLORS.RED, 0.3);
    const pushPlate = new THREE.Mesh(pushPlateGeom, pushPlateMat);
    pushPlate.position.set(0, 0.005, 0.084);
    pushPlate.castShadow = true;
    bumperGroup.add(pushPlate);

    // White Center Target Chevron on Bumper
    const targetGeom = new THREE.BoxGeometry(0.024, 0.010, 0.002);
    const targetMesh = new THREE.Mesh(targetGeom, whiteMat);
    targetMesh.position.set(0, 0.005, 0.088);
    bumperGroup.add(targetMesh);

    this.chassisMesh.add(bumperGroup);

    // -------------------------------------------------------------------------
    // 4. SPIKE Prime Angular Motors (Left Port A, Right Port B in Medium Azure)
    // -------------------------------------------------------------------------
    for (const [side, xPos] of [['left', -0.046], ['right', 0.046]] as const) {
      const motorGroup = new THREE.Group();
      const motorMat = getLegoMaterial(LEGO_COLORS.AZURE, 0.3);

      // Motor rounded body
      const motorBody = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.034, 0.050), motorMat);
      motorBody.castShadow = true;
      motorGroup.add(motorBody);

      // White Rotating Output Hub Disc with cross-axle hole
      const discGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.004, 24);
      discGeom.rotateZ(Math.PI / 2);
      const discMesh = new THREE.Mesh(discGeom, whiteMat);
      discMesh.position.set(side === 'left' ? -0.012 : 0.012, 0, 0);
      discMesh.castShadow = true;
      motorGroup.add(discMesh);

      // Center cross-axle hole (+) on disc
      const axleHole = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.003, 0.003), blackMat);
      axleHole.position.set(side === 'left' ? -0.0145 : 0.0145, 0, 0);
      motorGroup.add(axleHole);

      motorGroup.position.set(xPos, 0.002, 0);
      this.chassisMesh.add(motorGroup);
    }

    // -------------------------------------------------------------------------
    // 5. Left Color Sensor (Port C) facing downward at the mat
    // -------------------------------------------------------------------------
    {
      const sensorGroup = new THREE.Group();

      // Sensor Body (Black casing)
      const sensorGeom = new THREE.BoxGeometry(0.016, 0.018, 0.024);
      const sensorMesh = new THREE.Mesh(sensorGeom, blackMat);
      sensorMesh.castShadow = true;
      sensorGroup.add(sensorMesh);

      // Azure Top Bracket clip
      const clipGeom = new THREE.BoxGeometry(0.018, 0.004, 0.014);
      const clipMesh = new THREE.Mesh(clipGeom, getLegoMaterial(LEGO_COLORS.AZURE));
      clipMesh.position.set(0, 0.010, 0);
      sensorGroup.add(clipMesh);

      // Optical Lens with White LED emitter ring
      const lensGeom = new THREE.CircleGeometry(0.004, 12);
      lensGeom.rotateX(Math.PI / 2); // Facing mat
      const lensMesh = new THREE.Mesh(lensGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lensMesh.position.set(0, -0.0095, 0.004);
      sensorGroup.add(lensMesh);

      sensorGroup.position.set(-0.024, -0.008, 0.068);
      this.chassisMesh.add(sensorGroup);
    }

    // -------------------------------------------------------------------------
    // 6. Rear Caster Skid Housing & Steel Ball (Part 49283)
    // -------------------------------------------------------------------------
    const casterHousingMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.4);
    const casterHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.014, 0.016, 16),
      casterHousingMat
    );
    casterHousing.position.set(0, -0.015, -0.065);
    this.chassisMesh.add(casterHousing);

    const ballMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.95, roughness: 0.08 });
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.010, 20, 20), ballMat);
    ballMesh.position.set(0, -0.0245, -0.065);
    ballMesh.castShadow = true;
    this.chassisMesh.add(ballMesh);
  }

  private buildLegoWheelVisuals(wheelGroup: THREE.Group, _side: 'left' | 'right'): void {
    // -------------------------------------------------------------------------
    // 56mm x 26mm Technic Racing Wheel (Part 56145 / 44771)
    // -------------------------------------------------------------------------
    const tireMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.88, 0.02);
    const rimMat = getLegoMaterial(LEGO_COLORS.YELLOW, 0.32, 0.05);

    // 1. Rubber Tire Outer Cylinder (Radius 28mm, width 24mm)
    const tireGeom = new THREE.CylinderGeometry(0.028, 0.028, 0.024, 32);
    tireGeom.rotateZ(Math.PI / 2); // Oriented along X axis
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    wheelGroup.add(tireMesh);

    // 2. Deep Radial Tire Tread Grooves
    const treadGeom = new THREE.BoxGeometry(0.025, 0.0018, 0.0035);
    const numTreads = 18;
    for (let i = 0; i < numTreads; i++) {
      const ang = (i * 2 * Math.PI) / numTreads;
      const tread = new THREE.Mesh(treadGeom, getLegoMaterial(0x0a0a0c, 0.95));
      tread.position.set(0, Math.sin(ang) * 0.0281, Math.cos(ang) * 0.0281);
      tread.rotation.x = ang;
      wheelGroup.add(tread);
    }

    // 3. Yellow Technic Rim Hub (Radius 16mm, width 25mm)
    const rimGeom = new THREE.CylinderGeometry(0.0165, 0.0165, 0.0252, 24);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeom, rimMat);
    wheelGroup.add(rimMesh);

    // 4. Technic Spoke Recesses & Cutouts
    const spokeHoleGeom = new THREE.CylinderGeometry(0.0035, 0.0035, 0.026, 12);
    spokeHoleGeom.rotateZ(Math.PI / 2);
    const holeMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.8);

    for (let s = 0; s < 4; s++) {
      const ang = (s * Math.PI) / 2 + Math.PI / 4;
      const dist = 0.010;
      const spokeHole = new THREE.Mesh(spokeHoleGeom, holeMat);
      spokeHole.position.set(0, Math.sin(ang) * dist, Math.cos(ang) * dist);
      wheelGroup.add(spokeHole);
    }

    // 5. Center Cross-Axle Bushing Collar (+)
    const bushingMat = getLegoMaterial(LEGO_COLORS.LIGHT_GRAY, 0.4);
    const bushingGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.027, 16);
    bushingGeom.rotateZ(Math.PI / 2);
    const bushing = new THREE.Mesh(bushingGeom, bushingMat);
    wheelGroup.add(bushing);

    // Cross-Axle Slot Hole
    const crossSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.0275, 0.0048, 0.0016),
      holeMat
    );
    wheelGroup.add(crossSlot);
  }

  /**
   * Build authentic DroidBot-E attachments:
   * - Left & Right Aux Medium Angular Motors (Ports E & F)
   * - Articulated Left & Right Technic Attachment Liftarms / Pusher Forks
   * - Front Ultrasonic Distance Sensor (Port E)
   * - Right Color Sensor (Port D)
   */
  private buildDroidBotEAttachments(): void {
    const motorMat = getLegoMaterial(LEGO_COLORS.AZURE, 0.3);
    const whiteMat = getLegoMaterial(LEGO_COLORS.WHITE, 0.25, 0.0);
    const blackMat = getLegoMaterial(LEGO_COLORS.BLACK, 0.5, 0.0);

    // 1. Left Aux Attachment Motor (Port E) & Left Articulated Liftarm
    this.leftAuxMotor = new THREE.Group();
    const motorBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.034, 0.046), motorMat);
    motorBodyL.castShadow = true;
    this.leftAuxMotor.add(motorBodyL);

    const hubFaceL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 16), whiteMat);
    hubFaceL.rotation.z = Math.PI / 2;
    hubFaceL.position.set(-0.012, 0, 0);
    this.leftAuxMotor.add(hubFaceL);

    this.leftAuxMotor.position.set(-0.052, 0.032, 0.005);
    this.attachmentRoot.add(this.leftAuxMotor);

    // Left Articulated Attachment Liftarm (pivots around motor axle X axis)
    this.leftAttachmentArm = new THREE.Group();
    this.leftAttachmentArm.position.set(-0.066, 0.032, 0.005);

    const collarL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.006, 12),
      getLegoMaterial(LEGO_COLORS.LIGHT_GRAY)
    );
    collarL.rotation.z = Math.PI / 2;
    this.leftAttachmentArm.add(collarL);

    // 9L Technic Liftarm (Red) extending forward
    const armBeamL = createTechnicBeamGroup(9, LEGO_COLORS.RED, {
      width: 0.008,
      thickness: 0.008,
      withPinsAt: [0, 4, 8],
    });
    armBeamL.position.set(0, 0, 0.036);
    this.leftAttachmentArm.add(armBeamL);

    // Front pusher prong (Azure)
    const prongL = createTechnicBeamGroup(5, LEGO_COLORS.AZURE, {
      width: 0.008,
      thickness: 0.008,
    });
    prongL.rotation.y = Math.PI / 2;
    prongL.position.set(0.016, 0, 0.072);
    this.leftAttachmentArm.add(prongL);

    this.attachmentRoot.add(this.leftAttachmentArm);

    // 2. Right Aux Attachment Motor (Port F) & Right Articulated Liftarm
    this.rightAuxMotor = new THREE.Group();
    const motorBodyR = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.034, 0.046), motorMat);
    motorBodyR.castShadow = true;
    this.rightAuxMotor.add(motorBodyR);

    const hubFaceR = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 16), whiteMat);
    hubFaceR.rotation.z = Math.PI / 2;
    hubFaceR.position.set(0.012, 0, 0);
    this.rightAuxMotor.add(hubFaceR);

    this.rightAuxMotor.position.set(0.052, 0.032, 0.005);
    this.attachmentRoot.add(this.rightAuxMotor);

    // Right Articulated Attachment Liftarm (pivots around motor axle X axis)
    this.rightAttachmentArm = new THREE.Group();
    this.rightAttachmentArm.position.set(0.066, 0.032, 0.005);

    const collarR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.006, 12),
      getLegoMaterial(LEGO_COLORS.LIGHT_GRAY)
    );
    collarR.rotation.z = Math.PI / 2;
    this.rightAttachmentArm.add(collarR);

    // 9L Technic Liftarm (Red) extending forward
    const armBeamR = createTechnicBeamGroup(9, LEGO_COLORS.RED, {
      width: 0.008,
      thickness: 0.008,
      withPinsAt: [0, 4, 8],
    });
    armBeamR.position.set(0, 0, 0.036);
    this.rightAttachmentArm.add(armBeamR);

    // Front pusher prong (Azure)
    const prongR = createTechnicBeamGroup(5, LEGO_COLORS.AZURE, {
      width: 0.008,
      thickness: 0.008,
    });
    prongR.rotation.y = -Math.PI / 2;
    prongR.position.set(-0.016, 0, 0.072);
    this.rightAttachmentArm.add(prongR);

    this.attachmentRoot.add(this.rightAttachmentArm);

    // 3. Front Ultrasonic Distance Sensor (Port E)
    this.ultrasonicSensorGroup = new THREE.Group();
    const ultraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.034, 0.016, 0.014),
      blackMat
    );
    ultraBody.castShadow = true;
    this.ultrasonicSensorGroup.add(ultraBody);

    for (const eyeX of [-0.009, 0.009]) {
      const eyeRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.002, 16),
        getLegoMaterial(LEGO_COLORS.LIGHT_GRAY, 0.2, 0.5)
      );
      eyeRing.rotation.x = Math.PI / 2;
      eyeRing.position.set(eyeX, 0, 0.008);
      this.ultrasonicSensorGroup.add(eyeRing);

      const eyePupil = new THREE.Mesh(
        new THREE.CircleGeometry(0.0035, 12),
        new THREE.MeshBasicMaterial({ color: 0x050505 })
      );
      eyePupil.position.set(eyeX, 0, 0.0091);
      this.ultrasonicSensorGroup.add(eyePupil);
    }

    const ultraClip = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.004, 0.010),
      getLegoMaterial(LEGO_COLORS.AZURE)
    );
    ultraClip.position.set(0, -0.009, 0);
    this.ultrasonicSensorGroup.add(ultraClip);

    this.ultrasonicSensorGroup.position.set(0, 0.024, 0.076);
    this.attachmentRoot.add(this.ultrasonicSensorGroup);

    // 4. Right Color Sensor (Port D) facing downward at the mat
    this.colorSensorRightGroup = new THREE.Group();
    const sensorGeomD = new THREE.BoxGeometry(0.016, 0.018, 0.024);
    const sensorMeshD = new THREE.Mesh(sensorGeomD, blackMat);
    sensorMeshD.castShadow = true;
    this.colorSensorRightGroup.add(sensorMeshD);

    const clipGeomD = new THREE.BoxGeometry(0.018, 0.004, 0.014);
    const clipMeshD = new THREE.Mesh(clipGeomD, getLegoMaterial(LEGO_COLORS.AZURE));
    clipMeshD.position.set(0, 0.010, 0);
    this.colorSensorRightGroup.add(clipMeshD);

    const lensGeomD = new THREE.CircleGeometry(0.004, 12);
    lensGeomD.rotateX(Math.PI / 2);
    const lensMeshD = new THREE.Mesh(lensGeomD, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lensMeshD.position.set(0, -0.0095, 0.004);
    this.colorSensorRightGroup.add(lensMeshD);

    this.colorSensorRightGroup.position.set(0.024, -0.008, 0.068);
    this.attachmentRoot.add(this.colorSensorRightGroup);
  }

  /**
   * Synchronize visual Three.js transforms with Rapier3D physics state
   */
  public syncWithPhysics(robotPhysics: RobotPhysicsBody): void {
    // 1. Chassis Pose
    const chassisPos = robotPhysics.chassisBody.translation();
    const chassisRot = robotPhysics.chassisBody.rotation();
    this.chassisMesh.position.set(chassisPos.x, chassisPos.y, chassisPos.z);
    this.chassisMesh.quaternion.set(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);

    // Sync DroidBot-E attachments group transform with chassis
    this.attachmentRoot.position.set(chassisPos.x, chassisPos.y, chassisPos.z);
    this.attachmentRoot.quaternion.set(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);

    // 2. Articulate Motorized Attachment Arms based on physics motor encoder degrees
    if (this.activePreset === 'advanced') {
      const motorE = robotPhysics.motors.get('E');
      const motorF = robotPhysics.motors.get('F');
      if (this.leftAttachmentArm && motorE) {
        this.leftAttachmentArm.rotation.x = (motorE.degrees * Math.PI) / 180;
      }
      if (this.rightAttachmentArm && motorF) {
        this.rightAttachmentArm.rotation.x = (motorF.degrees * Math.PI) / 180;
      }
    }

    // 3. Wheels Poses
    let wheelIndex = 0;
    for (const body of robotPhysics.wheelBodies.values()) {
      const pos = body.translation();
      const rot = body.rotation();
      const targetGroup = wheelIndex === 0 ? this.leftWheelMesh : this.rightWheelMesh;
      targetGroup.position.set(pos.x, pos.y, pos.z);
      targetGroup.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      wheelIndex++;
    }

    // 4. Sensor Ground Projection Spots
    if (this.sensorManager) {
      const readingC = this.sensorManager.sampleColorSensor('C');
      this.sensorSpotC.position.set(readingC.worldPosition[0], 0.003, readingC.worldPosition[2]);
      (this.sensorSpotC.material as THREE.MeshBasicMaterial).color.setRGB(
        readingC.rgb[0] / 255,
        readingC.rgb[1] / 255,
        readingC.rgb[2] / 255
      );

      if (this.activePreset === 'advanced') {
        this.sensorSpotD.visible = true;
        const readingD = this.sensorManager.sampleColorSensor('D');
        this.sensorSpotD.position.set(readingD.worldPosition[0], 0.003, readingD.worldPosition[2]);
        (this.sensorSpotD.material as THREE.MeshBasicMaterial).color.setRGB(
          readingD.rgb[0] / 255,
          readingD.rgb[1] / 255,
          readingD.rgb[2] / 255
        );
      } else {
        this.sensorSpotD.visible = false;
      }
    }
  }
}
