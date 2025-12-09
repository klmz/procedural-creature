<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Application, Graphics } from 'pixi.js';
	import { Chain, type ChainPoint, type SegmentConfig } from './Chain';
	import { BodyRenderer } from './BodyRenderer';
	import { Leg } from './Leg';

	// Segment Configuration
	let headSegments = $state(1);
	let neckSegments = $state(2);
	let bodySegments = $state(6);
	
	// Computed total points
	let numPoints = $derived(headSegments + neckSegments + bodySegments);
	
	let segmentLength = $state(20);
	let friction = $state(0.85); // Lower = more friction
	let maxAngle = $state(120); // Maximum angle between segments in degrees
	let showBody = $state(true);
	let showSkeleton = $state(false);
	let showHead = $state(true);
	let showTail = $state(true);
	let showEyes = $state(true);
	let bodyColor = $state(0x4a9eff);
	let widthsExpanded = $state(false);
	let widths = $state<number[]>([]);
	
	// Leg configuration
	let numLegs = $state(4);
	let legSegments = $state(3);
	let legLength = $state(15);
	let showLegs = $state(true);
	let showFootsteps = $state(false);
	let legsExpanded = $state(false);
	let legs: Leg[] = [];
	
	// Animation mode
	let autoAnimate = $state(false);
	let animationSpeed = $state(2); // max acceleration
	let currentTarget: { x: number; y: number } | null = null;
	let showTarget = $state(true);
	let velocity = { x: 0, y: 0 }; // Current velocity
	let maxSpeed = $state(3); // Maximum speed
	
	// Undulation (snake-like movement)
	let undulationAmplitude = $state(0.3);
	let undulationSpeed = $state(0.15);
	let undulationWavelength = $state(0.8);
	
	// Control panel state
	let controlsCollapsed = $state(false);
	let controlsPosition = $state({ x: 20, y: 20 });
	let isDraggingControls = false;
	let dragOffset = { x: 0, y: 0 };
	
	let canvasContainer: HTMLDivElement;
	let controlsPanel: HTMLDivElement;
	let app: Application;
	let chain: Chain;
	let graphics: Graphics;
	let isDragging = false;

	let handleMouseDown: (e: MouseEvent) => void;
	let handleMouseMove: (e: MouseEvent) => void;
	let handleMouseUp: () => void;
	let handleMouseLeave: () => void;
	let tickerFn: () => void;

	onMount(async () => {
		// Load settings from localStorage
		loadSettings();

		// Create a PixiJS application
		app = new Application();
		
		// Initialize the application to fill the window
		await app.init({
			width: window.innerWidth,
			height: window.innerHeight,
			backgroundColor: 0x1a1a1a,
			antialias: true,
			resizeTo: window
		});

		// Add the canvas to the container
		canvasContainer.appendChild(app.canvas);

		// Create the chain with configured widths and segment types
		const segmentConfig: SegmentConfig = { headSegments, neckSegments, bodySegments };
		chain = new Chain(400, 100, segmentConfig, segmentLength, friction, maxAngle, widths);
		
		// Set undulation properties
		chain.undulationAmplitude = undulationAmplitude;
		chain.undulationSpeed = undulationSpeed;
		chain.undulationWavelength = undulationWavelength;
		
		// Create legs
		createLegs();
		
		// Create graphics object for drawing
		graphics = new Graphics();
		app.stage.addChild(graphics);

		// Mouse interaction - only when not in auto mode
		handleMouseDown = (e: MouseEvent) => {
			if (!autoAnimate) {
				isDragging = true;
				updateChainHead(e);
			}
		};

		handleMouseMove = (e: MouseEvent) => {
			if (isDragging && !autoAnimate) {
				updateChainHead(e);
			}
		};

		handleMouseUp = () => {
			isDragging = false;
		};

		handleMouseLeave = () => {
			isDragging = false;
		};

		app.canvas.addEventListener('mousedown', handleMouseDown);
		app.canvas.addEventListener('mousemove', handleMouseMove);
		app.canvas.addEventListener('mouseup', handleMouseUp);
		app.canvas.addEventListener('mouseleave', handleMouseLeave);

		// Animation loop
		tickerFn = () => {
			// Handle auto-animation mode
			if (autoAnimate) {
				handleAutoAnimation();
			}
			
			// Update physics
			chain.update();
			
			// Update legs every frame
			updateLegs();
			
			// Redraw
			drawChain();
		};
		app.ticker.add(tickerFn);
		
		// Setup control panel drag handlers
		setupControlsDrag();
	});

	onDestroy(() => {
		if (app && app.canvas) {
			if (handleMouseDown) app.canvas.removeEventListener('mousedown', handleMouseDown);
			if (handleMouseMove) app.canvas.removeEventListener('mousemove', handleMouseMove);
			if (handleMouseUp) app.canvas.removeEventListener('mouseup', handleMouseUp);
			if (handleMouseLeave) app.canvas.removeEventListener('mouseleave', handleMouseLeave);
			if (tickerFn) app.ticker.remove(tickerFn);
			app.destroy(true, { children: true });
		}
	});

	function updateChainHead(e: MouseEvent) {
		const rect = app.canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		chain.setHeadPosition(x, y);
	}

	function handleAutoAnimation() {
		if (!chain || !app) return;
		
		// Generate new target if needed
		if (!currentTarget) {
			generateNewTarget();
			velocity = { x: 0, y: 0 }; // Reset velocity on new target
		}
		
		if (currentTarget) {
			const head = chain.points[0];
			const dx = currentTarget.x - head.x;
			const dy = currentTarget.y - head.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			
			// Check if we've reached the target
			if (distance < 15) {
				generateNewTarget();
				velocity = { x: 0, y: 0 }; // Reset velocity
				return;
			}
			
			// Calculate body straightness factor (affects max acceleration)
			const straightness = calculateBodyStraightness();
			
			// Direction to target
			const dirX = dx / distance;
			const dirY = dy / distance;
			
			// Calculate desired velocity towards target
			const slowdownRadius = 100;
			let desiredSpeed = maxSpeed;
			if (distance < slowdownRadius) {
				// Gradually reduce desired speed as we approach
				desiredSpeed = maxSpeed * Math.max(0.3, distance / slowdownRadius);
			}
			
			const desiredVelX = dirX * desiredSpeed;
			const desiredVelY = dirY * desiredSpeed;
			
			// Calculate acceleration towards desired velocity (steering)
			const accelX = desiredVelX - velocity.x;
			const accelY = desiredVelY - velocity.y;
			
			// Limit acceleration based on straightness (bent body = less maneuverable)
			const maxAccel = animationSpeed * straightness;
			const accelMag = Math.sqrt(accelX * accelX + accelY * accelY);
			
			if (accelMag > maxAccel) {
				velocity.x += (accelX / accelMag) * maxAccel;
				velocity.y += (accelY / accelMag) * maxAccel;
			} else {
				velocity.x += accelX;
				velocity.y += accelY;
			}
			
			// Apply drag/friction (helps with stability and deceleration)
			const drag = 0.95;
			velocity.x *= drag;
			velocity.y *= drag;
			
			// Limit to max speed
			const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
			if (speed > maxSpeed) {
				velocity.x = (velocity.x / speed) * maxSpeed;
				velocity.y = (velocity.y / speed) * maxSpeed;
			}
			
			// Apply velocity to head position
			chain.setHeadPosition(head.x + velocity.x, head.y + velocity.y);
		}
	}

	function calculateBodyStraightness(): number {
		if (!chain || chain.points.length < 3) return 1.0;
		
		let totalAngleDeviation = 0;
		let segmentCount = 0;
		
		// Calculate angle deviation for each pair of segments
		for (let i = 1; i < chain.points.length - 1; i++) {
			const p0 = chain.points[i - 1];
			const p1 = chain.points[i];
			const p2 = chain.points[i + 1];
			
			// Vector from p0 to p1
			const v1x = p1.x - p0.x;
			const v1y = p1.y - p0.y;
			const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
			
			// Vector from p1 to p2
			const v2x = p2.x - p1.x;
			const v2y = p2.y - p1.y;
			const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
			
			if (len1 > 0 && len2 > 0) {
				// Calculate angle between vectors using dot product
				const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
				const angle = Math.acos(Math.max(-1, Math.min(1, dot))); // Clamp for numerical stability
				
				// Angle is 0 when straight, PI when bent back
				totalAngleDeviation += angle;
				segmentCount++;
			}
		}
		
		if (segmentCount === 0) return 1.0;
		
		// Average angle deviation
		const avgDeviation = totalAngleDeviation / segmentCount;
		
		// Convert to straightness factor for acceleration
		// avgDeviation ranges from 0 (straight) to PI (folded back)
		// We want: 0 deviation = 1.0 acceleration, higher deviation = lower acceleration
		const maxDeviation = Math.PI / 2; // Consider anything beyond 90° as "very bent"
		const normalizedDeviation = Math.min(avgDeviation / maxDeviation, 1.0);
		const straightness = 1.0 - normalizedDeviation * 0.6; // Range from 0.4 (very bent) to 1.0 (straight)
		
		return straightness;
	}

	function toggleAutoAnimate() {
		if (!autoAnimate) {
			// Reset velocity when starting animation
			velocity = { x: 0, y: 0 };
			currentTarget = null;
		}
		saveSettings();
	}

	function setupControlsDrag() {
		if (!controlsPanel) return;
		
		const header = controlsPanel.querySelector('.controls-header') as HTMLElement;
		if (!header) return;
		
		header.addEventListener('mousedown', (e: MouseEvent) => {
			isDraggingControls = true;
			dragOffset = {
				x: e.clientX - controlsPosition.x,
				y: e.clientY - controlsPosition.y
			};
			e.preventDefault();
		});
		
		window.addEventListener('mousemove', (e: MouseEvent) => {
			if (isDraggingControls) {
				controlsPosition = {
					x: e.clientX - dragOffset.x,
					y: e.clientY - dragOffset.y
				};
			}
		});
		
		window.addEventListener('mouseup', () => {
			isDraggingControls = false;
		});
	}

	function generateNewTarget() {
		if (!app) return;
		
		// Generate target at least 200px away from current position
		const head = chain.points[0];
		const minDistance = 200;
		const maxDistance = 400;
		
		// Random angle
		const angle = Math.random() * Math.PI * 2;
		const distance = minDistance + Math.random() * (maxDistance - minDistance);
		
		// Calculate target position
		let targetX = head.x + Math.cos(angle) * distance;
		let targetY = head.y + Math.sin(angle) * distance;
		
		// Clamp to canvas bounds with margin
		const margin = 50;
		targetX = Math.max(margin, Math.min(app.canvas.width - margin, targetX));
		targetY = Math.max(margin, Math.min(app.canvas.height - margin, targetY));
		
		currentTarget = { x: targetX, y: targetY };
	}

	function drawChain() {
		graphics.clear();
		
		const points = chain.points;
		
		// Draw target marker if in auto mode
		if (autoAnimate && showTarget && currentTarget) {
			graphics.circle(currentTarget.x, currentTarget.y, 8);
			graphics.fill({ color: 0xff00ff, alpha: 0.5 });
			graphics.stroke({ width: 2, color: 0xff00ff });
			
			// Draw crosshair
			graphics.moveTo(currentTarget.x - 12, currentTarget.y);
			graphics.lineTo(currentTarget.x + 12, currentTarget.y);
			graphics.moveTo(currentTarget.x, currentTarget.y - 12);
			graphics.lineTo(currentTarget.x, currentTarget.y + 12);
			graphics.stroke({ width: 2, color: 0xff00ff });
		}
		
		// Draw footsteps first (at the bottom layer)
		if (showFootsteps) {
			drawFootsteps();
		}
		
		// Draw legs (behind body)
		if (showLegs) {
			drawLegs();
		}
		
		// Draw body with optional head cap
		if (showBody) {
			const fillColor = BodyRenderer.lightenColor(bodyColor, 0.3);
			drawBodyWithHead(graphics, points, fillColor, showHead);
		}

		// Draw eyes and nostrils if enabled
		if (showHead && points.length > 1) {
			const head = points[0];
			const next = points[1];
			const dx = head.x - next.x;
			const dy = head.y - next.y;
			const angle = Math.atan2(dy, dx);
			const headWidth = head.width;
			
			// Draw nostrils (small dots near the front)
			const nostrilDistance = headWidth * 0.12; // Distance from center (left/right)
			const nostrilForward = headWidth * 0.38; // Forward from center
			const nostrilSize = headWidth * 0.05;
			
			// Perpendicular direction
			const perpX = -Math.sin(angle);
			const perpY = Math.cos(angle);
			
			// Forward direction
			const forwardX = Math.cos(angle);
			const forwardY = Math.sin(angle);
			
			// Left nostril
			const leftNostrilX = head.x + forwardX * nostrilForward + perpX * nostrilDistance;
			const leftNostrilY = head.y + forwardY * nostrilForward + perpY * nostrilDistance;
			graphics.circle(leftNostrilX, leftNostrilY, nostrilSize);
			graphics.fill({ color: 0x222222 });
			
			// Right nostril
			const rightNostrilX = head.x + forwardX * nostrilForward - perpX * nostrilDistance;
			const rightNostrilY = head.y + forwardY * nostrilForward - perpY * nostrilDistance;
			graphics.circle(rightNostrilX, rightNostrilY, nostrilSize);
			graphics.fill({ color: 0x222222 });
			
			// Draw eyes (moved back and closer to center)
			if (showEyes) {
				const eyeDistance = headWidth * 0.22; // Closer to center
				const eyeBackward = headWidth * 0.1; // Moved back behind head center
				const eyeSize = headWidth * 0.12;
				
				// Left eye (behind and to the side)
				const leftEyeX = head.x - forwardX * eyeBackward + perpX * eyeDistance;
				const leftEyeY = head.y - forwardY * eyeBackward + perpY * eyeDistance;
				graphics.circle(leftEyeX, leftEyeY, eyeSize);
				graphics.fill({ color: 0xffffff });
				graphics.circle(leftEyeX, leftEyeY, eyeSize * 0.6);
				graphics.fill({ color: 0x000000 });
				
				// Right eye
				const rightEyeX = head.x - forwardX * eyeBackward - perpX * eyeDistance;
				const rightEyeY = head.y - forwardY * eyeBackward - perpY * eyeDistance;
				graphics.circle(rightEyeX, rightEyeY, eyeSize);
				graphics.fill({ color: 0xffffff });
				graphics.circle(rightEyeX, rightEyeY, eyeSize * 0.6);
				graphics.fill({ color: 0x000000 });
			}
		}

		// Tail is now integrated into the body drawing

		// Draw skeleton if enabled
		if (showSkeleton) {
			// Build a map of which points have legs attached and their colors
			const pointLegColors: Map<number, number[]> = new Map();
			for (const leg of legs) {
				if (!pointLegColors.has(leg.attachmentIndex)) {
					pointLegColors.set(leg.attachmentIndex, []);
				}
				pointLegColors.get(leg.attachmentIndex)!.push(
					leg.side === 'left' ? 0xff6b6b : 0x6bff6b
				);
			}
			
			// Draw lines between points
			for (let i = 0; i < points.length - 1; i++) {
				const p1 = points[i];
				const p2 = points[i + 1];
				
				graphics.moveTo(p1.x, p1.y);
				graphics.lineTo(p2.x, p2.y);
				graphics.stroke({ width: 2, color: 0xff6b6b });
			}
			
			// Draw points as circles - colored by leg attachment
			for (let i = 0; i < points.length; i++) {
				const p = points[i];
				const legColors = pointLegColors.get(i);
				
				if (legColors && legColors.length > 0) {
					// Draw multiple colors if multiple legs attached
					const radius = i === 0 ? 6 : 5;
					if (legColors.length === 2) {
						// Two legs - draw half red, half green
						graphics.circle(p.x, p.y, radius);
						graphics.fill({ color: 0xffff6b }); // Yellow for both
					} else {
						graphics.circle(p.x, p.y, radius);
						graphics.fill({ color: legColors[0] });
					}
				} else {
					graphics.circle(p.x, p.y, i === 0 ? 6 : 4);
					graphics.fill({ color: i === 0 ? 0xff4a4a : 0xff8888 });
				}
			}
		}
	}

	function recreateChain() {
		if (chain && app) {
			const headPos = chain.points[0];
			
			// Adjust widths array if numPoints changed
			if (widths.length !== numPoints) {
				const newWidths = [];
				for (let i = 0; i < numPoints; i++) {
					if (i < widths.length) {
						// Keep existing width
						newWidths.push(widths[i]);
					} else {
						// Add new width with taper
						const t = i / (numPoints - 1);
						newWidths.push(Math.round(30 * (1 - t * 0.7)));
					}
				}
				widths = newWidths;
			}
			
			const segmentConfig: SegmentConfig = { headSegments, neckSegments, bodySegments };
			chain = new Chain(headPos.x, headPos.y, segmentConfig, segmentLength, friction, maxAngle, widths);
			
			// Set undulation properties
			chain.undulationAmplitude = undulationAmplitude;
			chain.undulationSpeed = undulationSpeed;
			chain.undulationWavelength = undulationWavelength;
			
			createLegs();
		}
		saveSettings();
	}
	
	function updateWidth(index: number, value: number) {
		widths[index] = value;
		if (chain) {
			chain.points[index].width = value;
		}
		saveSettings();
	}

	function updateFriction() {
		if (chain) {
			chain.friction = friction;
		}
		saveSettings();
	}

	function updateMaxAngle() {
		if (chain) {
			chain.maxAngle = (maxAngle * Math.PI) / 180;
		}
		saveSettings();
	}

	function updateUndulation() {
		if (chain) {
			chain.undulationAmplitude = undulationAmplitude;
			chain.undulationSpeed = undulationSpeed;
			chain.undulationWavelength = undulationWavelength;
		}
		saveSettings();
	}

	function loadSettings() {
		try {
			const saved = localStorage.getItem('creatureSettings');
			if (saved) {
				const settings = JSON.parse(saved);
				
				// Load segment configuration (new system)
				headSegments = settings.headSegments ?? headSegments;
				neckSegments = settings.neckSegments ?? neckSegments;
				bodySegments = settings.bodySegments ?? bodySegments;
				
				// For backwards compatibility, if old numPoints exists but no segments
				if (settings.numPoints && !settings.headSegments) {
					// Convert old numPoints to new system
					const oldNumPoints = settings.numPoints;
					headSegments = 1;
					neckSegments = 2;
					bodySegments = Math.max(1, oldNumPoints - 3);
				}
				
				segmentLength = settings.segmentLength ?? segmentLength;
				friction = settings.friction ?? friction;
				maxAngle = settings.maxAngle ?? maxAngle;
				showBody = settings.showBody ?? showBody;
				showHead = settings.showHead ?? showHead;
				showTail = settings.showTail ?? showTail;
				showEyes = settings.showEyes ?? showEyes;
				showSkeleton = settings.showSkeleton ?? showSkeleton;
				bodyColor = settings.bodyColor ?? bodyColor;
				numLegs = settings.numLegs ?? numLegs;
				legSegments = settings.legSegments ?? legSegments;
				legLength = settings.legLength ?? legLength;
				showLegs = settings.showLegs ?? showLegs;
				showFootsteps = settings.showFootsteps ?? showFootsteps;
				autoAnimate = settings.autoAnimate ?? autoAnimate;
				animationSpeed = settings.animationSpeed ?? animationSpeed;
				maxSpeed = settings.maxSpeed ?? maxSpeed;
				showTarget = settings.showTarget ?? showTarget;
				
				// Undulation settings
				undulationAmplitude = settings.undulationAmplitude ?? undulationAmplitude;
				undulationSpeed = settings.undulationSpeed ?? undulationSpeed;
				undulationWavelength = settings.undulationWavelength ?? undulationWavelength;
				
				// Load widths or generate defaults
				if (settings.widths && Array.isArray(settings.widths) && settings.widths.length === numPoints) {
					widths = settings.widths;
				} else {
					generateDefaultWidths();
				}
			} else {
				generateDefaultWidths();
			}
		} catch (e) {
			console.error('Failed to load settings:', e);
			generateDefaultWidths();
		}
	}

	function saveSettings() {
		try {
			const settings = {
				headSegments,
				neckSegments,
				bodySegments,
				segmentLength,
				friction,
				maxAngle,
				showBody,
				showHead,
				showTail,
				showEyes,
				showSkeleton,
				bodyColor,
				widths,
				numLegs,
				legSegments,
				legLength,
				showLegs,
				showFootsteps,
				autoAnimate,
				animationSpeed,
				maxSpeed,
				showTarget,
				undulationAmplitude,
				undulationSpeed,
				undulationWavelength
			};
			localStorage.setItem('creatureSettings', JSON.stringify(settings));
		} catch (e) {
			console.error('Failed to save settings:', e);
		}
	}

	function generateDefaultWidths() {
		widths = Array.from({ length: numPoints }, (_, i) => {
			const t = i / (numPoints - 1);
			return Math.round(30 * (1 - t * 0.7));
		});
	}

	function createLegs() {
		legs = [];
		
		// Ensure numLegs is even
		const pairsOfLegs = Math.floor(numLegs / 2);
		if (pairsOfLegs === 0 || !chain) return;
		
		// Get body segment indices (legs can only attach to body segments)
		const bodyIndices = chain.getBodySegmentIndices();
		if (bodyIndices.length === 0) return;
		
		// Distribute leg pairs evenly across body segments only
		const segmentLengths = Array(legSegments).fill(legLength);
		
		for (let i = 0; i < pairsOfLegs; i++) {
			// Calculate which body segment this pair attaches to
			const bodySegmentIndex = Math.floor((i / pairsOfLegs) * bodyIndices.length);
			const attachmentIndex = bodyIndices[Math.min(bodySegmentIndex, bodyIndices.length - 1)];
			
			// Get body attachment point
			const attachPoint = chain.points[attachmentIndex];
			
			// Calculate body direction at this point
			let dirX = 0, dirY = 1;
			if (attachmentIndex > 0 && attachmentIndex < chain.points.length - 1) {
				const prev = chain.points[attachmentIndex - 1];
				const next = chain.points[attachmentIndex + 1];
				dirX = next.x - prev.x;
				dirY = next.y - prev.y;
			}
			const len = Math.sqrt(dirX * dirX + dirY * dirY);
			if (len > 0) {
				dirX /= len;
				dirY /= len;
			}
			
			const perpX = -dirY;
			const perpY = dirX;
			
			// Create both left and right legs for this segment
			for (const side of ['left', 'right'] as const) {
				const sideMultiplier = side === 'left' ? 1 : -1;
				
				// Calculate actual attachment point on side of body
				const legAttachPoint = {
					x: attachPoint.x + perpX * attachPoint.width * 0.4 * sideMultiplier,
					y: attachPoint.y + perpY * attachPoint.width * 0.4 * sideMultiplier
				};
				
				const leg = new Leg(attachmentIndex, side, segmentLengths);
				
				// Initialize foot at rest position (perpendicular to body at half reach)
				leg.initializeAtRest(legAttachPoint, { x: dirX, y: dirY });
				
				// Initialize solver joints
				leg.solver.joints[0] = { ...legAttachPoint };
				const footPos = leg.currentFootPos;
				
				// Distribute joints evenly between attachment and foot
				for (let j = 1; j < leg.solver.joints.length; j++) {
					const t = j / (leg.solver.joints.length - 1);
					leg.solver.joints[j] = {
						x: legAttachPoint.x + (footPos.x - legAttachPoint.x) * t,
						y: legAttachPoint.y + (footPos.y - legAttachPoint.y) * t
					};
				}
				
				legs.push(leg);
			}
		}
	}

	function updateLegs() {
		if (!chain || legs.length === 0) return;
		
		// Track leg influences per segment (accumulate left and right)
		const legInfluences: Map<number, { left: number; right: number }> = new Map();
		
		for (const leg of legs) {
			const attachPoint = chain.points[leg.attachmentIndex];
			
			// Calculate body direction at this point
			let dirX = 0, dirY = 0;
			if (leg.attachmentIndex > 0 && leg.attachmentIndex < chain.points.length - 1) {
				const prev = chain.points[leg.attachmentIndex - 1];
				const next = chain.points[leg.attachmentIndex + 1];
				dirX = next.x - prev.x;
				dirY = next.y - prev.y;
			}
			const len = Math.sqrt(dirX * dirX + dirY * dirY);
			if (len > 0) {
				dirX /= len;
				dirY /= len;
			}
			
			// Calculate perpendicular direction for leg offset
			const perpX = -dirY;
			const perpY = dirX;
			const offset = leg.side === 'left' ? 1 : -1;
			
			const legAttachPoint = {
				x: attachPoint.x + perpX * attachPoint.width * 0.4 * offset,
				y: attachPoint.y + perpY * attachPoint.width * 0.4 * offset
			};
			
			leg.update(legAttachPoint, { x: dirX, y: dirY });
			
			// Calculate leg influence on body curvature
			// The angle of the leg relative to perpendicular affects body tilt
			const footPos = leg.getFootPosition();
			const toFootX = footPos.x - legAttachPoint.x;
			const toFootY = footPos.y - legAttachPoint.y;
			const footDist = Math.sqrt(toFootX * toFootX + toFootY * toFootY);
			
			if (footDist > 0) {
				// Calculate how much the leg is angled forward/backward
				// Dot product with body direction gives forward/backward component
				const forwardComponent = (toFootX * dirX + toFootY * dirY) / footDist;
				
				// This forward/backward angle creates body tilt
				// Positive = leg is forward, negative = leg is backward
				const influence = forwardComponent * 0.5; // Scale factor
				
				if (!legInfluences.has(leg.attachmentIndex)) {
					legInfluences.set(leg.attachmentIndex, { left: 0, right: 0 });
				}
				
				const segmentInfluence = legInfluences.get(leg.attachmentIndex)!;
				if (leg.side === 'left') {
					segmentInfluence.left = influence;
				} else {
					segmentInfluence.right = influence;
				}
			}
		}
		
		// Apply combined leg influences to body segments
		// The difference between left and right leg angles creates rotation
		for (const [index, influence] of legInfluences) {
			// When left leg is forward and right is back (or vice versa), 
			// it creates a rotational torque on the segment
			const rotationalInfluence = (influence.left - influence.right) * 0.3;
			chain.setLegInfluence(index, rotationalInfluence);
		}
	}

	function drawLegs() {
		for (const leg of legs) {
			// Draw leg body
			drawLegBody(leg);
		}
	}

	function drawLegBody(leg: Leg) {
		const joints = leg.getJointsWithWidth();
		if (joints.length < 2) return;

		const leftSide: { x: number; y: number }[] = [];
		const rightSide: { x: number; y: number }[] = [];

		// Calculate perpendicular points for each joint
		for (let i = 0; i < joints.length; i++) {
			const joint = joints[i];
			let dirX: number, dirY: number;

			if (i === 0) {
				// First joint: use direction to next joint
				const next = joints[i + 1];
				dirX = next.x - joint.x;
				dirY = next.y - joint.y;
			} else if (i === joints.length - 1) {
				// Last joint: use direction from previous joint
				const prev = joints[i - 1];
				dirX = joint.x - prev.x;
				dirY = joint.y - prev.y;
			} else {
				// Middle joints: average direction between segments
				const prev = joints[i - 1];
				const next = joints[i + 1];
				dirX = (joint.x - prev.x + next.x - joint.x) / 2;
				dirY = (joint.y - prev.y + next.y - joint.y) / 2;
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
			const halfWidth = joint.width / 2;
			leftSide.push({
				x: joint.x + perpX * halfWidth,
				y: joint.y + perpY * halfWidth
			});
			rightSide.push({
				x: joint.x - perpX * halfWidth,
				y: joint.y - perpY * halfWidth
			});
		}

		// Draw the body outline
		graphics.moveTo(leftSide[0].x, leftSide[0].y);

		// Draw left side with smooth curves
		for (let i = 1; i < leftSide.length - 1; i++) {
			const xc = (leftSide[i].x + leftSide[i + 1].x) / 2;
			const yc = (leftSide[i].y + leftSide[i + 1].y) / 2;
			graphics.quadraticCurveTo(leftSide[i].x, leftSide[i].y, xc, yc);
		}
		graphics.lineTo(leftSide[leftSide.length - 1].x, leftSide[leftSide.length - 1].y);

		// Draw rounded foot cap
		const lastJoint = joints[joints.length - 1];
		const prevJoint = joints[joints.length - 2];
		const footDx = lastJoint.x - prevJoint.x;
		const footDy = lastJoint.y - prevJoint.y;
		const footAngle = Math.atan2(footDy, footDx);
		graphics.arc(lastJoint.x, lastJoint.y, lastJoint.width / 2, footAngle - Math.PI / 2, footAngle + Math.PI / 2, true);

		// Draw right side in reverse with smooth curves
		for (let i = rightSide.length - 2; i > 0; i--) {
			const xc = (rightSide[i].x + rightSide[i - 1].x) / 2;
			const yc = (rightSide[i].y + rightSide[i - 1].y) / 2;
			graphics.quadraticCurveTo(rightSide[i].x, rightSide[i].y, xc, yc);
		}
		graphics.lineTo(rightSide[0].x, rightSide[0].y);

		// Close the shape
		graphics.closePath();

		// Fill and stroke
		const fillColor = BodyRenderer.lightenColor(bodyColor, 0.3);
		graphics.fill({ color: fillColor });
		graphics.stroke({ width: 2, color: bodyColor });
	}

	function drawFootsteps() {
		for (const leg of legs) {
			const foot = leg.getFootPosition();
			
			// Draw footstep marker
			graphics.circle(foot.x, foot.y, 6);
			graphics.fill({ color: leg.side === 'left' ? 0xff6b6b : 0x6bff6b });
			graphics.stroke({ width: 1, color: 0x333333 });
		}
	}

	function recreateLegs() {
		if (chain) {
			createLegs();
		}
		saveSettings();
	}

	function drawBodyWithHead(graphics: Graphics, points: ChainPoint[], fillColor: number, drawHead: boolean) {
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

		// Start drawing the outline
		graphics.moveTo(leftSide[0].x, leftSide[0].y);
		
		// Draw left side with smooth curves
		drawSmoothCurve(graphics, leftSide, 1);

		// Connect to right side at tail
		if (rightSide.length > 0) {
			graphics.lineTo(rightSide[rightSide.length - 1].x, rightSide[rightSide.length - 1].y);
		}

		// Draw right side in reverse with smooth curves
		const rightSideReversed = [...rightSide].reverse();
		drawSmoothCurve(graphics, rightSideReversed, 1);

		// Close with head arc if enabled
		if (drawHead && points.length > 1) {
			const head = points[0];
			const next = points[1];
			const dx = head.x - next.x;  // Direction FROM next TO head (forward)
			const dy = head.y - next.y;
			const angle = Math.atan2(dy, dx);
			
			// Draw arc for head (semicircle facing forward) - anticlockwise to bulge outward
			const startAngle = angle + Math.PI / 2;
			const endAngle = angle - Math.PI / 2;
			graphics.arc(head.x, head.y, head.width / 2, startAngle, endAngle, true);
		} else {
			// Just close the path
			graphics.lineTo(leftSide[0].x, leftSide[0].y);
		}

		// Close the shape
		graphics.closePath();

		// Fill and stroke
		graphics.fill({ color: fillColor });
		graphics.stroke({ width: 2, color: bodyColor });
	}

	function drawSmoothCurve(graphics: Graphics, points: { x: number; y: number }[], startIndex: number = 0, endIndex?: number) {
		const end = endIndex ?? points.length;
		if (end - startIndex < 2) return;

		// Move to first point or draw line if not at start
		if (startIndex === 0) {
			graphics.moveTo(points[startIndex].x, points[startIndex].y);
		} else {
			graphics.lineTo(points[startIndex].x, points[startIndex].y);
		}

		for (let i = startIndex + 1; i < end - 1; i++) {
			const xc = (points[i].x + points[i + 1].x) / 2;
			const yc = (points[i].y + points[i + 1].y) / 2;
			graphics.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
		}

		// Draw to the last point
		if (end > startIndex + 1 && end <= points.length) {
			graphics.lineTo(points[end - 1].x, points[end - 1].y);
		}
	}
</script>

<div class="canvas-wrapper">
	<div 
		bind:this={controlsPanel}
		class="controls" 
		class:collapsed={controlsCollapsed}
		style="left: {controlsPosition.x}px; top: {controlsPosition.y}px;"
	>
		<div class="controls-header">
			<h3>Controls</h3>
			<button class="collapse-btn" onclick={() => controlsCollapsed = !controlsCollapsed}>
				{controlsCollapsed ? '▼' : '▲'}
			</button>
		</div>
		
		{#if !controlsCollapsed}
		<div class="controls-content">
		
		<!-- Body Segments Configuration -->
		<div class="control-group segment-config">
			<span class="section-label">Body Structure ({numPoints} total points)</span>
			
			<div class="segment-control">
				<label for="headSegments">
					Head: <strong>{headSegments}</strong>
				</label>
				<input
					id="headSegments"
					type="range"
					min="1"
					max="3"
					bind:value={headSegments}
					oninput={recreateChain}
				/>
			</div>
			
			<div class="segment-control">
				<label for="neckSegments">
					Neck: <strong>{neckSegments}</strong>
				</label>
				<input
					id="neckSegments"
					type="range"
					min="0"
					max="5"
					bind:value={neckSegments}
					oninput={recreateChain}
				/>
			</div>
			
			<div class="segment-control">
				<label for="bodySegments">
					Body: <strong>{bodySegments}</strong>
				</label>
				<input
					id="bodySegments"
					type="range"
					min="2"
					max="20"
					bind:value={bodySegments}
					oninput={recreateChain}
				/>
			</div>
			
			<div class="segment-info">
				<span class="info-badge head">Head: {headSegments}</span>
				<span class="info-badge neck">Neck: {neckSegments}</span>
				<span class="info-badge body">Body: {bodySegments}</span>
			</div>
		</div>
		
		<div class="control-group">
			<label for="segmentLength">
				Segment Length: <strong>{segmentLength}</strong>
			</label>
			<input
				id="segmentLength"
				type="range"
				min="10"
				max="50"
				bind:value={segmentLength}
				oninput={recreateChain}
			/>
		</div>
		
		<div class="control-group">
			<label for="friction">
				Friction: <strong>{(1 - friction).toFixed(2)}</strong>
			</label>
			<input
				id="friction"
				type="range"
				min="0.5"
				max="0.99"
				step="0.01"
				bind:value={friction}
				oninput={updateFriction}
			/>
		</div>
		
		<div class="control-group">
			<label for="maxAngle">
				Max Bend Angle: <strong>{maxAngle}°</strong>
			</label>
			<input
				id="maxAngle"
				type="range"
				min="30"
				max="180"
				step="5"
				bind:value={maxAngle}
				oninput={updateMaxAngle}
			/>
		</div>
		
		<div class="control-group">
			<label>
				<input type="checkbox" bind:checked={showBody} onchange={saveSettings} /> Show Body
			</label>
			<label>
				<input type="checkbox" bind:checked={showHead} onchange={saveSettings} /> Show Head
			</label>
			<label>
				<input type="checkbox" bind:checked={showTail} onchange={saveSettings} /> Show Tail
			</label>
			<label>
				<input type="checkbox" bind:checked={showEyes} onchange={saveSettings} /> Show Eyes
			</label>
			<label>
				<input type="checkbox" bind:checked={showLegs} onchange={saveSettings} /> Show Legs
			</label>
			<label>
				<input type="checkbox" bind:checked={showFootsteps} onchange={saveSettings} /> Show Footsteps
			</label>
			<label>
				<input type="checkbox" bind:checked={showSkeleton} onchange={saveSettings} /> Show Skeleton
			</label>
		</div>
		
		<div class="control-group">
			<button class="collapse-button" onclick={() => widthsExpanded = !widthsExpanded}>
				{widthsExpanded ? '▼' : '▶'} Body Shape ({numPoints} points)
			</button>
			
			{#if widthsExpanded}
				<div class="widths-list">
					{#each widths as width, i}
						<div class="width-control">
							<label for="width-{i}">
								Point {i}: <strong>{width}</strong>
							</label>
							<input
								id="width-{i}"
								type="range"
								min="1"
								max="60"
								bind:value={widths[i]}
								oninput={() => updateWidth(i, widths[i])}
							/>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		
		<div class="control-group">
			<button class="collapse-button" onclick={() => legsExpanded = !legsExpanded}>
				{legsExpanded ? '▼' : '▶'} Legs Configuration
			</button>
			
			{#if legsExpanded}
				<div class="legs-config">
					<div class="control-group">
						<label for="numLegs">
							Pairs of Legs: <strong>{Math.floor(numLegs / 2)}</strong> ({numLegs} total, on body segments only)
						</label>
						<input
							id="numLegs"
							type="range"
							min="0"
							max={Math.floor(bodySegments / 2) * 2}
							step="2"
							bind:value={numLegs}
							oninput={recreateLegs}
						/>
					</div>
					
					<div class="control-group">
						<label for="legSegments">
							Leg Segments: <strong>{legSegments}</strong>
						</label>
						<input
							id="legSegments"
							type="range"
							min="1"
							max="5"
							bind:value={legSegments}
							oninput={recreateLegs}
						/>
					</div>
					
					<div class="control-group">
						<label for="legLength">
							Segment Length: <strong>{legLength}</strong>
						</label>
						<input
							id="legLength"
							type="range"
							min="5"
							max="30"
							bind:value={legLength}
							oninput={recreateLegs}
						/>
					</div>
				</div>
			{/if}
		</div>
		
		<div class="control-group">
			<label>
				<input type="checkbox" bind:checked={autoAnimate} onchange={toggleAutoAnimate} /> Auto Animate
			</label>
			{#if autoAnimate}
				<div class="control-group">
					<label for="animationSpeed">
						Acceleration: <strong>{animationSpeed}</strong>
					</label>
					<input
						id="animationSpeed"
						type="range"
						min="0.1"
						max="1"
						step="0.1"
						bind:value={animationSpeed}
						oninput={saveSettings}
					/>
				</div>
				<div class="control-group">
					<label for="maxSpeed">
						Max Speed: <strong>{maxSpeed}</strong>
					</label>
					<input
						id="maxSpeed"
						type="range"
						min="1"
						max="6"
						step="0.5"
						bind:value={maxSpeed}
						oninput={saveSettings}
					/>
				</div>
				<label>
					<input type="checkbox" bind:checked={showTarget} onchange={saveSettings} /> Show Target
				</label>
				
				<!-- Undulation (snake-like movement) -->
				<div class="control-group undulation-config">
					<span class="section-label">Undulation (Snake Motion)</span>
					
					<div class="segment-control">
						<label for="undulationAmplitude">
							Amplitude: <strong>{undulationAmplitude.toFixed(2)}</strong>
						</label>
						<input
							id="undulationAmplitude"
							type="range"
							min="0"
							max="1"
							step="0.05"
							bind:value={undulationAmplitude}
							oninput={updateUndulation}
						/>
					</div>
					
					<div class="segment-control">
						<label for="undulationSpeed">
							Wave Speed: <strong>{undulationSpeed.toFixed(2)}</strong>
						</label>
						<input
							id="undulationSpeed"
							type="range"
							min="0.05"
							max="0.4"
							step="0.01"
							bind:value={undulationSpeed}
							oninput={updateUndulation}
						/>
					</div>
					
					<div class="segment-control">
						<label for="undulationWavelength">
							Wavelength: <strong>{undulationWavelength.toFixed(2)}</strong>
						</label>
						<input
							id="undulationWavelength"
							type="range"
							min="0.3"
							max="2"
							step="0.1"
							bind:value={undulationWavelength}
							oninput={updateUndulation}
						/>
					</div>
				</div>
			{/if}
		</div>
		</div>
		{/if}
	</div>
	
	<div bind:this={canvasContainer} class="canvas-container"></div>
</div>

<style>
	.canvas-wrapper {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}

	.controls {
		position: absolute;
		z-index: 1000;
		background: rgba(34, 34, 34, 0.95);
		border-radius: 8px;
		border: 1px solid #444;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(10px);
		min-width: 280px;
		max-width: 320px;
		max-height: 80vh;
	}

	.controls.collapsed {
		max-height: none;
	}

	.controls-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px 8px 0 0;
		cursor: move;
		user-select: none;
		border-bottom: 1px solid #444;
	}

	.controls-header h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: #fff;
	}

	.collapse-btn {
		background: transparent;
		border: none;
		color: #fff;
		font-size: 1rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.2s;
	}

	.collapse-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.controls-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		max-height: calc(80vh - 60px);
		overflow-y: auto;
	}

	.controls-content::-webkit-scrollbar {
		width: 8px;
	}

	.controls-content::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	.controls-content::-webkit-scrollbar-thumb {
		background: #555;
		border-radius: 4px;
	}

	.controls-content::-webkit-scrollbar-thumb:hover {
		background: #666;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.control-group:not(:last-child) {
		padding-bottom: 1rem;
		border-bottom: 1px solid #333;
	}

	label {
		font-size: 0.9rem;
		color: #aaa;
	}

	label strong {
		color: #4a9eff;
	}

	input[type="checkbox"] {
		margin-right: 0.5rem;
		cursor: pointer;
	}

	input[type="range"] {
		width: 100%;
		cursor: pointer;
	}

	.canvas-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		width: 100%;
		height: 100%;
	}

	:global(#app),
	:global(#app > *) {
		margin: 0;
		padding: 0;
	}

	:global(canvas) {
		display: block;
		cursor: grab;
		position: absolute;
		top: 0;
		left: 0;
	}

	:global(canvas:active) {
		cursor: grabbing;
	}

	.collapse-button {
		width: 100%;
		padding: 0.5rem;
		background: #333;
		border: 1px solid #444;
		border-radius: 4px;
		color: #fff;
		font-size: 0.9rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.2s;
	}

	.collapse-button:hover {
		background: #3a3a3a;
	}

	.widths-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
		max-height: 300px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.widths-list::-webkit-scrollbar {
		width: 6px;
	}

	.widths-list::-webkit-scrollbar-track {
		background: #1a1a1a;
		border-radius: 3px;
	}

	.widths-list::-webkit-scrollbar-thumb {
		background: #555;
		border-radius: 3px;
	}

	.widths-list::-webkit-scrollbar-thumb:hover {
		background: #666;
	}

	.width-control {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.width-control label {
		font-size: 0.85rem;
	}

	.legs-config {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.legs-config .control-group {
		padding-bottom: 0;
		border-bottom: none;
	}

	/* Segment configuration styles */
	.segment-config {
		background: rgba(0, 0, 0, 0.2);
		padding: 0.75rem;
		border-radius: 6px;
	}

	.section-label {
		font-weight: 600;
		color: #fff;
		margin-bottom: 0.5rem;
		display: block;
	}

	.segment-control {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}

	.segment-control label {
		font-size: 0.85rem;
	}

	.segment-info {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.info-badge {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-weight: 500;
	}

	.info-badge.head {
		background: #ff6b6b;
		color: #fff;
	}

	.info-badge.neck {
		background: #ffd93d;
		color: #333;
	}

	.info-badge.body {
		background: #6bcb77;
		color: #fff;
	}
</style>

