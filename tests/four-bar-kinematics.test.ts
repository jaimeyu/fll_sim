import { describe, it, expect } from 'vitest';
import {
  analyzeGrashof,
  solveFourBarPose,
  generateCouplerPath,
  holesToMm,
  mmToHoles,
  POPULAR_FLL_LINKAGE_PRESETS,
  LEGO_STUD_PITCH_MM,
} from '../src/utils/four-bar-kinematics';

describe('Four-Bar Linkage Kinematics & LEGO Technic Mechanics Engine', () => {
  describe('1. LEGO Technic Unit Conversions', () => {
    it('converts LEGO hole units to millimeters using standard 8mm pitch', () => {
      expect(LEGO_STUD_PITCH_MM).toBe(8.0);
      expect(holesToMm(1)).toBe(8.0);
      expect(holesToMm(5)).toBe(40.0);
      expect(holesToMm(7)).toBe(56.0);
      expect(holesToMm(15)).toBe(120.0);
    });

    it('converts millimeters back to LEGO hole units', () => {
      expect(mmToHoles(8.0)).toBe(1.0);
      expect(mmToHoles(56.0)).toBe(7.0);
      expect(mmToHoles(120.0)).toBe(15.0);
    });
  });

  describe('2. Grashof Criterion & Classification', () => {
    it('classifies Crank-Rocker when shortest link is the input crank', () => {
      // Ground = 9, Crank = 3, Coupler = 8, Follower = 7
      // Shortest = 3, Longest = 9. S+L = 12. P+Q = 7+8 = 15. S+L <= P+Q -> Grashof!
      const analysis = analyzeGrashof({ ground: 9, crank: 3, coupler: 8, follower: 7 });
      expect(analysis.isGrashof).toBe(true);
      expect(analysis.classification).toBe('CRANK_ROCKER');
      expect(analysis.canCrankRotate360).toBe(true);
      expect(analysis.shortest).toBe(3);
      expect(analysis.longest).toBe(9);
      expect(analysis.sumShortLong).toBe(12);
      expect(analysis.sumOtherTwo).toBe(15);
      expect(analysis.simpleExplanation).toContain('Windshield Wiper');
    });

    it('classifies Parallelogram when opposite links are equal', () => {
      const analysis = analyzeGrashof({ ground: 9, crank: 5, coupler: 9, follower: 5 });
      expect(analysis.isGrashof).toBe(true);
      expect(analysis.classification).toBe('PARALLELOGRAM');
      expect(analysis.canCrankRotate360).toBe(true);
      expect(analysis.simpleExplanation).toContain('Parallel Lifter');
    });

    it('classifies Double-Crank (Drag-Link) when shortest link is the ground', () => {
      // Ground = 2, Crank = 6, Coupler = 5, Follower = 5
      // Shortest = 2, Longest = 6. S+L = 8. P+Q = 10. S+L <= P+Q -> Grashof!
      const analysis = analyzeGrashof({ ground: 2, crank: 6, coupler: 5, follower: 5 });
      expect(analysis.isGrashof).toBe(true);
      expect(analysis.classification).toBe('DOUBLE_CRANK');
      expect(analysis.canCrankRotate360).toBe(true);
      expect(analysis.shortest).toBe(2);
      expect(analysis.simpleExplanation).toContain('360° Spinner');
    });

    it('classifies Non-Grashof Triple-Rocker when S + L > P + Q', () => {
      // Ground = 13, Crank = 8, Coupler = 7, Follower = 9
      // Shortest = 7, Longest = 13. S+L = 20. P+Q = 8+9 = 17. S+L > P+Q -> Non-Grashof!
      const analysis = analyzeGrashof({ ground: 13, crank: 8, coupler: 7, follower: 9 });
      expect(analysis.isGrashof).toBe(false);
      expect(analysis.classification).toBe('NON_GRASHOF_TRIPLE_ROCKER');
      expect(analysis.canCrankRotate360).toBe(false);
      expect(analysis.simpleExplanation).toContain('Double Swinger');
    });

    it('detects geometrically impossible links (violating polygon inequality)', () => {
      // One link is longer than the sum of the other three: e.g. Ground = 30, others = 2, 2, 2
      const analysis = analyzeGrashof({ ground: 30, crank: 2, coupler: 2, follower: 2 });
      expect(analysis.classification).toBe('IMPOSSIBLE_GEOMETRY');
      expect(analysis.isGrashof).toBe(false);
      expect(analysis.description).toContain('Impossible linkage');
    });
  });

  describe('3. Forward Kinematics & Pose Calculation', () => {
    it('verifies Parallelogram kinematic invariants (theta4 = theta2, coupler stays horizontal)', () => {
      const links = { ground: 10, crank: 4, coupler: 10, follower: 4 };

      const anglesDeg = [0, 30, 45, 90, 135, 180, 270];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const pose = solveFourBarPose(links, rad, 'OPEN');

        expect(pose.isValidClosure).toBe(true);
        expect(pose.pA).toEqual({ x: 0, y: 0 });
        expect(pose.pD).toEqual({ x: 10, y: 0 });

        // In a parallelogram, pB.y == pC.y and pC.x - pB.x == ground == 10
        expect(Math.abs(pose.pC.y - pose.pB.y)).toBeLessThan(1e-4);
        expect(Math.abs(pose.pC.x - pose.pB.x - 10)).toBeLessThan(1e-4);

        // Coupler angle theta3 should be 0 radians (horizontal)
        expect(Math.abs(pose.theta3Rad)).toBeLessThan(1e-4);

        // Distance between B and C must equal coupler length (10)
        const distBC = Math.hypot(pose.pC.x - pose.pB.x, pose.pC.y - pose.pB.y);
        expect(Math.abs(distBC - 10)).toBeLessThan(1e-4);

        // Distance between D and C must equal follower length (4)
        const distDC = Math.hypot(pose.pC.x - pose.pD.x, pose.pC.y - pose.pD.y);
        expect(Math.abs(distDC - 4)).toBeLessThan(1e-4);
      }
    });

    it('successfully computes all 360 degrees for a Crank-Rocker preset without failure', () => {
      const preset = POPULAR_FLL_LINKAGE_PRESETS.find((p) => p.id === 'windshield_wiper')!;
      expect(preset).toBeDefined();

      for (let deg = 0; deg < 360; deg += 5) {
        const rad = (deg * Math.PI) / 180;
        const pose = solveFourBarPose(preset.links, rad, preset.defaultBranch);
        expect(pose.isValidClosure).toBe(true);

        // Verify link lengths are conserved
        const lenAB = Math.hypot(pose.pB.x - pose.pA.x, pose.pB.y - pose.pA.y);
        const lenBC = Math.hypot(pose.pC.x - pose.pB.x, pose.pC.y - pose.pB.y);
        const lenCD = Math.hypot(pose.pC.x - pose.pD.x, pose.pC.y - pose.pD.y);

        expect(Math.abs(lenAB - preset.links.crank)).toBeLessThan(1e-4);
        expect(Math.abs(lenBC - preset.links.coupler)).toBeLessThan(1e-4);
        expect(Math.abs(lenCD - preset.links.follower)).toBeLessThan(1e-4);
      }
    });

    it('correctly reports transmission angle quality', () => {
      // When coupler and follower are perpendicular, transmission angle is 90 deg (OPTIMAL)
      const links = { ground: 10, crank: 4, coupler: 10, follower: 4 };
      const pose90 = solveFourBarPose(links, Math.PI / 2, 'OPEN');
      expect(pose90.isValidClosure).toBe(true);
      expect(pose90.transmissionQuality).toBe('OPTIMAL');
      expect(Math.abs(pose90.transmissionAngleDeg - 90)).toBeLessThan(1e-3);
    });

    it('handles coupler point tracer calculations with offset perpendicular to bar', () => {
      const links = { ground: 8, crank: 4, coupler: 10, follower: 10 };
      const couplerPoint = { alongBar: 5, perpendicular: 4 };
      const pose = solveFourBarPose(links, Math.PI / 4, 'OPEN', couplerPoint);

      expect(pose.isValidClosure).toBe(true);
      expect(pose.pP).toBeDefined();

      // Distance from midpoint of BC to P should equal perpendicular offset (4)
      const midBCx = (pose.pB.x + pose.pC.x) / 2;
      const midBCy = (pose.pB.y + pose.pC.y) / 2;
      const distMidToP = Math.hypot(pose.pP.x - midBCx, pose.pP.y - midBCy);
      expect(Math.abs(distMidToP - 4)).toBeLessThan(1e-4);
    });

    it('generates a full coupler curve trajectory', () => {
      const preset = POPULAR_FLL_LINKAGE_PRESETS.find((p) => p.id === 'chebyshev_walker')!;
      const path = generateCouplerPath(preset.links, preset.defaultBranch, preset.couplerPoint, 72);
      expect(path.length).toBeGreaterThan(50);
      path.forEach((pt) => {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });

    it('returns an invalid pose when crank position cannot reach closure', () => {
      // In a non-Grashof linkage, at certain angles the crank cannot reach closure
      const links = { ground: 12, crank: 3, coupler: 3, follower: 3 };
      // Max reach of coupler + follower = 6. But distance from B to D when theta = 180 is 12 - (-3) = 15!
      const pose = solveFourBarPose(links, Math.PI, 'OPEN');
      expect(pose.isValidClosure).toBe(false);
      expect(pose.errorMessage).toContain('Linkage cannot close');
    });
  });

  describe('4. Standard FLL Presets Integrity', () => {
    it('verifies all popular FLL presets have valid configurations and positive lengths', () => {
      expect(POPULAR_FLL_LINKAGE_PRESETS.length).toBeGreaterThanOrEqual(5);

      for (const preset of POPULAR_FLL_LINKAGE_PRESETS) {
        expect(preset.links.ground).toBeGreaterThan(0);
        expect(preset.links.crank).toBeGreaterThan(0);
        expect(preset.links.coupler).toBeGreaterThan(0);
        expect(preset.links.follower).toBeGreaterThan(0);

        // Verify initial pose at angle 0.5 rad calculates cleanly
        const pose = solveFourBarPose(preset.links, 0.5, preset.defaultBranch, preset.couplerPoint);
        expect(pose.isValidClosure).toBe(true);
      }
    });
  });
});
