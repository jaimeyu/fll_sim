# SPIKE Prime Python API Reference

`fll-sim` emulates the official LEGO SPIKE Prime Python API, allowing teams to test competition programs directly in the web browser.

---

## 1. PrimeHub & MotionSensor (Gyro)

```python
from spike import PrimeHub

hub = PrimeHub()

# Reset Gyro heading to 0 degrees
hub.motion_sensor.reset_yaw_angle()

# Read current yaw heading (-180 to +180 degrees)
yaw = hub.motion_sensor.get_yaw_angle()
print("Current Yaw:", yaw)
```

---

## 2. MotorPair

```python
from spike import MotorPair

motors = MotorPair('A', 'B')

# Configure default speed (0 to 100%)
motors.set_default_speed(50)

# Move for specific distance or degrees
motors.move(30, 'cm')               # Drive 30 cm straight
motors.move(360, 'degrees')         # Move wheels 1 full rotation

# Steering move (steering: -100 hard left to +100 hard right)
motors.move(20, 'cm', steering=25)

# Tank move (independent left and right speeds)
motors.move_tank(180, 'degrees', left_speed=40, right_speed=-40)

# Continuous movement
motors.start(steering=0, speed=50)
motors.start_tank(30, 30)
motors.stop()
```

---

## 3. ColorSensor

```python
from spike import ColorSensor

color_sensor = ColorSensor('C')

# Get reflected light intensity (0 to 100%)
# ~10-25% on black lines, ~80-100% on white mat
light = color_sensor.get_reflected_light()

# Get classified color name
# 'black', 'white', 'red', 'green', 'blue', 'yellow', 'none'
color_name = color_sensor.get_color()
```

---

## 4. Control Functions

```python
from spike.control import wait_for_seconds

# Non-blocking async sleep (yields execution to the physics engine)
wait_for_seconds(1.0)
```

---

## 5. Sample Competition Missions

### Mission 1: Straight Drive (30 cm)
```python
from spike import MotorPair

motors = MotorPair('A', 'B')
motors.set_default_speed(50)
print("Driving 30 cm forward...")
motors.move(30, 'cm')
print("Done!")
```

### Mission 2: Gyro 90° Turn
```python
from spike import PrimeHub, MotorPair
from spike.control import wait_for_seconds

hub = PrimeHub()
motors = MotorPair('A', 'B')

hub.motion_sensor.reset_yaw_angle()
wait_for_seconds(0.2)

# Pivot turn until 90 degrees reached
motors.start_tank(35, -35)
while hub.motion_sensor.get_yaw_angle() < 90:
    wait_for_seconds(0.01)

motors.stop()
print("Turn completed at yaw:", hub.motion_sensor.get_yaw_angle())
```

### Mission 3: Proportional Line Follower (P-Controller)
```python
from spike import MotorPair, ColorSensor
from spike.control import wait_for_seconds

motors = MotorPair('A', 'B')
color_c = ColorSensor('C')

target_light = 50   # Edge of line target (50% reflected light)
kp = 0.85           # Proportional gain
base_speed = 35     # Base driving velocity

for step in range(250):
    light = color_c.get_reflected_light()
    error = target_light - light
    steering = error * kp
    motors.start(steering, base_speed)
    wait_for_seconds(0.02)

motors.stop()
print("Line following sequence finished!")
```

### Mission 4: Dual-Sensor Line Squaring
```python
from spike import MotorPair, ColorSensor
from spike.control import wait_for_seconds

motors = MotorPair('A', 'B')
sensor_c = ColorSensor('C') # Left
sensor_d = ColorSensor('D') # Right

# Drive toward line
motors.start(0, 30)
while sensor_c.get_reflected_light() > 30 and sensor_d.get_reflected_light() > 30:
    wait_for_seconds(0.01)
motors.stop()

# Align both sensors on the black line
for i in range(100):
    left_light = sensor_c.get_reflected_light()
    right_light = sensor_d.get_reflected_light()
    
    left_spd = 15 if left_light > 30 else 0
    right_spd = 15 if right_light > 30 else 0
    
    if left_spd == 0 and right_spd == 0:
        break
        
    motors.start_tank(left_spd, right_spd)
    wait_for_seconds(0.02)

motors.stop()
print("Robot perfectly squared to line!")
```
