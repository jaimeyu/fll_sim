import { PlacedPart, ConnectionLink } from '../types';
import { CadClusteringPreSolver, PreSolverInput } from '../clustering-solver';
import { RobotAssemblySpec } from '../types';

export function createFllAdvanceDrivingBaseAssembly(): PreSolverInput {
  const parts: PlacedPart[] = [];
  const links: ConnectionLink[] = [];

  // 1. SPIKE Prime Hub (45601) - Center of robot chassis
  parts.push({
    id: 'part_hub',
    partNumber: '45601',
    position: [0, 50, 0], // mm
    rotation: [0, 0, 0, 1],
    role: 'CHASSIS_CORE',
  });

  // 2. Structural frames & beams (Base chassis)
  const chassisBeams = [
    { id: 'beam_base_left', partNumber: '39793', pos: [-56, 30, 0] },
    { id: 'beam_base_right', partNumber: '39793', pos: [56, 30, 0] },
    { id: 'beam_cross_front', partNumber: '32524', pos: [0, 25, 60] },
    { id: 'beam_cross_rear', partNumber: '32524', pos: [0, 25, -60] },
    { id: 'frame_motor_mount', partNumber: '64179', pos: [0, 35, 10] },
  ];

  for (const b of chassisBeams) {
    parts.push({
      id: b.id,
      partNumber: b.partNumber,
      position: b.pos as [number, number, number],
      rotation: [0, 0, 0, 1],
      role: 'STRUCTURAL_BEAM',
    });
    // Rigidly link each beam to the hub
    links.push({
      fromPartId: 'part_hub',
      toPartId: b.id,
      connectionType: 'RIGID_FRAME',
    });
  }

  // 3. Populate 120+ Technic friction pins (2780 & 6558) holding the beams rigidly together
  for (let i = 0; i < 120; i++) {
    const pinId = `pin_friction_${i}`;
    const targetBeam = chassisBeams[i % chassisBeams.length].id;
    parts.push({
      id: pinId,
      partNumber: i % 3 === 0 ? '6558' : '2780',
      position: [
        (i % 10) * 8 - 40,
        25 + (i % 4) * 8,
        Math.floor(i / 10) * 8 - 50,
      ],
      rotation: [0, 0, 0, 1],
      role: 'FASTENER_PIN',
    });
    links.push({
      fromPartId: targetBeam,
      toPartId: pinId,
      connectionType: 'RIGID_PIN',
    });
  }

  // 4. Motors (Left Port A, Right Port B)
  // Stators are rigidly bolted to the chassis frame
  parts.push({
    id: 'motor_stator_left',
    partNumber: '45602',
    position: [-56, 30, 0],
    rotation: [0, 0, 0, 1],
    role: 'MOTOR_STATOR',
    meta: { port: 'A' },
  });
  links.push({
    fromPartId: 'frame_motor_mount',
    toPartId: 'motor_stator_left',
    connectionType: 'RIGID_FRAME',
  });

  parts.push({
    id: 'motor_stator_right',
    partNumber: '45602',
    position: [56, 30, 0],
    rotation: [0, 0, 0, 1],
    role: 'MOTOR_STATOR',
    meta: { port: 'B' },
  });
  links.push({
    fromPartId: 'frame_motor_mount',
    toPartId: 'motor_stator_right',
    connectionType: 'RIGID_FRAME',
  });

  // 5. Wheels (56145: 56mm diameter, track width = 128mm)
  // Left Wheel attached to Left Motor via 1-DOF Revolute Joint
  parts.push({
    id: 'wheel_left',
    partNumber: '56145',
    position: [-64, 28, 0],
    rotation: [0, 0, 0, 1],
    role: 'WHEEL_RIM',
  });
  links.push({
    fromPartId: 'motor_stator_left',
    toPartId: 'wheel_left',
    connectionType: 'REVOLUTE_AXLE',
    jointAxis: [1, 0, 0],
    anchor: [-0.064, -0.007, 0],
  });

  // Right Wheel attached to Right Motor via 1-DOF Revolute Joint
  parts.push({
    id: 'wheel_right',
    partNumber: '56145',
    position: [64, 28, 0],
    rotation: [0, 0, 0, 1],
    role: 'WHEEL_RIM',
  });
  links.push({
    fromPartId: 'motor_stator_right',
    toPartId: 'wheel_right',
    connectionType: 'REVOLUTE_AXLE',
    jointAxis: [1, 0, 0],
    anchor: [0.064, -0.007, 0],
  });

  // 6. Rear Caster Skid (Part 49283)
  parts.push({
    id: 'caster_ball',
    partNumber: '49283',
    position: [0, 12, -75], // rear ball touching ground
    rotation: [0, 0, 0, 1],
    role: 'CASTER_SKID',
  });
  // The caster housing is rigidly attached to rear cross beam
  links.push({
    fromPartId: 'beam_cross_rear',
    toPartId: 'caster_ball',
    connectionType: 'FREE_ROTATION',
    anchor: [0, 0.012, -0.075],
  });

  // 7. Dual Color Sensors (Left Port C, Right Port D)
  // Positioned in front of the robot, facing downward, 8mm above ground
  parts.push({
    id: 'sensor_color_c',
    partNumber: '45605',
    position: [-24, 16, 75], // 24mm left of center, 75mm forward
    rotation: [1, 0, 0, 0], // Pointing down
    role: 'SENSOR_COLOR',
    meta: { port: 'C' },
  });
  links.push({
    fromPartId: 'beam_cross_front',
    toPartId: 'sensor_color_c',
    connectionType: 'RIGID_FRAME',
  });

  parts.push({
    id: 'sensor_color_d',
    partNumber: '45605',
    position: [24, 16, 75], // 24mm right of center, 75mm forward
    rotation: [1, 0, 0, 0], // Pointing down
    role: 'SENSOR_COLOR',
    meta: { port: 'D' },
  });
  links.push({
    fromPartId: 'beam_cross_front',
    toPartId: 'sensor_color_d',
    connectionType: 'RIGID_FRAME',
  });

  return {
    name: 'SPIKE Prime Advanced Driving Base',
    parts,
    links,
  };
}

export function getFllAdvanceDrivingBaseSpec(): RobotAssemblySpec {
  const input = createFllAdvanceDrivingBaseAssembly();
  return CadClusteringPreSolver.solve(input);
}
