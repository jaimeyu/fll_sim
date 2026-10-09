import * as THREE from 'three';
import { RobotPhysicsBody } from '../physics/robot-body';
import { VirtualSensorManager } from '../sensors/sensor-manager';

export class Robot3DRenderer {
  public rootGroup: THREE.Group;
  public chassisMesh: THREE.Group;
  public leftWheelMesh: THREE.Group;
  public rightWheelMesh: THREE.Group;

  // Sensor ground spots
  public sensorSpotC: THREE.Mesh;
  public sensorSpotD: THREE.Mesh;

  private sensorManager?: VirtualSensorManager;

  constructor() {
    this.rootGroup = new THREE.Group();
    this.chassisMesh = new THREE.Group();
    this.leftWheelMesh = new THREE.Group();
    this.rightWheelMesh = new THREE.Group();

    this.buildChassisVisuals();
    this.buildWheelVisuals(this.leftWheelMesh);
    this.buildWheelVisuals(this.rightWheelMesh);

    this.rootGroup.add(this.chassisMesh);
    this.rootGroup.add(this.leftWheelMesh);
    this.rootGroup.add(this.rightWheelMesh);

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

  public setSensorManager(sm: VirtualSensorManager): void {
    this.sensorManager = sm;
  }

  private buildChassisVisuals(): void {
    // 1. SPIKE Prime Large Hub (Bright Yellow casing with white face)
    const hubGeom = new THREE.BoxGeometry(0.056, 0.04, 0.088);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // LEGO Yellow
      roughness: 0.3,
      metalness: 0.1,
    });
    const hubMesh = new THREE.Mesh(hubGeom, hubMat);
    hubMesh.position.set(0, 0.02, 0);
    hubMesh.castShadow = true;
    hubMesh.receiveShadow = true;
    this.chassisMesh.add(hubMesh);

    // Hub Display Screen 5x5 Matrix (White panel on top)
    const screenGeom = new THREE.PlaneGeometry(0.035, 0.035);
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 });
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.rotation.x = -Math.PI / 2;
    screenMesh.position.set(0, 0.0405, 0.01);
    this.chassisMesh.add(screenMesh);

    // 2. Technic Frames (Dark Bluish Gray structural beams)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.4 });
    const beamL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.14), frameMat);
    beamL.position.set(-0.048, 0, 0);
    const beamR = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.14), frameMat);
    beamR.position.set(0.048, 0, 0);
    const crossF = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.012), frameMat);
    crossF.position.set(0, 0, 0.065);
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.012), frameMat);
    crossB.position.set(0, 0, -0.065);

    this.chassisMesh.add(beamL);
    this.chassisMesh.add(beamR);
    this.chassisMesh.add(crossF);
    this.chassisMesh.add(crossB);

    // 3. SPIKE Angular Motors (Teal / Medium Azure casing)
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.3 });
    const motorL = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.032, 0.048), motorMat);
    motorL.position.set(-0.045, 0, 0);
    const motorR = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.032, 0.048), motorMat);
    motorR.position.set(0.045, 0, 0);
    this.chassisMesh.add(motorL);
    this.chassisMesh.add(motorR);

    // 4. Rear Caster Skid Housing & Steel Ball
    const casterHousingMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 });
    const casterHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.018, 16), casterHousingMat);
    casterHousing.position.set(0, -0.015, -0.065);
    this.chassisMesh.add(casterHousing);

    const ballMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.9, roughness: 0.1 });
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), ballMat);
    ballMesh.position.set(0, -0.025, -0.065);
    this.chassisMesh.add(ballMesh);

    // 5. Dual Color Sensors at the front (Ports C & D)
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3 });
    const sensorC = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.024), sensorMat);
    sensorC.position.set(-0.024, -0.01, 0.075);
    const sensorD = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.024), sensorMat);
    sensorD.position.set(0.024, -0.01, 0.075);
    this.chassisMesh.add(sensorC);
    this.chassisMesh.add(sensorD);

    // Sensor Lenses (White LED emitter glow)
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lensC = new THREE.Mesh(new THREE.CircleGeometry(0.005, 8), lensMat);
    lensC.rotation.x = Math.PI / 2;
    lensC.position.set(-0.024, -0.0185, 0.075);
    const lensD = new THREE.Mesh(new THREE.CircleGeometry(0.005, 8), lensMat);
    lensD.rotation.x = Math.PI / 2;
    lensD.position.set(0.024, -0.0185, 0.075);
    this.chassisMesh.add(lensC);
    this.chassisMesh.add(lensD);
  }

  private buildWheelVisuals(wheelGroup: THREE.Group): void {
    // 56mm x 26mm Technic Wheel:
    // Outer tire (Rubber Black)
    const tireGeom = new THREE.CylinderGeometry(0.028, 0.028, 0.024, 24);
    tireGeom.rotateZ(Math.PI / 2); // Cylinder along X axis
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
      metalness: 0.05,
    });
    const tireMesh = new THREE.Mesh(tireGeom, tireMat);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    // Rim hub (Yellow Technic Hub with spokes)
    const rimGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.025, 16);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
      metalness: 0.1,
    });
    const rimMesh = new THREE.Mesh(rimGeom, rimMat);
    wheelGroup.add(rimMesh);

    // Center Cross-Axle hole (Black)
    const axleHoleGeom = new THREE.BoxGeometry(0.026, 0.006, 0.006);
    const axleMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const axleMesh = new THREE.Mesh(axleHoleGeom, axleMat);
    wheelGroup.add(axleMesh);
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

    // 2. Wheels Poses
    let wheelIndex = 0;
    for (const body of robotPhysics.wheelBodies.values()) {
      const pos = body.translation();
      const rot = body.rotation();
      const targetGroup = wheelIndex === 0 ? this.leftWheelMesh : this.rightWheelMesh;
      targetGroup.position.set(pos.x, pos.y, pos.z);
      targetGroup.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      wheelIndex++;
    }

    // 3. Sensor Ground Projection Spots
    if (this.sensorManager) {
      const readingC = this.sensorManager.sampleColorSensor('C');
      const readingD = this.sensorManager.sampleColorSensor('D');

      // Place spots just above mat surface (Y = 0.003m)
      this.sensorSpotC.position.set(readingC.worldPosition[0], 0.003, readingC.worldPosition[2]);
      this.sensorSpotD.position.set(readingD.worldPosition[0], 0.003, readingD.worldPosition[2]);

      // Color swatch for spot materials
      (this.sensorSpotC.material as THREE.MeshBasicMaterial).color.setRGB(
        readingC.rgb[0] / 255,
        readingC.rgb[1] / 255,
        readingC.rgb[2] / 255
      );
      (this.sensorSpotD.material as THREE.MeshBasicMaterial).color.setRGB(
        readingD.rgb[0] / 255,
        readingD.rgb[1] / 255,
        readingD.rgb[2] / 255
      );
    }
  }
}
