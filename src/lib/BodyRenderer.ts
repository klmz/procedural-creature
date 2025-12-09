import { Graphics } from 'pixi.js';
import type { ChainPoint } from './Chain';

export interface BodyColors {
	fill: number;
	stroke: number;
	strokeWidth: number;
}

export class BodyRenderer {
	/**
	 * Draw a body shape following the chain with varying widths
	 */
	static drawBody(graphics: Graphics, points: ChainPoint[], colors: BodyColors) {
		if (points.length < 2) return;

		const leftSide: { x: number; y: number }[] = [];
		const rightSide: { x: number; y: number }[] = [];

		// Calculate perpendicular points for each segment
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			let dirX: number, dirY: number;

			if (i === 0) {
				// First point: use direction to next point
				const next = points[i + 1];
				dirX = next.x - p.x;
				dirY = next.y - p.y;
			} else if (i === points.length - 1) {
				// Last point: use direction from previous point
				const prev = points[i - 1];
				dirX = p.x - prev.x;
				dirY = p.y - prev.y;
			} else {
				// Middle points: average direction between segments
				const prev = points[i - 1];
				const next = points[i + 1];
				dirX = (p.x - prev.x + next.x - p.x) / 2;
				dirY = (p.y - prev.y + next.y - p.y) / 2;
			}

			// Normalize direction
			const len = Math.sqrt(dirX * dirX + dirY * dirY);
			if (len > 0) {
				dirX /= len;
				dirY /= len;
			}

			// Calculate perpendicular direction (rotate 90 degrees)
			const perpX = -dirY;
			const perpY = dirX;

			// Create points on both sides
			const halfWidth = p.width / 2;
			leftSide.push({
				x: p.x + perpX * halfWidth,
				y: p.y + perpY * halfWidth
			});
			rightSide.push({
				x: p.x - perpX * halfWidth,
				y: p.y - perpY * halfWidth
			});
		}

		// Draw the body with smooth curves
		graphics.moveTo(leftSide[0].x, leftSide[0].y);

		// Draw left side with smooth curves
		this.drawSmoothCurve(graphics, leftSide);

		// Draw right side in reverse with smooth curves
		const rightSideReversed = [...rightSide].reverse();
		this.drawSmoothCurve(graphics, rightSideReversed);

		// Close the shape
		graphics.closePath();

		// Fill and stroke
		graphics.fill({ color: colors.fill });
		graphics.stroke({ width: colors.strokeWidth, color: colors.stroke });
	}

	/**
	 * Draw a smooth curve through points using quadratic curves
	 */
	private static drawSmoothCurve(graphics: Graphics, points: { x: number; y: number }[]) {
		if (points.length < 2) return;

		// Start is already set by moveTo
		for (let i = 1; i < points.length - 1; i++) {
			const xc = (points[i].x + points[i + 1].x) / 2;
			const yc = (points[i].y + points[i + 1].y) / 2;
			graphics.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
		}

		// Draw to the last point
		if (points.length > 1) {
			const last = points[points.length - 1];
			graphics.lineTo(last.x, last.y);
		}
	}

	/**
	 * Helper to lighten a color for the fill
	 */
	static lightenColor(color: number, amount: number = 0.3): number {
		const r = (color >> 16) & 0xff;
		const g = (color >> 8) & 0xff;
		const b = color & 0xff;

		const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
		const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
		const newB = Math.min(255, Math.floor(b + (255 - b) * amount));

		return (newR << 16) | (newG << 8) | newB;
	}
}

