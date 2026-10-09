# CAD Model Import Guide

`fll-sim` supports importing custom robot designs created in **BrickLink Studio** (`.io`) or **LeoCAD / LDraw** (`.ldr`, `.mpd`).

---

## 1. Importing BrickLink Studio (`.io`) Models

BrickLink Studio is the most popular CAD tool used by FIRST LEGO League teams.
Studio saves files in the `.io` format, which is an unencrypted ZIP archive containing:
* `model.ldr`: The LDraw-formatted structural part hierarchy
* `thumbnail.png`: Rendered thumbnail preview

### How to Import
1. In BrickLink Studio, save your robot model (`File` $\to$ `Save As...` $\to$ `my_robot.io`).
2. Open the FLL Robot Simulator in your browser.
3. In the top navigation bar, click **📂 Import Studio .io / .ldr**.
4. Select your `.io` file.
5. The pre-solver will automatically:
   * Unpack the model hierarchy
   * Map part numbers to Technic physical mass and dimensions
   * Cluster all static beams and pins
   * Spawn your robot on the virtual competition table!

---

## 2. Importing LeoCAD / LDraw (`.ldr`, `.mpd`)

If you use LeoCAD or the official LDraw library:
1. Export your model as `.ldr` (`File` $\to$ `Export` $\to$ `LDraw...`).
2. Upload the `.ldr` file through the **📂 Import** button.

---

## 3. Modeling Best Practices for Simulation

To ensure your CAD model clusters cleanly into the proper kinematic bodies:
* **Friction Pins vs. Axles**: Use standard friction pins (`2780`, `6558`) to connect beams rigidly to the chassis.
* **Motor Mounting**: Ensure motor stators (`45601`, `45602`) are rigidly pinned to the frame.
* **Wheel Axles**: Ensure wheel rims (`56145`) are connected to motor output shafts with cross-axles. The clustering solver will automatically detect the 1-DOF rotational freedom and configure a revolute joint.

---

## 4. Official Season Mission Models & Community Attribution

The official FLL competition mission models available in the simulator (Bioglow, Unearthed, Submerged, Masterpiece, Superpowered) were converted and modeled in BrickLink Studio format by **Komurobo**.

* **Model Source:** [Komurobo FLL 3D Models](https://komurobo.com/fll/3d-models/)
* **Contact & Project:** [Komurobo.com](https://komurobo.com/) (`info@komurobo.com`)
* **Community Notice:** We gratefully credit the independent creators at Komurobo for making these digital assets available to the global robotics education community. Komurobo is an independent initiative not affiliated with FIRST® or Robotique FIRST Québec. All LEGO®, Technic™, and SPIKE™ trademarks belong to the LEGO Group, used here for non-commercial educational robotics practice.
