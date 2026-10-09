# FLL Advance Driving Base Guide

The **Advance Driving Base** is the standard reference robot used in FIRST LEGO League competitions around the world. It provides a balanced, reliable platform with dual motors for differential drive, a rear caster for low-friction gliding, and downward-facing color sensors for navigation.

---

## Technical Specifications

| Component | Part ID | Description | Sim Offsets & Physics |
|---|---|---|---|
| **SPIKE Prime Hub** | 45601 | 6-axis gyro/accelerometer, battery, 5x5 LED matrix | Center of chassis, mass: 215g |
| **Left Drive Motor** | 45602 | Angular Medium/Large Motor | Port A, anchor: `[-0.064m, -0.007m, 0m]` |
| **Right Drive Motor** | 45602 | Angular Medium/Large Motor | Port B, anchor: `[0.064m, -0.007m, 0m]` |
| **Drive Wheels (Pair)** | 56145 | 56mm diameter x 26mm width balloon rubber tires | Friction: 1.0, Radius: 0.028m |
| **Rear Caster Skid** | 49283 | Ball caster housing & 16mm steel ball | Friction: 0.005, Offset: `[0, -0.025m, -0.065m]` |
| **Color Sensor Left** | 45605 | Downward facing reflection sensor | Port C, Offset: `[-0.024m, -0.01m, 0.075m]` |
| **Color Sensor Right** | 45605 | Downward facing reflection sensor | Port D, Offset: `[0.024m, -0.01m, 0.075m]` |
| **Chassis Beams & Frames** | 39793, 32524 | Technic 11x15 and 7L structural frames | Compound box colliders |

---

## Physical Dimensions

* **Track Width ($W$)**: 128 mm (16 Technic studs apart).
* **Wheel Diameter ($D$)**: 56 mm.
* **Wheel Circumference ($C$)**: $\approx 17.59$ cm.
* **Total Mass**: $\approx 475$ g.
* **Ground Clearance**: 8 mm to 12 mm above the vinyl mat.

---

## Port Configuration

* **Port A**: Left Drive Motor
* **Port B**: Right Drive Motor
* **Port C**: Left Downward Color Sensor
* **Port D**: Right Downward Color Sensor
* **Internal**: 6-Axis Motion Sensor (Gyro) in PrimeHub
