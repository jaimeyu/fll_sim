import { DetectedColorName } from '../sensors/sensor-manager';
import { MotorPort } from '../physics/motor-controller';

export interface TelemetryState {
  timeSeconds: number;
  matchTimerSeconds: number; // 150s (2:30) match timer
  fps: number;
  physicsHz: number;
  robot: {
    x: number; // meters
    y: number;
    z: number;
    yawDegrees: number;
  };
  motors: {
    left: {
      port: 'A' | 'B';
      degrees: number;
      speed: number;
    };
    right: {
      port: 'A' | 'B';
      degrees: number;
      speed: number;
    };
    all?: Record<string, { port: MotorPort; degrees: number; speed: number }>;
  };
  sensors: {
    colorC: {
      reflectedLight: number;
      color: DetectedColorName;
      rgb: [number, number, number];
    };
    colorD: {
      reflectedLight: number;
      color: DetectedColorName;
      rgb: [number, number, number];
    };
    distanceCm: number;
    gyroYaw?: number;
  };
}

export type ExecutionState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR' | 'FINISHED';

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  yawDegrees: number;
}
