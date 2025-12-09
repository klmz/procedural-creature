import type { Point } from './DrawingUtils';

export type SegmentType = 'head' | 'neck' | 'body';

export interface ChainPoint {
	x: number;
	y: number;
	prevX: number;
	prevY: number;
	pinned: boolean;
	width: number;
	segmentType: SegmentType;
	// Angle influence from legs (radians, positive = rotate clockwise)
	legInfluence: number;
}

export interface SegmentConfig {
	headSegments: number;
	neckSegments: number;
	bodySegments: number;
}

export class Chain {
	points: ChainPoint[];
	segmentLength: number;
	friction: number; // 0-1, where 1 = no friction, 0 = full friction
	maxAngle: number; // Maximum angle between segments in radians
	iterations: number = 5; // Number of constraint iterations per frame
	segmentConfig: SegmentConfig;
	
	// Undulation (snake-like movement)
	undulationPhase: number = 0;
	undulationSpeed: number = 0.15; // How fast the wave travels
	undulationAmplitude: number = 0.3; // Max amplitude (scales with speed)
	undulationWavelength: number = 0.8; // Wavelength as fraction of body length

	constructor(
		startX: number,
		startY: number,
		segmentConfig: SegmentConfig,
		segmentLength: number,
		friction: number = 0.95,
		maxAngleDegrees: number = 120,
		widths?: number[] | ((index: number, total: number) => number)
	) {
		this.points = [];
		this.segmentLength = segmentLength;
		this.friction = friction;
		this.maxAngle = (maxAngleDegrees * Math.PI) / 180; // Convert to radians
		this.segmentConfig = segmentConfig;

		const numPoints = segmentConfig.headSegments + segmentConfig.neckSegments + segmentConfig.bodySegments;

		// Create chain points
		for (let i = 0; i < numPoints; i++) {
			let width: number;
			if (Array.isArray(widths)) {
				width = widths[i] || 10;
			} else if (typeof widths === 'function') {
				width = widths(i, numPoints);
			} else {
				width = 10; // Default width
			}

			// Determine segment type based on index
			let segmentType: SegmentType;
			if (i < segmentConfig.headSegments) {
				segmentType = 'head';
			} else if (i < segmentConfig.headSegments + segmentConfig.neckSegments) {
				segmentType = 'neck';
			} else {
				segmentType = 'body';
			}

			this.points.push({
				x: startX,
				y: startY + i * segmentLength,
				prevX: startX,
				prevY: startY + i * segmentLength,
				pinned: i === 0, // First point is pinned (follows mouse)
				width,
				segmentType,
				legInfluence: 0
			});
		}
	}

	/**
	 * Get the total number of points
	 */
	get numPoints(): number {
		return this.points.length;
	}

	/**
	 * Get the index where body segments start
	 */
	get bodyStartIndex(): number {
		return this.segmentConfig.headSegments + this.segmentConfig.neckSegments;
	}

	/**
	 * Get indices of body segments (where legs can attach)
	 */
	getBodySegmentIndices(): number[] {
		const indices: number[] = [];
		const start = this.bodyStartIndex;
		for (let i = start; i < this.points.length; i++) {
			indices.push(i);
		}
		return indices;
	}

	/**
	 * Update physics simulation using Verlet integration
	 */
	update(deltaTime: number = 1) {
		// Calculate head velocity for undulation
		const head = this.points[0];
		const headVelX = head.x - head.prevX;
		const headVelY = head.y - head.prevY;
		const headSpeed = Math.sqrt(headVelX * headVelX + headVelY * headVelY);
		
		// Apply Verlet integration (velocity is implicit)
		for (let i = 0; i < this.points.length; i++) {
			const point = this.points[i];
			
			if (point.pinned) continue;

			// Calculate velocity from previous position
			const vx = point.x - point.prevX;
			const vy = point.y - point.prevY;

			// Store current position
			point.prevX = point.x;
			point.prevY = point.y;

			// Update position with velocity and friction
			point.x += vx * this.friction;
			point.y += vy * this.friction;
		}

		// Apply distance constraints multiple times for stability
		for (let iter = 0; iter < this.iterations; iter++) {
			this.applyDistanceConstraints();
			this.applyAngleConstraints();
		}
		
		// Apply snake-like undulation when moving
		if (headSpeed > 0.5) {
			this.applyUndulation(headSpeed);
		}
		
		// Apply leg influence only once per frame (not in constraint loop)
		this.applyLegInfluence();
		
		// Reset leg influence each frame (will be set fresh by leg system)
		for (const point of this.points) {
			point.legInfluence = 0;
		}
	}

	/**
	 * Set leg influence on a body segment (called from leg system)
	 * @param index The body segment index
	 * @param angleInfluence The angle influence in radians (positive = rotate segment clockwise)
	 */
	setLegInfluence(index: number, angleInfluence: number) {
		if (index >= 0 && index < this.points.length) {
			// Accumulate influences (multiple legs can affect same segment)
			this.points[index].legInfluence += angleInfluence;
		}
	}

	/**
	 * Apply snake-like undulation to the body
	 * Creates a traveling sine wave perpendicular to the spine
	 */
	private applyUndulation(speed: number) {
		// Advance the wave phase based on speed
		this.undulationPhase += this.undulationSpeed * Math.min(speed, 3);
		
		// Calculate amplitude based on speed (faster = more undulation, but capped)
		const speedFactor = Math.min(speed / 2, 1);
		const amplitude = this.undulationAmplitude * speedFactor * this.segmentLength;
		
		// Skip the head (index 0) - it's controlled by input
		// Start from neck/body and apply the wave
		for (let i = 1; i < this.points.length; i++) {
			const point = this.points[i];
			if (point.pinned) continue;
			
			const prev = this.points[i - 1];
			
			// Calculate spine direction at this point
			let dirX = point.x - prev.x;
			let dirY = point.y - prev.y;
			const len = Math.sqrt(dirX * dirX + dirY * dirY);
			
			if (len === 0) continue;
			
			dirX /= len;
			dirY /= len;
			
			// Perpendicular direction (for side-to-side motion)
			const perpX = -dirY;
			const perpY = dirX;
			
			// Calculate phase for this segment (wave travels from head to tail)
			const t = i / (this.points.length - 1);
			const phaseOffset = t * Math.PI * 2 * this.undulationWavelength;
			
			// Sine wave - starts small at head, increases toward middle, decreases at tail
			// This envelope creates a more natural S-curve
			const envelope = Math.sin(t * Math.PI); // 0 at head, 1 at middle, 0 at tail
			const wave = Math.sin(this.undulationPhase - phaseOffset) * envelope;
			
			// Apply the offset perpendicular to the spine
			const offsetX = perpX * wave * amplitude;
			const offsetY = perpY * wave * amplitude;
			
			// Blend the undulation into the position (subtle effect)
			point.x += offsetX * 0.1;
			point.y += offsetY * 0.1;
		}
		
		// Re-apply distance constraints after undulation to maintain segment lengths
		this.applyDistanceConstraints();
	}

	/**
	 * Apply leg influence to create natural body curvature
	 * When legs push against the ground, they should tilt the body segments
	 */
	private applyLegInfluence() {
		// Only apply subtle influence to body segments (not head/neck)
		for (let i = this.bodyStartIndex; i < this.points.length - 1; i++) {
			const point = this.points[i];
			
			if (Math.abs(point.legInfluence) < 0.001) continue;
			
			// Get the segment from this point to the next (towards tail)
			const next = this.points[i + 1];
			const dx = next.x - point.x;
			const dy = next.y - point.y;
			const len = Math.sqrt(dx * dx + dy * dy);
			
			if (len === 0) continue;
			
			// Apply a very subtle rotation - this just nudges the segment
			const rotationAmount = point.legInfluence * 0.02; // Very subtle
			const cos = Math.cos(rotationAmount);
			const sin = Math.sin(rotationAmount);
			
			// Rotate the segment direction
			const newDx = dx * cos - dy * sin;
			const newDy = dx * sin + dy * cos;
			
			// Update next point position (if not pinned)
			if (!next.pinned) {
				next.x = point.x + newDx;
				next.y = point.y + newDy;
			}
		}
	}

	/**
	 * Apply distance constraints between connected points
	 */
	private applyDistanceConstraints() {
		for (let i = 0; i < this.points.length - 1; i++) {
			const p1 = this.points[i];
			const p2 = this.points[i + 1];

			// Calculate distance between points
			const dx = p2.x - p1.x;
			const dy = p2.y - p1.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			// Calculate correction needed
			const diff = this.segmentLength - dist;
			const percent = diff / dist / 2;

			const offsetX = dx * percent;
			const offsetY = dy * percent;

			// Move both points (unless pinned)
			if (!p1.pinned) {
				p1.x -= offsetX;
				p1.y -= offsetY;
			}
			if (!p2.pinned) {
				p2.x += offsetX;
				p2.y += offsetY;
			}
		}
	}

	/**
	 * Apply angle constraints to prevent the chain from folding back on itself
	 */
	private applyAngleConstraints() {
		for (let i = 1; i < this.points.length - 1; i++) {
			const p0 = this.points[i - 1];
			const p1 = this.points[i];
			const p2 = this.points[i + 1];

			// Calculate vectors for the two segments
			const v1x = p1.x - p0.x;
			const v1y = p1.y - p0.y;
			const v2x = p2.x - p1.x;
			const v2y = p2.y - p1.y;

			// Calculate angle between segments using dot product
			// angle = 0 when straight, π when folded back
			const dot = v1x * v2x + v1y * v2y;
			const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
			const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
			
			if (len1 === 0 || len2 === 0) continue;
			
			const cosAngle = dot / (len1 * len2);
			const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))); // Clamp for numerical stability

			// If angle exceeds maxAngle, constrain it
			if (angle > this.maxAngle) {
				// We need to reduce the angle to maxAngle
				const angleDiff = angle - this.maxAngle;

				// Get the cross product to determine rotation direction
				const cross = v1x * v2y - v1y * v2x;
				const rotationSign = cross > 0 ? -1 : 1;

				// Rotate the second segment to reduce the angle
				const halfAngle = angleDiff / 2 * rotationSign;
				const cos = Math.cos(halfAngle);
				const sin = Math.sin(halfAngle);

				// Rotate v2 around p1
				const newV2x = v2x * cos - v2y * sin;
				const newV2y = v2x * sin + v2y * cos;

				// Update p2 position (unless it's pinned)
				if (!p2.pinned) {
					p2.x = p1.x + newV2x;
					p2.y = p1.y + newV2y;
				}
			}
		}
	}

	/**
	 * Set the position of the first (pinned) point
	 */
	setHeadPosition(x: number, y: number) {
		const head = this.points[0];
		head.prevX = head.x;
		head.prevY = head.y;
		head.x = x;
		head.y = y;
	}

	/**
	 * Get all points as a simple array for drawing
	 */
	getPoints(): Point[] {
		return this.points.map(p => ({ x: p.x, y: p.y }));
	}
}

