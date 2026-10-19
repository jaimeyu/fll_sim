import { SimulationPhysicsEngine } from '../physics/engine';
import { VirtualSensorManager } from '../sensors/sensor-manager';
import { MotorPort, resolveMotorSpeedInput } from '../physics/motor-controller';

export class VirtualTimer {
  private startTime: number = performance.now();

  public reset(): void {
    this.startTime = performance.now();
  }

  public now(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  public get_time_sec(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  public get_time_msec(): number {
    return performance.now() - this.startTime;
  }

  public time(): number {
    return Math.round(performance.now() - this.startTime);
  }
}

export class VirtualSpikeApi {
  private engine: SimulationPhysicsEngine;
  private sensors: VirtualSensorManager;
  private abortSignal?: AbortSignal;

  constructor(engine: SimulationPhysicsEngine, sensors: VirtualSensorManager, abortSignal?: AbortSignal) {
    this.engine = engine;
    this.sensors = sensors;
    this.abortSignal = abortSignal;
  }

  private checkAborted(): void {
    if (this.abortSignal?.aborted) {
      throw new Error('Simulation execution stopped by user');
    }
  }

  public async wait(seconds: number): Promise<void> {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      this.checkAborted();
      await new Promise((r) => setTimeout(r, 16)); // ~60fps yield
    }
  }

  public stopAllMotors(): void {
    this.engine.robot?.stopAllMotors();
  }

  // --- Classes exposed to user scripts ---

  public createTimer(): VirtualTimer {
    return new VirtualTimer();
  }

  public createPrimeHub() {
    const self = this;
    return {
      motion_sensor: {
        get_yaw_angle: () => {
          self.checkAborted();
          return self.sensors.getYaw();
        },
        reset_yaw_angle: () => {
          self.checkAborted();
          self.sensors.resetYaw();
        },
      },
      light_matrix: {
        write: (text: string) => {
          console.log(`[SPIKE Hub Matrix]: ${text}`);
        },
      },
      speaker: {
        beep: (freq = 440, timeSec = 0.2) => {
          console.log(`[SPIKE Speaker]: Beep ${freq}Hz for ${timeSec}s`);
        },
      },
    };
  }

  public createMotor(port: any) {
    const self = this;
    const normalizedPort = (typeof port === 'string' ? port.trim().toUpperCase() : port) as MotorPort;
    const motor = self.engine.robot?.motors.get(normalizedPort);
    let defaultSpeed = 50;

    const parseSpeed = (arg1?: any, arg2?: any): number => {
      if (typeof arg1 === 'object' && arg1 !== null) {
        return resolveMotorSpeedInput(arg1, defaultSpeed);
      }
      if (typeof arg1 === 'string') {
        const s = arg1.trim().toLowerCase();
        let sign = 1;
        if (s === 'counterclockwise' || s === 'ccw' || s === 'anticlockwise' || s === 'reverse' || s === 'backward') {
          sign = -1;
        }
        const spd = typeof arg2 === 'number' && Number.isFinite(arg2) ? arg2 : defaultSpeed;
        return Math.max(-100, Math.min(100, Math.abs(spd) * sign));
      }
      if (typeof arg1 === 'number' && Number.isFinite(arg1)) {
        let sign = 1;
        if (typeof arg2 === 'string') {
          const s = arg2.trim().toLowerCase();
          if (s === 'counterclockwise' || s === 'ccw' || s === 'anticlockwise' || s === 'reverse' || s === 'backward') {
            sign = -1;
          }
        }
        return Math.max(-100, Math.min(100, Math.abs(arg1) * sign));
      }
      if (arg1 !== undefined && arg1 !== null) {
        return resolveMotorSpeedInput(arg1, defaultSpeed);
      }
      if (arg2 !== undefined && arg2 !== null) {
        return resolveMotorSpeedInput(arg2, defaultSpeed);
      }
      return defaultSpeed;
    };

    return {
      port: normalizedPort,
      set_default_speed: (speed: number) => {
        if (Number.isFinite(speed)) defaultSpeed = speed;
      },
      start: (arg1?: any, arg2?: any) => {
        self.checkAborted();
        const spd = parseSpeed(arg1, arg2);
        motor?.start(spd);
      },
      stop: () => {
        motor?.stop();
      },
      get_degrees_counted: () => {
        return Math.round(motor?.degrees || 0);
      },
      set_degrees_counted: (deg: number = 0) => {
        if (motor) motor.degrees = deg;
      },
      get_position: () => {
        return Math.round(motor?.degrees || 0);
      },
      get_speed: () => {
        return Math.round(motor?.velocityDegPerSec || 0);
      },
      was_interrupted: () => false,
      was_stalled: () => false,
      run_for_degrees: async (degrees: number, arg1?: any, arg2?: any) => {
        self.checkAborted();
        if (!motor) return;
        const spd = parseSpeed(arg1, arg2);
        return new Promise<void>((resolve, reject) => {
          motor.runForDegrees(degrees, spd, () => {
            resolve();
          });
          const checkInterval = setInterval(() => {
            if (self.abortSignal?.aborted) {
              clearInterval(checkInterval);
              motor.stop();
              reject(new Error('Aborted'));
            }
          }, 30);
        });
      },
      run_for_rotations: async (rotations: number, arg1?: any, arg2?: any) => {
        self.checkAborted();
        if (!motor) return;
        const spd = parseSpeed(arg1, arg2);
        return new Promise<void>((resolve, reject) => {
          motor.runForDegrees(rotations * 360, spd, () => {
            resolve();
          });
          const checkInterval = setInterval(() => {
            if (self.abortSignal?.aborted) {
              clearInterval(checkInterval);
              motor.stop();
              reject(new Error('Aborted'));
            }
          }, 30);
        });
      },
      run_for_seconds: async (seconds: number, arg1?: any, arg2?: any) => {
        self.checkAborted();
        if (!motor) return;
        const spd = parseSpeed(arg1, arg2);
        return new Promise<void>((resolve, reject) => {
          motor.runForTime(seconds, spd, () => {
            resolve();
          });
          const checkInterval = setInterval(() => {
            if (self.abortSignal?.aborted) {
              clearInterval(checkInterval);
              motor.stop();
              reject(new Error('Aborted'));
            }
          }, 30);
        });
      },
      run_to_position: async (degrees: number, arg1?: any, arg2?: any) => {
        self.checkAborted();
        if (!motor) return;
        let direction = 'shortest path';
        let speed = defaultSpeed;

        if (typeof arg1 === 'string') {
          direction = arg1.toLowerCase();
          if (typeof arg2 === 'number') speed = arg2;
        } else if (typeof arg1 === 'number') {
          speed = arg1;
        } else if (typeof arg1 === 'object' && arg1 !== null) {
          if (arg1.direction) direction = String(arg1.direction).toLowerCase();
          if (arg1.speed !== undefined) speed = Number(arg1.speed);
        }

        const currentNorm = ((motor.degrees % 360) + 360) % 360;
        const targetNorm = ((degrees % 360) + 360) % 360;
        let delta = targetNorm - currentNorm;

        if (direction === 'clockwise' || direction === 'cw') {
          if (delta <= 0) delta += 360;
        } else if (direction === 'counterclockwise' || direction === 'ccw') {
          if (delta >= 0) delta -= 360;
        } else {
          // shortest path
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
        }

        return new Promise<void>((resolve, reject) => {
          motor.runForDegrees(delta, speed, () => {
            resolve();
          });
          const checkInterval = setInterval(() => {
            if (self.abortSignal?.aborted) {
              clearInterval(checkInterval);
              motor.stop();
              reject(new Error('Aborted'));
            }
          }, 30);
        });
      },
    };
  }

  public createMotorPair(leftPort?: any, rightPort?: any) {
    const self = this;
    const normalizePort = (p: any, defaultPort: MotorPort): MotorPort => {
      if (p === undefined || p === null) {
        return defaultPort;
      }
      if (typeof p === 'string') {
        const upper = p.trim().toUpperCase();
        if (['A', 'B', 'C', 'D', 'E', 'F'].includes(upper)) {
          return upper as MotorPort;
        }
      }
      throw new Error(`Invalid port: ${p}`);
    };

    const normLeft = normalizePort(leftPort, self.engine.robot ? self.engine.robot.driveLeftPort : 'A');
    const normRight = normalizePort(rightPort, self.engine.robot ? self.engine.robot.driveRightPort : 'B');

    if (normLeft === normRight) {
      throw new Error(`Left and right motor ports cannot be the same port: ${normLeft}`);
    }

    self.engine.robot?.setDrivePorts(normLeft, normRight);

    const motorL = self.engine.robot?.motors.get(normLeft) || self.engine.robot?.motors.get('A');
    const motorR = self.engine.robot?.motors.get(normRight) || self.engine.robot?.motors.get('B');
    let defaultSpeed = 50;

    // Wheel physical specs:
    // Diameter = 56mm, Circumference = PI * 5.6cm = ~17.5929cm
    const wheelCircumferenceCm = 2 * Math.PI * (self.engine.robot.wheelRadius * 100);

    const distanceToDegrees = (amount: number, unit: string, speedPercent: number = defaultSpeed) => {
      switch ((unit || 'cm').toLowerCase()) {
        case 'cm':
          return (amount / wheelCircumferenceCm) * 360;
        case 'in':
        case 'inch':
        case 'inches':
          return ((amount * 2.54) / wheelCircumferenceCm) * 360;
        case 'rotations':
          return amount * 360;
        case 'seconds':
        case 'sec':
        case 's': {
          const maxSpeed = motorL?.maxSpeedDegPerSec || 1000;
          const degPerSec = Math.abs((speedPercent / 100) * maxSpeed);
          return amount * degPerSec;
        }
        case 'degrees':
        case 'deg':
        default:
          return amount;
      }
    };

    return {
      set_default_speed: (speed: number) => {
        defaultSpeed = speed;
      },
      start: (arg1: any = 0, arg2?: any) => {
        self.checkAborted();
        let steering = 0;
        let speed = defaultSpeed;

        if (typeof arg1 === 'object' && arg1 !== null) {
          if (arg1.steering !== undefined) steering = arg1.steering;
          if (arg1.speed !== undefined) speed = arg1.speed;
        } else if (typeof arg1 === 'number') {
          steering = arg1;
          if (typeof arg2 === 'number') speed = arg2;
        } else if (arg2 !== undefined) {
          speed = arg2;
        }

        // Clamp steering to -100 .. 100
        steering = Math.max(-100, Math.min(100, steering));
        let leftSpeed = speed;
        let rightSpeed = speed;
        if (steering > 0) {
          rightSpeed = speed * (1 - (2 * steering) / 100);
        } else if (steering < 0) {
          leftSpeed = speed * (1 - (2 * Math.abs(steering)) / 100);
        }
        motorL?.start(leftSpeed);
        motorR?.start(rightSpeed);
      },
      start_tank: (leftSpeed: number, rightSpeed: number) => {
        self.checkAborted();
        motorL?.start(leftSpeed);
        motorR?.start(rightSpeed);
      },
      stop: () => {
        motorL?.stop();
        motorR?.stop();
        self.engine.robot?.brakeChassisAndWheels();
      },
      move: async (amount: number, unit = 'cm', steeringOrOptions: any = 0, speedArg?: number) => {
        self.checkAborted();
        let steering = 0;
        let spd = defaultSpeed;

        if (typeof steeringOrOptions === 'object' && steeringOrOptions !== null) {
          if (steeringOrOptions.steering !== undefined) steering = steeringOrOptions.steering;
          if (steeringOrOptions.speed !== undefined) spd = steeringOrOptions.speed;
        } else if (typeof steeringOrOptions === 'number') {
          steering = steeringOrOptions;
          if (typeof speedArg === 'number') spd = speedArg;
        } else if (speedArg !== undefined) {
          spd = speedArg;
        }

        const targetDeg = distanceToDegrees(amount, unit, spd);

        let leftSpeed = spd;
        let rightSpeed = spd;
        if (steering > 0) {
          rightSpeed = spd * (1 - (2 * steering) / 100);
        } else if (steering < 0) {
          leftSpeed = spd * (1 - (2 * Math.abs(steering)) / 100);
        }

        const maxSpeed = Math.max(Math.abs(leftSpeed), Math.abs(rightSpeed));
        if (maxSpeed < 1e-4 || Math.abs(targetDeg) < 1e-4) {
          return;
        }

        const targetDegL = targetDeg * (Math.abs(leftSpeed) / maxSpeed);
        const targetDegR = targetDeg * (Math.abs(rightSpeed) / maxSpeed);

        return new Promise<void>((resolve, reject) => {
          let leftDone = Math.abs(leftSpeed) < 1e-4;
          let rightDone = Math.abs(rightSpeed) < 1e-4;

          const checkDone = () => {
            if (leftDone && rightDone) {
              self.engine.robot?.brakeChassisAndWheels();
              resolve();
            }
          };

          if (!leftDone) {
            if (motorL) {
              motorL.runForDegrees(targetDegL, leftSpeed, () => {
                leftDone = true;
                checkDone();
              });
            } else {
              leftDone = true;
            }
          }
          if (!rightDone) {
            if (motorR) {
              motorR.runForDegrees(targetDegR, rightSpeed, () => {
                rightDone = true;
                checkDone();
              });
            } else {
              rightDone = true;
            }
          }

          checkDone();

          const abortCheck = setInterval(() => {
            if (self.abortSignal?.aborted) {
              clearInterval(abortCheck);
              motorL?.stop();
              motorR?.stop();
              reject(new Error('Aborted'));
            }
            if (leftDone && rightDone) {
              clearInterval(abortCheck);
            }
          }, 30);
        });
      },
      move_tank: async (
        amount: number,
        unit = 'degrees',
        leftSpeedOrOptions: any = 50,
        rightSpeedArg: number = 50
      ) => {
        self.checkAborted();
        let leftSpeed = 50;
        let rightSpeed = 50;

        if (typeof leftSpeedOrOptions === 'object' && leftSpeedOrOptions !== null) {
          if (leftSpeedOrOptions.left_speed !== undefined) leftSpeed = leftSpeedOrOptions.left_speed;
          else if (leftSpeedOrOptions.leftSpeed !== undefined) leftSpeed = leftSpeedOrOptions.leftSpeed;
          if (leftSpeedOrOptions.right_speed !== undefined) rightSpeed = leftSpeedOrOptions.right_speed;
          else if (leftSpeedOrOptions.rightSpeed !== undefined) rightSpeed = leftSpeedOrOptions.rightSpeed;
        } else if (typeof leftSpeedOrOptions === 'number') {
          leftSpeed = leftSpeedOrOptions;
          if (typeof rightSpeedArg === 'number') rightSpeed = rightSpeedArg;
        }

        const maxSpeed = Math.max(Math.abs(leftSpeed), Math.abs(rightSpeed));
        const targetDeg = distanceToDegrees(amount, unit, maxSpeed);
        if (maxSpeed < 1e-4 || Math.abs(targetDeg) < 1e-4) {
          return;
        }

        const targetDegL = targetDeg * (Math.abs(leftSpeed) / maxSpeed);
        const targetDegR = targetDeg * (Math.abs(rightSpeed) / maxSpeed);

        return new Promise<void>((resolve, reject) => {
          let leftDone = Math.abs(leftSpeed) < 1e-4;
          let rightDone = Math.abs(rightSpeed) < 1e-4;

          const checkDone = () => {
            if (leftDone && rightDone) {
              self.engine.robot?.brakeChassisAndWheels();
              resolve();
            }
          };

          if (!leftDone) {
            if (motorL) {
              motorL.runForDegrees(targetDegL, leftSpeed, () => {
                leftDone = true;
                checkDone();
              });
            } else {
              leftDone = true;
            }
          }
          if (!rightDone) {
            if (motorR) {
              motorR.runForDegrees(targetDegR, rightSpeed, () => {
                rightDone = true;
                checkDone();
              });
            } else {
              rightDone = true;
            }
          }

          checkDone();

          const abortCheck = setInterval(() => {
            if (self.abortSignal?.aborted) {
              clearInterval(abortCheck);
              motorL?.stop();
              motorR?.stop();
              reject(new Error('Aborted'));
            }
            if (leftDone && rightDone) {
              clearInterval(abortCheck);
            }
          }, 30);
        });
      },
    };
  }

  public createColorSensor(port: any = 'C') {
    const self = this;
    const normalizedPort: 'C' | 'D' = String(port).toUpperCase() === 'D' ? 'D' : 'C';
    return {
      port: normalizedPort,
      get_reflected_light: () => {
        self.checkAborted();
        return self.sensors.sampleColorSensor(normalizedPort).reflectedLight;
      },
      get_color: () => {
        self.checkAborted();
        return self.sensors.sampleColorSensor(port).color;
      },
      get_rgb: () => {
        self.checkAborted();
        return self.sensors.sampleColorSensor(port).rgb;
      },
    };
  }

  public createDistanceSensor() {
    const self = this;
    return {
      get_distance_cm: () => {
        self.checkAborted();
        return self.sensors.sampleDistanceSensor();
      },
    };
  }
}
