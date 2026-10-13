import { SimulationPhysicsEngine } from '../physics/engine';
import { VirtualSensorManager } from '../sensors/sensor-manager';
import { MotorPort } from '../physics/motor-controller';

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

  public createMotor(port: MotorPort) {
    const self = this;
    const motor = self.engine.robot.motors.get(port);
    let defaultSpeed = 50;

    return {
      port,
      set_default_speed: (speed: number) => {
        defaultSpeed = speed;
      },
      start: (speed?: number) => {
        self.checkAborted();
        motor?.start(speed !== undefined ? speed : defaultSpeed);
      },
      stop: () => {
        motor?.stop();
      },
      get_degrees_counted: () => {
        return Math.round(motor?.degrees || 0);
      },
      get_position: () => {
        return Math.round(motor?.degrees || 0);
      },
      get_speed: () => {
        return Math.round(motor?.velocityDegPerSec || 0);
      },
      run_for_degrees: async (degrees: number, speed?: number) => {
        self.checkAborted();
        if (!motor) return;
        const spd = speed !== undefined ? speed : defaultSpeed;
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
          }, 50);
        });
      },
      run_for_rotations: async (rotations: number, speed?: number) => {
        self.checkAborted();
        if (!motor) return;
        const spd = speed !== undefined ? speed : defaultSpeed;
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
          }, 50);
        });
      },
      run_for_seconds: async (seconds: number, speed?: number) => {
        self.checkAborted();
        if (!motor) return;
        const spd = speed !== undefined ? speed : defaultSpeed;
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
          }, 50);
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

    const distanceToDegrees = (amount: number, unit: string) => {
      switch (unit.toLowerCase()) {
        case 'cm':
          return (amount / wheelCircumferenceCm) * 360;
        case 'rotations':
          return amount * 360;
        case 'degrees':
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
      move: async (amount: number, unit = 'cm', steering = 0, speed?: number) => {
        self.checkAborted();
        const targetDeg = distanceToDegrees(amount, unit);
        const spd = speed !== undefined ? speed : defaultSpeed;

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
        leftSpeed = 50,
        rightSpeed = 50
      ) => {
        self.checkAborted();
        const targetDeg = distanceToDegrees(amount, unit);
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
