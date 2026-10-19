import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RobotAssemblySpec } from '../src/cad/types';
import { FllPhysicsSpec } from '../src/cad/physics-spec';
import { LDrawImporter } from '../src/cad/ldraw-importer';

// Lightweight Mock DOM for headless test environment
class MockDomNode {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public _value: string = '';
  public textContent: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public children: MockDomNode[] = [];
  public parentNode: MockDomNode | null = null;
  public listeners: Record<string, Function[]> = {};
  public classSet: Set<string> = new Set();

  constructor(tagName = 'div') {
    this.tagName = tagName;
  }

  get value(): string {
    return this._value || (this.children[0]?.value ?? '');
  }

  set value(v: string) {
    this._value = String(v);
  }

  get min(): string {
    return this.attributes['min'] || '0';
  }
  set min(v: string) {
    this.attributes['min'] = String(v);
  }

  get max(): string {
    return this.attributes['max'] || '100';
  }
  set max(v: string) {
    this.attributes['max'] = String(v);
  }

  get checked(): boolean {
    return this.attributes['checked'] === 'true' || this.attributes['checked'] === '';
  }
  set checked(v: boolean) {
    this.attributes['checked'] = v ? 'true' : 'false';
  }

  get classList() {
    return {
      add: (...c: string[]) => {
        c.forEach((x) => this.classSet.add(x));
        this.className = [...this.classSet].join(' ');
      },
      remove: (...c: string[]) => {
        c.forEach((x) => this.classSet.delete(x));
        this.className = [...this.classSet].join(' ');
      },
      toggle: (x: string, f?: boolean) => {
        const h = f !== undefined ? f : !this.classSet.has(x);
        if (h) this.classSet.add(x);
        else this.classSet.delete(x);
        this.className = [...this.classSet].join(' ');
        return h;
      },
      contains: (x: string) => this.classSet.has(x),
    };
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
    if (k === 'id') this.id = v;
    if (k === 'class') {
      this.classSet.clear();
      v.split(/\s+/).filter(Boolean).forEach((x) => this.classSet.add(x));
      this.className = v;
    }
  }

  getAttribute(k: string) {
    return this.attributes[k] ?? null;
  }

  addEventListener(e: string, cb: Function) {
    (this.listeners[e] = this.listeners[e] || []).push(cb);
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  dispatchEvent(e: any) {
    const list = this.listeners[e.type || e] || [];
    list.forEach((cb) => cb(e));
  }

  appendChild(child: MockDomNode) {
    child.parentNode = this;
    this.children.push(child);
  }

  set innerHTML(html: string) {
    this.children = [];
    const tagRegex = /<([a-zA-Z0-9]+)\s*([^>]*)>/g;
    let m;
    while ((m = tagRegex.exec(html)) !== null) {
      const node = new MockDomNode(m[1]);
      const attrs = m[2];
      const idM = attrs.match(/id="([^"]+)"/);
      if (idM) node.setAttribute('id', idM[1]);
      const classM = attrs.match(/class="([^"]+)"/);
      if (classM) node.setAttribute('class', classM[1]);
      const tabM = attrs.match(/data-tab="([^"]+)"/);
      if (tabM) node.setAttribute('data-tab', tabM[1]);
      const presetM = attrs.match(/data-preset="([^"]+)"/);
      if (presetM) node.setAttribute('data-preset', presetM[1]);
      const valM = attrs.match(/value="([^"]+)"/);
      if (valM) node.value = valM[1];
      const minM = attrs.match(/min="([^"]+)"/);
      if (minM) node.min = minM[1];
      const maxM = attrs.match(/max="([^"]+)"/);
      if (maxM) node.max = maxM[1];
      this.appendChild(node);
    }
  }

  querySelector(sel: string): MockDomNode | null {
    const matches = (node: MockDomNode): boolean => {
      const idMatch = sel.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch && node.id !== idMatch[1]) return false;

      const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
      if (classMatch && !node.classSet.has(classMatch[1])) return false;

      const attrMatch = sel.match(/\[([a-zA-Z0-9_-]+)="?([^"\]]+)"?\]/);
      if (attrMatch && node.attributes[attrMatch[1]] !== attrMatch[2]) return false;

      return (idMatch || classMatch || attrMatch) ? true : false;
    };

    if (matches(this)) return this;
    for (const c of this.children) {
      const f = c.querySelector(sel);
      if (f) return f;
    }
    return null;
  }

  querySelectorAll(sel: string): MockDomNode[] {
    const res: MockDomNode[] = [];
    const matches = (node: MockDomNode): boolean => {
      const idMatch = sel.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch && node.id !== idMatch[1]) return false;

      const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
      if (classMatch && !node.classSet.has(classMatch[1])) return false;

      const attrMatch = sel.match(/\[([a-zA-Z0-9_-]+)="?([^"\]]+)"?\]/);
      if (attrMatch && node.attributes[attrMatch[1]] !== attrMatch[2]) return false;

      return (idMatch || classMatch || attrMatch) ? true : false;
    };

    const check = (node: MockDomNode) => {
      if (matches(node)) res.push(node);
      for (const c of node.children) check(c);
    };
    for (const c of this.children) check(c);
    return res;
  }
}

// Setup global mock document before importing CadModelInspector
let CadModelInspectorClass: typeof import('../src/ui/cad-inspector').CadModelInspector;

describe('CAD Inspector Phase 3 Studio & Calibration Harness', () => {
  beforeAll(async () => {
    await RAPIER.init();

    // Mock document & window
    // @ts-ignore
    globalThis.document = {
      createElement: (tag: string) => new MockDomNode(tag),
      body: new MockDomNode('body'),
    };
    // @ts-ignore
    globalThis.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
      innerWidth: 1920,
      innerHeight: 1080,
    };

    const mod = await import('../src/ui/cad-inspector');
    CadModelInspectorClass = mod.CadModelInspector;
  });

  function createSampleRobotSpec(): RobotAssemblySpec {
    const physicsSpec: FllPhysicsSpec = {
      schemaVersion: '1.1.0',
      modelId: 'sample_station',
      name: 'Sample Station Assembly',
      dualLockAnchors: [
        {
          id: 'dl_pad_1',
          clusterId: 'chassis_root',
          localStudCoordinates: [0, 0, 0],
          dimensionsMm: [25.4, 25.4],
        },
        {
          id: 'dl_pad_2',
          clusterId: 'chassis_root',
          localStudCoordinates: [80, 0, 80],
          dimensionsMm: [25.4, 25.4],
        },
      ],
      joints: [
        {
          id: 'joint_lever_1',
          name: 'Main Flag Arm',
          type: 'revolute',
          parentClusterId: 'chassis_root',
          childClusterId: 'arm_cluster',
          anchor: [0, 0.05, 0],
          axis: [0, 0, 1],
          limits: {
            minDegrees: 0,
            maxDegrees: 85,
            restitution: 0.05,
          },
          dynamics: {
            preset: 'tight_friction_pin',
            holdingTorqueNm: 0.065,
            viscousDamping: 0.60,
          },
        },
      ],
      states: {
        initialPose: {
          description: 'Rest pose',
          jointPositions: {
            joint_lever_1: 0,
          },
        },
        scoredPoses: [
          {
            id: 'state_arm_raised',
            label: 'Flag Arm Raised (20 pts)',
            points: 20,
            evaluator: {
              type: 'joint_threshold',
              jointId: 'joint_lever_1',
              targetAngleMin: 80,
              targetAngleMax: 90,
            },
          },
        ],
      },
    };

    return {
      name: 'Sample Station Assembly',
      clusters: [
        {
          clusterId: 'chassis_root',
          name: 'Station Base Platform',
          isRootChassis: true,
          parts: [
            {
              id: 'p1',
              partNumber: '3001',
              position: [0, 0, 0],
              rotation: [0, 0, 0, 1],
              role: 'BASE_PLATE',
            },
          ],
          partIds: ['p1'],
          totalMassKg: 0.35,
          colliders: [
            {
              shape: 'box',
              halfExtents: [0.08, 0.015, 0.08],
              offset: [0, 0.015, 0],
              rotation: [0, 0, 0, 1],
              friction: 0.6,
              restitution: 0.0,
            },
          ],
        },
        {
          clusterId: 'arm_cluster',
          name: 'Articulated Flag Arm',
          isRootChassis: false,
          parts: [
            {
              id: 'p2',
              partNumber: '32523',
              position: [60, 50, 0],
              rotation: [0, 0, 0, 1],
              role: 'TECHNIC_BEAM',
            },
          ],
          partIds: ['p2'],
          totalMassKg: 0.05,
          colliders: [
            {
              shape: 'box',
              halfExtents: [0.06, 0.008, 0.008],
              offset: [0.06, 0.05, 0],
              rotation: [0, 0, 0, 1],
              friction: 0.6,
              restitution: 0.0,
            },
          ],
        },
      ],
      joints: [],
      physicsSpec,
    };
  }

  it('initializes 4 right tuning tabs and switches active tab pane correctly', () => {
    const inspector = new CadModelInspectorClass();
    const overlay = inspector['overlay'] as unknown as MockDomNode;

    const tabJoints = overlay.querySelector('#tab-btn-joints');
    const tabDualLock = overlay.querySelector('#tab-btn-duallock');
    const tabMotion = overlay.querySelector('#tab-btn-motion');
    const tabMetrics = overlay.querySelector('#tab-btn-metrics');

    expect(tabJoints).not.toBeNull();
    expect(tabDualLock).not.toBeNull();
    expect(tabMotion).not.toBeNull();
    expect(tabMetrics).not.toBeNull();

    // Default tab is joints
    expect(tabJoints!.classList.contains('active')).toBe(true);

    // Switch to Dual-Lock
    tabDualLock!.click();
    expect(inspector.activeTuningTab).toBe('duallock');
    expect(overlay.querySelector('#pane-duallock')?.classList.contains('hidden')).toBe(false);
    expect(overlay.querySelector('#pane-joints')?.classList.contains('hidden')).toBe(true);

    // Switch to Motion & Poses
    tabMotion!.click();
    expect(inspector.activeTuningTab).toBe('motion');
    expect(overlay.querySelector('#pane-motion')?.classList.contains('hidden')).toBe(false);
    expect(overlay.querySelector('#pane-duallock')?.classList.contains('hidden')).toBe(true);

    // Switch to Metrics & Info
    tabMetrics!.click();
    expect(inspector.activeTuningTab).toBe('metrics');
    expect(overlay.querySelector('#pane-metrics')?.classList.contains('hidden')).toBe(false);
    expect(overlay.querySelector('#pane-motion')?.classList.contains('hidden')).toBe(true);
  });

  it('toggles fullscreen mode and updates window modifier class', () => {
    const inspector = new CadModelInspectorClass();
    const overlay = inspector['overlay'] as unknown as MockDomNode;
    const win = overlay.querySelector('.cad-inspector-window');
    const btnFullscreen = overlay.querySelector('#btn-toggle-fullscreen');

    expect(inspector.isFullscreen).toBe(false);
    expect(win!.classList.contains('inspector-fullscreen')).toBe(false);

    // Toggle fullscreen on
    btnFullscreen!.click();
    expect(inspector.isFullscreen).toBe(true);
    expect(win!.classList.contains('inspector-fullscreen')).toBe(true);
    expect(btnFullscreen!.textContent).toContain('Windowed');

    // Toggle fullscreen off
    btnFullscreen!.click();
    expect(inspector.isFullscreen).toBe(false);
    expect(win!.classList.contains('inspector-fullscreen')).toBe(false);
    expect(btnFullscreen!.textContent).toContain('Fullscreen');
  });

  it('populates joints dropdown, loads joint calibration parameters into UI, and builds 3D Joint Visualizer Gizmo', async () => {
    const inspector = new CadModelInspectorClass();
    const spec = createSampleRobotSpec();

    inspector.inspectSpec(spec, 'Sample Station', 'sample_station');
    // @ts-ignore
    await inspector['build3DRepresentation'](spec);

    expect(inspector.currentPhysicsSpec).toBeDefined();
    expect(inspector.currentPhysicsSpec!.joints!.length).toBe(1);
    expect(inspector.activeJointId).toBe('joint_lever_1');

    const overlay = inspector['overlay'] as unknown as MockDomNode;
    const dropdown = overlay.querySelector('#joint-select-dropdown');
    expect(dropdown!.value).toBe('joint_lever_1');

    // Check loaded UI values
    const inpMin = overlay.querySelector('#input-joint-min-angle');
    const inpMax = overlay.querySelector('#input-joint-max-angle');
    const holdingBadge = overlay.querySelector('#holding-torque-badge');
    const dampingBadge = overlay.querySelector('#damping-badge');

    expect(inpMin!.value).toBe('0');
    expect(inpMax!.value).toBe('85');
    expect(holdingBadge!.textContent).toContain('0.065 N·m');
    expect(dampingBadge!.textContent).toContain('0.60 N·m·s/rad');

    // Verify 3D Joint Gizmo group in Three.js
    const gizmoGroup = inspector.jointGizmoGroup;
    expect(gizmoGroup.children.length).toBeGreaterThan(0);
    expect(gizmoGroup.visible).toBe(true);

    // Pivot group contains: sphere, ringSub (with torus & arc), and arrow helper
    const pivotSubGroup = gizmoGroup.children[0] as THREE.Group;
    expect(pivotSubGroup.children.length).toBeGreaterThanOrEqual(3);

    // Verify presence of pivot center sphere
    const hasSphere = pivotSubGroup.children.some(
      (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry
    );
    expect(hasSphere).toBe(true);

    // Verify presence of ArrowHelper
    const hasArrow = pivotSubGroup.children.some((c) => c instanceof THREE.ArrowHelper);
    expect(hasArrow).toBe(true);

    // Verify presence of Ring arc wedge and Torus ring inside ringSub
    const ringSub = pivotSubGroup.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    expect(ringSub).toBeDefined();
    const hasTorus = ringSub.children.some(
      (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.TorusGeometry
    );
    const hasArc = ringSub.children.some(
      (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry
    );
    expect(hasTorus).toBe(true);
    expect(hasArc).toBe(true);
  });

  it('applies LEGO pin friction presets and updates static holding torque and viscous damping live', async () => {
    const inspector = new CadModelInspectorClass();
    const spec = createSampleRobotSpec();
    inspector.inspectSpec(spec, 'Sample Station', 'sample_station');

    // Start live physics sandbox
    // @ts-ignore
    await inspector['buildPhysicsWorld']();
    inspector['isPhysicsRunning'] = true;

    const overlay = inspector['overlay'] as unknown as MockDomNode;
    const pillFree = overlay.querySelector('.pin-preset-pill[data-preset="free"]');
    const pillMedium = overlay.querySelector('.pin-preset-pill[data-preset="medium_bush"]');
    const pillTight = overlay.querySelector('.pin-preset-pill[data-preset="tight_friction_pin"]');
    const pillHeavy = overlay.querySelector('.pin-preset-pill[data-preset="heavy_clutch"]');

    // 1. Click "Free" preset
    pillFree!.click();
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.holdingTorqueNm).toBe(0.001);
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.viscousDamping).toBe(0.05);
    expect((overlay.querySelector('#holding-torque-badge') as MockDomNode).textContent).toContain('0.001 N·m');

    // 2. Click "Medium Bush" preset
    pillMedium!.click();
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.holdingTorqueNm).toBe(0.025);
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.viscousDamping).toBe(0.25);

    // 3. Click "Heavy Drag" preset
    pillHeavy!.click();
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.holdingTorqueNm).toBe(0.150);
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.viscousDamping).toBe(1.20);

    // 4. Click "Tight Friction Pin" preset
    pillTight!.click();
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.holdingTorqueNm).toBe(0.065);
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.viscousDamping).toBe(0.60);

    // Verify Rapier revolute joint motor parameters were updated
    const rapierJoint = inspector.rapierJoints.get('joint_lever_1') as RAPIER.RevoluteImpulseJoint;
    expect(rapierJoint).toBeDefined();

    // Custom slider override
    const torqueSlider = overlay.querySelector('#slider-holding-torque') as MockDomNode;
    torqueSlider.value = '0.080';
    torqueSlider.dispatchEvent({ type: 'input', target: torqueSlider });
    expect(inspector.currentPhysicsSpec!.joints![0].dynamics.holdingTorqueNm).toBe(0.080);
  });

  it('rotates child cluster mesh around joint pivot during manual test sweep', async () => {
    const inspector = new CadModelInspectorClass();
    const spec = createSampleRobotSpec();
    inspector.inspectSpec(spec, 'Sample Station', 'sample_station');
    // @ts-ignore
    await inspector['build3DRepresentation'](spec);

    const armGroup = inspector['clusterMeshGroups'].get('arm_cluster');
    expect(armGroup).toBeDefined();

    const initialQuat = armGroup!.quaternion.clone();

    // Sweep by 45 degrees
    inspector.applyJointSweep(45);
    const midQuat = armGroup!.quaternion.clone();
    expect(midQuat.equals(initialQuat)).toBe(false);
    expect(midQuat.z).toBeCloseTo(Math.sin(Math.PI / 8), 2);

    // Sweep to 0 degrees resets pose back to initial
    inspector.applyJointSweep(0);
    const resetQuat = armGroup!.quaternion.clone();
    expect(resetQuat.x).toBeCloseTo(initialQuat.x, 3);
    expect(resetQuat.y).toBeCloseTo(initialQuat.y, 3);
    expect(resetQuat.z).toBeCloseTo(initialQuat.z, 3);
    expect(resetQuat.w).toBeCloseTo(initialQuat.w, 3);
  });

  it('calculates anti-tip stability score and updates stability indicator meter and pad list', () => {
    const inspector = new CadModelInspectorClass();
    const spec = createSampleRobotSpec();
    inspector.inspectSpec(spec, 'Sample Station', 'sample_station');

    // Initial 2 pads: score is 82%
    let stability = inspector.computeStabilityScore();
    expect(stability.score).toBe(82);
    expect(stability.badge).toBe('82%');
    expect(stability.color).toBe('#38bdf8');

    // Add a 3rd pad with spread
    inspector.currentPhysicsSpec!.dualLockAnchors!.push({
      id: 'dl_pad_3',
      clusterId: 'chassis_root',
      localStudCoordinates: [0, 0, 80],
      dimensionsMm: [25.4, 25.4],
    });
    stability = inspector.computeStabilityScore();
    expect(stability.score).toBe(98);
    expect(stability.badge).toBe('98%');
    expect(stability.color).toBe('#10b981'); // Emerald green for perimeter anchor

    // Remove all pads
    inspector.currentPhysicsSpec!.dualLockAnchors = [];
    stability = inspector.computeStabilityScore();
    expect(stability.score).toBe(0);
    expect(stability.badge).toBe('0%');
    expect(stability.color).toBe('#ef4444'); // Red

    // Single pad
    inspector.currentPhysicsSpec!.dualLockAnchors = [
      {
        id: 'dl_pad_single',
        clusterId: 'chassis_root',
        localStudCoordinates: [0, 0, 0],
        dimensionsMm: [25.4, 25.4],
      },
    ];
    stability = inspector.computeStabilityScore();
    expect(stability.score).toBe(55);
    expect(stability.color).toBe('#f59e0b'); // Amber/yellow
  });

  it('captures start and scored end poses and performs smooth cubic motion interpolation', () => {
    const inspector = new CadModelInspectorClass();
    const spec = createSampleRobotSpec();
    inspector.inspectSpec(spec, 'Sample Station', 'sample_station');

    const overlay = inspector['overlay'] as unknown as MockDomNode;
    const sweepSlider = overlay.querySelector('#slider-joint-sweep');
    const btnCaptureStart = overlay.querySelector('#btn-capture-start-pose');
    const btnCaptureEnd = overlay.querySelector('#btn-capture-end-pose');

    // Capture Start Pose at 10 deg
    sweepSlider!.value = '10';
    btnCaptureStart!.click();
    expect(inspector.startPoseDegrees).toBe(10);
    expect(inspector.currentPhysicsSpec!.states!.initialPose!.jointPositions['joint_lever_1']).toBe(10);

    // Capture End Pose at 70 deg
    sweepSlider!.value = '70';
    btnCaptureEnd!.click();
    expect(inspector.endPoseDegrees).toBe(70);

    // Test smooth cubic motion interpolation
    // At t = 0: angle = 10
    inspector.applyMotionInterpolation(0.0);
    expect(parseFloat(sweepSlider!.value)).toBeCloseTo(10, 1);

    // At t = 0.5: cubic ease is exactly 0.5, so angle = (10 + 70)/2 = 40
    inspector.applyMotionInterpolation(0.5);
    expect(parseFloat(sweepSlider!.value)).toBeCloseTo(40, 1);

    // At t = 1.0: angle = 70
    inspector.applyMotionInterpolation(1.0);
    expect(parseFloat(sweepSlider!.value)).toBeCloseTo(70, 1);

    // Playback control state
    const btnPlay = overlay.querySelector('#btn-motion-play');
    const btnPause = overlay.querySelector('#btn-motion-pause');

    inspector.playMotion();
    expect(inspector.isMotionPlaying).toBe(true);
    expect(btnPlay!.style.display).toBe('none');
    expect(btnPause!.style.display).toBe('inline-block');

    inspector.pauseMotion();
    expect(inspector.isMotionPlaying).toBe(false);
    expect(btnPlay!.style.display).toBe('inline-block');
    expect(btnPause!.style.display).toBe('none');
  });

  it('embeds fll_physics.json when exporting .io file via LDrawImporter.exportStudioIoWithPhysics', async () => {
    const inspector = new CadModelInspectorClass();
    const spec = createSampleRobotSpec();
    inspector.inspectSpec(spec, 'Sample Station', 'sample_station');

    const blob = await LDrawImporter.exportStudioIoWithPhysics(null, inspector.currentPhysicsSpec!, '0 Custom Model');
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);

    const buf = await blob.arrayBuffer();
    const reimported = await LDrawImporter.parseStudioIo(buf);
    expect(reimported.physicsSpec).toBeDefined();
    expect(reimported.physicsSpec!.schemaVersion).toBe('1.1.0');
    expect(reimported.physicsSpec!.modelId).toBe('sample_station');
    expect(reimported.physicsSpec!.joints!.length).toBe(1);
    expect(reimported.physicsSpec!.joints![0].dynamics.holdingTorqueNm).toBe(0.065);
    expect(reimported.physicsSpec!.dualLockAnchors!.length).toBe(2);
  });
});
