import type { Point } from './DrawingUtils';
import { FABRIKSolver } from './FABRIK';

export interface LegJoint extends Point {
	width: number;
}

export class Leg {
	solver: FABRIKSolver;
	targetFootPos: Point;
	currentFootPos: Point;
	attachmentIndex: number; // Which body point this leg is attached to
	side: 'left' | 'right';
	maxLegReach: number; // Total length of all leg segments
	jointWidths: number[]; // Width at each joint for body rendering
	poleStrength: number = 0.7; // How strongly to enforce knee direction (0-1)
	
	isMoving: boolean = false;
	stepProgress: number = 0;
	stepStartPos: Point;
	stepTargetPos: Point;
	
	// Store body direction for pole calculation
	lastBodyDirection: Point = { x: 0, y: 1 };

	constructor(
		attachmentIndex: number,
		side: 'left' | 'right',
		segmentLengths: number[]
	) {
		this.attachmentIndex = attachmentIndex;
		this.side = side;
		this.maxLegReach = segmentLengths.reduce((sum, len) => sum + len, 0);
		
		// Initialize solver
		this.solver = new FABRIKSolver(0, 0, segmentLengths);
		
		// Initialize joint widths - taper from thick at body to thin at foot
		this.jointWidths = [];
		for (let i = 0; i < this.solver.joints.length; i++) {
			const t = i / (this.solver.joints.length - 1);
			// Start thick, end thin
			this.jointWidths.push(12 * (1 - t * 0.7)); // 12 to ~3.6
		}
		
		// Initialize foot positions (will be set properly on first update)
		this.currentFootPos = { x: 0, y: 0 };
		this.targetFootPos = { x: 0, y: 0 };
		this.stepStartPos = { x: 0, y: 0 };
		this.stepTargetPos = { x: 0, y: 0 };
	}

	/**
	 * Initialize foot position at rest (perpendicular to body at half reach)
	 */
	initializeAtRest(attachmentPoint: Point, bodyDirection: Point) {
		const perpX = -bodyDirection.y;
		const perpY = bodyDirection.x;
		const sideMultiplier = this.side === 'left' ? 1 : -1;
		
		// Start at perpendicular position, half the max reach out
		const halfReach = this.maxLegReach * 0.5;
		this.currentFootPos = {
			x: attachmentPoint.x + perpX * halfReach * sideMultiplier,
			y: attachmentPoint.y + perpY * halfReach * sideMultiplier
		};
		this.targetFootPos = { ...this.currentFootPos };
		this.stepStartPos = { ...this.currentFootPos };
		this.stepTargetPos = { ...this.currentFootPos };
	}

	/**
	 * Update leg based on body attachment point
	 */
	update(attachmentPoint: Point, bodyDirection: Point) {
		// Store body direction for pole calculation
		this.lastBodyDirection = { ...bodyDirection };
		
		// Calculate perpendicular direction for leg extension
		const perpX = -bodyDirection.y;
		const perpY = bodyDirection.x;
		const sideMultiplier = this.side === 'left' ? 1 : -1;
		
		// Check if current foot position is on the wrong side and enforce constraint
		let footToAttachX = this.currentFootPos.x - attachmentPoint.x;
		let footToAttachY = this.currentFootPos.y - attachmentPoint.y;
		const currentPerpDot = footToAttachX * perpX + footToAttachY * perpY;
		
		// If foot is on wrong side or too close to center, trigger a step to reposition
		const minPerpDistance = this.maxLegReach * 0.25;
		const isOnWrongSide = (this.side === 'left' && currentPerpDot < minPerpDistance) || 
		                      (this.side === 'right' && currentPerpDot > -minPerpDistance);
		
		if (isOnWrongSide && !this.isMoving) {
			// Trigger a step to reposition the foot to a safe location
			this.isMoving = true;
			this.stepProgress = 0;
			this.stepStartPos = { ...this.currentFootPos };
			
			// Place foot at safe distance on correct side, slightly forward
			const halfReach = this.maxLegReach * 0.5;
			const forwardOffset = this.maxLegReach * 0.2; // Place slightly forward
			this.stepTargetPos = {
				x: attachmentPoint.x + perpX * halfReach * sideMultiplier + bodyDirection.x * forwardOffset,
				y: attachmentPoint.y + perpY * halfReach * sideMultiplier + bodyDirection.y * forwardOffset
			};
		}
		
		// Calculate distance from attachment point to current foot position
		const distanceToFoot = Math.sqrt(footToAttachX * footToAttachX + footToAttachY * footToAttachY);
		
		// If distance exceeds max leg reach, we need to step
		if (!this.isMoving && distanceToFoot > this.maxLegReach * 0.95) {
			// Start a new step
			this.isMoving = true;
			this.stepProgress = 0;
			this.stepStartPos = { ...this.currentFootPos };
			
			// Calculate where the foot is relative to the perpendicular axis
			// (how far forward/backward along the spine direction)
			const lateralOffset = footToAttachX * bodyDirection.x + footToAttachY * bodyDirection.y;
			
			// Mirror the position at 0.8x to prevent constant alternating
			// Also clamp to max half-reach so we don't overshoot
			const halfReach = this.maxLegReach * 0.5;
			const maxLateralOffset = this.maxLegReach * 0.4; // Don't go more than 40% forward/back
			let mirroredLateral = -lateralOffset * 0.8; // Mirror at 80%
			
			// Clamp the lateral offset
			mirroredLateral = Math.max(-maxLateralOffset, Math.min(maxLateralOffset, mirroredLateral));
			
			// Calculate new target position
			let targetX = attachmentPoint.x + perpX * halfReach * sideMultiplier + bodyDirection.x * mirroredLateral;
			let targetY = attachmentPoint.y + perpY * halfReach * sideMultiplier + bodyDirection.y * mirroredLateral;
			
			// Constraint: ensure footstep stays on the correct side of the body
			// Calculate which side of the perpendicular axis the target is on
			const targetToAttachX = targetX - attachmentPoint.x;
			const targetToAttachY = targetY - attachmentPoint.y;
			const perpDot = targetToAttachX * perpX + targetToAttachY * perpY;
			
			// If the foot has crossed to the wrong side, clamp it to the perpendicular axis
			if ((this.side === 'left' && perpDot < 0) || (this.side === 'right' && perpDot > 0)) {
				// Project back to the correct side - minimum distance from centerline
				const minPerpDistance = this.maxLegReach * 0.3; // Stay at least 30% of leg reach away from center
				targetX = attachmentPoint.x + perpX * minPerpDistance * sideMultiplier + bodyDirection.x * mirroredLateral;
				targetY = attachmentPoint.y + perpY * minPerpDistance * sideMultiplier + bodyDirection.y * mirroredLateral;
			}
			
			this.stepTargetPos = { x: targetX, y: targetY };
		}

		// Animate step
		if (this.isMoving) {
			this.stepProgress += 0.15; // Step speed
			
			if (this.stepProgress >= 1) {
				this.stepProgress = 1;
				this.isMoving = false;
				this.currentFootPos = { ...this.stepTargetPos };
			} else {
				// Smooth step with arc
				const t = this.stepProgress;
				const smoothT = t * t * (3 - 2 * t); // Smoothstep
				
				this.currentFootPos = {
					x: this.stepStartPos.x + (this.stepTargetPos.x - this.stepStartPos.x) * smoothT,
					y: this.stepStartPos.y + (this.stepTargetPos.y - this.stepStartPos.y) * smoothT - Math.sin(t * Math.PI) * 20 // Arc upward
				};
			}
		}

		// Calculate pole target for natural knee bending
		// The knee should bend "backwards" relative to body movement (like a spider leg)
		const poleTarget = this.calculatePoleTarget(attachmentPoint, bodyDirection);
		
		// Solve IK with pole target - this makes knees bend naturally
		this.solver.solve(this.currentFootPos, attachmentPoint, poleTarget, this.poleStrength);
	}

	/**
	 * Calculate the pole target for natural knee bending
	 * The knee should bend backwards (opposite to body forward direction)
	 */
	private calculatePoleTarget(attachmentPoint: Point, bodyDirection: Point): Point {
		// Perpendicular direction (leg extension direction)
		const perpX = -bodyDirection.y;
		const perpY = bodyDirection.x;
		const sideMultiplier = this.side === 'left' ? 1 : -1;
		
		// Midpoint between attachment and foot
		const midX = (attachmentPoint.x + this.currentFootPos.x) / 2;
		const midY = (attachmentPoint.y + this.currentFootPos.y) / 2;
		
		// The pole target should be:
		// 1. Offset outward from the body (same direction as the leg extends)
		// 2. Offset backward relative to body direction (opposite to where head is pointing)
		
		// Distance to push the pole target out
		const poleDistance = this.maxLegReach * 0.5;
		
		// Push outward (perpendicular to body, in leg direction)
		// AND backward (opposite to body direction) for natural spider-like bend
		const poleX = midX + perpX * poleDistance * sideMultiplier - bodyDirection.x * poleDistance;
		const poleY = midY + perpY * poleDistance * sideMultiplier - bodyDirection.y * poleDistance;
		
		return { x: poleX, y: poleY };
	}

	/**
	 * Get joint positions for rendering
	 */
	getJoints(): Point[] {
		return this.solver.joints;
	}

	/**
	 * Get joints with width information for body rendering
	 */
	getJointsWithWidth(): LegJoint[] {
		return this.solver.joints.map((joint, i) => ({
			x: joint.x,
			y: joint.y,
			width: this.jointWidths[i]
		}));
	}

	/**
	 * Get current foot position
	 */
	getFootPosition(): Point {
		return this.currentFootPos;
	}
}

