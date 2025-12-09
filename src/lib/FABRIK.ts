import type { Point } from './DrawingUtils';

/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver
 * with pole target support for natural joint bending
 */
export class FABRIKSolver {
	joints: Point[];
	lengths: number[];
	totalLength: number;

	constructor(startX: number, startY: number, segmentLengths: number[]) {
		this.lengths = segmentLengths;
		this.totalLength = segmentLengths.reduce((sum, len) => sum + len, 0);
		
		// Initialize joints in a straight line downward
		this.joints = [];
		let currentY = startY;
		this.joints.push({ x: startX, y: currentY });
		
		for (const length of segmentLengths) {
			currentY += length;
			this.joints.push({ x: startX, y: currentY });
		}
	}

	/**
	 * Solve IK to reach target position with optional pole target hint
	 * @param target The target position for the end effector
	 * @param anchor The fixed position for the base
	 * @param poleTarget Optional hint for which direction joints should bend toward
	 * @param poleStrength How much to bias toward the pole (0-1)
	 * @param iterations Number of iterations to run
	 */
	solve(target: Point, anchor: Point, poleTarget?: Point, poleStrength: number = 0.5, iterations: number = 10): Point[] {
		const n = this.joints.length;
		
		// Check if target is reachable
		const dist = Math.sqrt(
			(target.x - anchor.x) ** 2 + (target.y - anchor.y) ** 2
		);
		
		// If target is unreachable, extend toward it
		if (dist > this.totalLength) {
			const direction = {
				x: (target.x - anchor.x) / dist,
				y: (target.y - anchor.y) / dist
			};
			
			this.joints[0] = { ...anchor };
			for (let i = 1; i < n; i++) {
				this.joints[i] = {
					x: this.joints[i - 1].x + direction.x * this.lengths[i - 1],
					y: this.joints[i - 1].y + direction.y * this.lengths[i - 1]
				};
			}
			return this.joints;
		}

		// For 2-segment chains (3 joints), use analytical solution for perfect knee placement
		if (n === 3 && poleTarget) {
			this.solveTwoSegment(target, anchor, poleTarget);
			return this.joints;
		}

		// FABRIK iterations for longer chains
		for (let iter = 0; iter < iterations; iter++) {
			// Forward reaching: Start from end effector
			this.joints[n - 1] = { ...target };
			
			for (let i = n - 2; i >= 0; i--) {
				const dx = this.joints[i].x - this.joints[i + 1].x;
				const dy = this.joints[i].y - this.joints[i + 1].y;
				const distance = Math.sqrt(dx * dx + dy * dy);
				
				if (distance > 0) {
					const lambda = this.lengths[i] / distance;
					this.joints[i] = {
						x: this.joints[i + 1].x + dx * lambda,
						y: this.joints[i + 1].y + dy * lambda
					};
				}
			}

			// Backward reaching: Start from base
			this.joints[0] = { ...anchor };
			
			for (let i = 0; i < n - 1; i++) {
				const dx = this.joints[i + 1].x - this.joints[i].x;
				const dy = this.joints[i + 1].y - this.joints[i].y;
				const distance = Math.sqrt(dx * dx + dy * dy);
				
				if (distance > 0) {
					const lambda = this.lengths[i] / distance;
					this.joints[i + 1] = {
						x: this.joints[i].x + dx * lambda,
						y: this.joints[i].y + dy * lambda
					};
				}
			}

			// Apply pole target influence on middle joints
			if (poleTarget && poleStrength > 0) {
				this.applyPoleTarget(anchor, target, poleTarget, poleStrength);
			}

			// Check if we're close enough
			const endDist = Math.sqrt(
				(this.joints[n - 1].x - target.x) ** 2 +
				(this.joints[n - 1].y - target.y) ** 2
			);
			
			if (endDist < 0.1) break;
		}

		return this.joints;
	}

	/**
	 * Analytical solution for 2-segment IK (hip-knee-foot)
	 * Gives perfect knee placement based on pole direction
	 */
	private solveTwoSegment(target: Point, anchor: Point, poleTarget: Point) {
		const len1 = this.lengths[0]; // Upper leg
		const len2 = this.lengths[1]; // Lower leg
		
		this.joints[0] = { ...anchor };
		this.joints[2] = { ...target };
		
		// Distance from hip to foot
		const dx = target.x - anchor.x;
		const dy = target.y - anchor.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		
		// Clamp distance to valid range
		const minDist = Math.abs(len1 - len2);
		const maxDist = len1 + len2;
		const clampedDist = Math.max(minDist + 0.01, Math.min(maxDist - 0.01, dist));
		
		// Use law of cosines to find knee angle
		// a² = b² + c² - 2bc*cos(A)
		// cos(A) = (b² + c² - a²) / (2bc)
		const cosAngle = (len1 * len1 + clampedDist * clampedDist - len2 * len2) / (2 * len1 * clampedDist);
		const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
		
		// Direction from hip to foot
		const toFootX = dx / clampedDist;
		const toFootY = dy / clampedDist;
		
		// Perpendicular direction (for knee bend)
		// Decide which side based on pole target
		const poleToMidX = poleTarget.x - (anchor.x + target.x) / 2;
		const poleToMidY = poleTarget.y - (anchor.y + target.y) / 2;
		
		// Cross product to determine which perpendicular direction
		const cross = toFootX * poleToMidY - toFootY * poleToMidX;
		const bendSign = cross >= 0 ? 1 : -1;
		
		// Perpendicular direction (rotate 90 degrees)
		const perpX = -toFootY * bendSign;
		const perpY = toFootX * bendSign;
		
		// Calculate knee position
		// Rotate from hip-to-foot direction by the angle, scaled by upper leg length
		const kneeX = anchor.x + toFootX * Math.cos(angle) * len1 + perpX * Math.sin(angle) * len1;
		const kneeY = anchor.y + toFootY * Math.cos(angle) * len1 + perpY * Math.sin(angle) * len1;
		
		this.joints[1] = { x: kneeX, y: kneeY };
	}

	/**
	 * Apply pole target influence to middle joints
	 */
	private applyPoleTarget(anchor: Point, target: Point, poleTarget: Point, strength: number) {
		const n = this.joints.length;
		
		// Direction from anchor to target
		const chainDirX = target.x - anchor.x;
		const chainDirY = target.y - anchor.y;
		const chainLen = Math.sqrt(chainDirX * chainDirX + chainDirY * chainDirY);
		
		if (chainLen < 0.01) return;
		
		const chainNormX = chainDirX / chainLen;
		const chainNormY = chainDirY / chainLen;
		
		// For each middle joint, bias toward the pole
		for (let i = 1; i < n - 1; i++) {
			const joint = this.joints[i];
			const prev = this.joints[i - 1];
			const next = this.joints[i + 1];
			
			// Project joint onto the chain axis
			const toJointX = joint.x - anchor.x;
			const toJointY = joint.y - anchor.y;
			const projDist = toJointX * chainNormX + toJointY * chainNormY;
			
			// Point on the chain axis
			const projX = anchor.x + chainNormX * projDist;
			const projY = anchor.y + chainNormY * projDist;
			
			// Direction from projection to pole
			const toPoleX = poleTarget.x - projX;
			const toPoleY = poleTarget.y - projY;
			const toPoleLen = Math.sqrt(toPoleX * toPoleX + toPoleY * toPoleY);
			
			if (toPoleLen < 0.01) continue;
			
			// Calculate how much the joint should bulge out
			const distPrevNext = Math.sqrt((next.x - prev.x) ** 2 + (next.y - prev.y) ** 2);
			const len1 = this.lengths[i - 1];
			const len2 = this.lengths[i];
			
			// Max bulge when segments are perpendicular
			const maxBulge = Math.sqrt(len1 * len1 - (distPrevNext / 2) ** 2) || len1 * 0.5;
			
			// Target position: bulge in the direction of the pole
			const targetX = projX + (toPoleX / toPoleLen) * maxBulge;
			const targetY = projY + (toPoleY / toPoleLen) * maxBulge;
			
			// Blend current with target
			joint.x = joint.x * (1 - strength) + targetX * strength;
			joint.y = joint.y * (1 - strength) + targetY * strength;
			
			// Re-enforce segment length from previous joint
			const d1x = joint.x - prev.x;
			const d1y = joint.y - prev.y;
			const dist1 = Math.sqrt(d1x * d1x + d1y * d1y);
			if (dist1 > 0) {
				joint.x = prev.x + (d1x / dist1) * len1;
				joint.y = prev.y + (d1y / dist1) * len1;
			}
		}
		
		// Fix up the end effector position
		const lastMiddle = this.joints[n - 2];
		const lastLen = this.lengths[n - 2];
		const toEndX = target.x - lastMiddle.x;
		const toEndY = target.y - lastMiddle.y;
		const toEndDist = Math.sqrt(toEndX * toEndX + toEndY * toEndY);
		if (toEndDist > 0) {
			this.joints[n - 1] = {
				x: lastMiddle.x + (toEndX / toEndDist) * lastLen,
				y: lastMiddle.y + (toEndY / toEndDist) * lastLen
			};
		}
	}

	/**
	 * Get the end effector position (foot)
	 */
	getEndEffector(): Point {
		return this.joints[this.joints.length - 1];
	}
}

