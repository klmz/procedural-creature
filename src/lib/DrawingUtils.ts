import { Graphics } from 'pixi.js';

/**
 * Utility class for drawing 2D shapes on PixiJS Graphics objects
 */
export class DrawingUtils {
	/**
	 * Draw a circle at a given point
	 */
	static circle(graphics: Graphics, x: number, y: number, radius: number, color: number = 0xffffff): Graphics {
		graphics.circle(x, y, radius);
		graphics.fill({ color });
		return graphics;
	}

	/**
	 * Draw a line between two points
	 */
	static line(graphics: Graphics, x1: number, y1: number, x2: number, y2: number, width: number = 2, color: number = 0xffffff): Graphics {
		graphics.moveTo(x1, y1);
		graphics.lineTo(x2, y2);
		graphics.stroke({ width, color });
		return graphics;
	}

	/**
	 * Draw a polygon from an array of points
	 */
	static polygon(graphics: Graphics, points: number[], color: number = 0xffffff, filled: boolean = true): Graphics {
		graphics.poly(points);
		if (filled) {
			graphics.fill({ color });
		} else {
			graphics.stroke({ width: 2, color });
		}
		return graphics;
	}

	/**
	 * Draw a rectangle
	 */
	static rect(graphics: Graphics, x: number, y: number, width: number, height: number, color: number = 0xffffff): Graphics {
		graphics.rect(x, y, width, height);
		graphics.fill({ color });
		return graphics;
	}

	/**
	 * Draw an ellipse
	 */
	static ellipse(graphics: Graphics, x: number, y: number, radiusX: number, radiusY: number, color: number = 0xffffff): Graphics {
		graphics.ellipse(x, y, radiusX, radiusY);
		graphics.fill({ color });
		return graphics;
	}

	/**
	 * Draw a rounded rectangle
	 */
	static roundedRect(graphics: Graphics, x: number, y: number, width: number, height: number, radius: number, color: number = 0xffffff): Graphics {
		graphics.roundRect(x, y, width, height, radius);
		graphics.fill({ color });
		return graphics;
	}

	/**
	 * Draw a bezier curve
	 */
	static bezierCurve(
		graphics: Graphics,
		startX: number,
		startY: number,
		cp1X: number,
		cp1Y: number,
		cp2X: number,
		cp2Y: number,
		endX: number,
		endY: number,
		width: number = 2,
		color: number = 0xffffff
	): Graphics {
		graphics.moveTo(startX, startY);
		graphics.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
		graphics.stroke({ width, color });
		return graphics;
	}

	/**
	 * Draw a smooth curve through multiple points using quadratic curves
	 */
	static smoothCurve(graphics: Graphics, points: { x: number; y: number }[], width: number = 2, color: number = 0xffffff): Graphics {
		if (points.length < 2) return graphics;

		graphics.moveTo(points[0].x, points[0].y);

		for (let i = 1; i < points.length - 1; i++) {
			const xc = (points[i].x + points[i + 1].x) / 2;
			const yc = (points[i].y + points[i + 1].y) / 2;
			graphics.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
		}

		// For the last point
		if (points.length > 1) {
			const last = points[points.length - 1];
			graphics.lineTo(last.x, last.y);
		}

		graphics.stroke({ width, color });
		return graphics;
	}
}

/**
 * Point interface for convenience
 */
export interface Point {
	x: number;
	y: number;
}

/**
 * Helper function to create a point
 */
export function point(x: number, y: number): Point {
	return { x, y };
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point, p2: Point): number {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate angle between two points
 */
export function angleBetween(p1: Point, p2: Point): number {
	return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Rotate a point around a center
 */
export function rotatePoint(point: Point, center: Point, angle: number): Point {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const dx = point.x - center.x;
	const dy = point.y - center.y;

	return {
		x: center.x + dx * cos - dy * sin,
		y: center.y + dx * sin + dy * cos
	};
}

/**
 * Linear interpolation between two values
 */
export function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

/**
 * Linear interpolation between two points
 */
export function lerpPoint(p1: Point, p2: Point, t: number): Point {
	return {
		x: lerp(p1.x, p2.x, t),
		y: lerp(p1.y, p2.y, t)
	};
}

