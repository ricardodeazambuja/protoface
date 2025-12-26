import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ProtoFace - Face Component
 * 
 * Geometrical logic and emotion parameters are 1:1 PORTED from:
 * Amit Patel's Procedural Face Generator (Red Blob Games)
 * https://www.redblobgames.com/x/1845-face-generator/
 */

import { emotionParams } from '../utils/emotions';
import { DEFAULT_EYE_SIZE, MOUTH_SCALE, BROW_JUMP_INTENSITY } from '../constants';

const Point = (x, y) => ({ x, y });

/** Intersection of ray p-->u and q-->v (Used for Bezier Control Points) */
const intersection = (p, u, q, v) => {
    let v_cross_u = v.x * u.y - v.y * u.x;
    if (Math.abs(v_cross_u) <= 1e-4) {
        return Point(0.5 * (p.x + q.x), 0.5 * (p.y + q.y));
    }
    let w = Point(p.x - q.x, p.y - q.y);
    let v_cross_w = v.x * w.y - v.y * w.x;
    let s = -v_cross_w / v_cross_u;
    return Point(p.x + u.x * s, p.y + u.y * s);
};

const Face = ({
    phoneme = 'closed',
    isAnimating = false,
    expression = 'neutral',
    targetLook = null,
    transform = { x: 0, y: 0, scale: 1, rotate: 0 },
    teethGap = 0,
    customParams = null,
    eyeSpacing = 44, // Default spacing
    eyeSize = 22,    // Default radius
    mouthScale = 1,  // Default X scale for mouth
    squash = 1.0,    // Squash/Stretch Y scale
    browJump = 0,    // Secondary eyebrow motion
    ttsVolume = 0,   // Real-time audio volume
}) => {
    const [isBlinking, setIsBlinking] = useState(false);
    const [lookDirection, setLookDirection] = useState({ x: 0, y: 0 });

    // Use customParams if provided, otherwise fallback to expression preset
    // Expanded to 9 parameters: [m, p, q, r, s, skew, rotate, browLift, browAngle]
    const [m, p, q, r, s, skew, rotate, browLift, browAngle] =
        customParams || emotionParams[expression] || emotionParams.neutral;

    // Speech modulation – affect mouth openness
    const speechMod = {
        closed: 0,
        open: 2.0 + teethGap,
        wide: 1.2 + teethGap,
        narrow: 2.5 + teethGap,
        smile: 0.4 + teethGap,
    }[phoneme] || 0;

    // activeM calculation - modulated by phoneme and real-time volume
    // When animating, we prioritize the speech modulation (plus volume)
    // instead of clamping to the base emotion's mouth opening (m).
    // Clamped at 3.5 to prevent extreme geometry stretching.
    const activeM = isAnimating
        ? Math.min(3.5, speechMod + (ttsVolume * 1.5))
        : m;

    useEffect(() => {
        if (!isAnimating) { setIsBlinking(false); return; }
        const interval = setInterval(() => {
            setIsBlinking(true);
            setTimeout(() => setIsBlinking(false), 150);
        }, 3000 + Math.random() * 2000);
        return () => clearInterval(interval);
    }, [isAnimating]);

    useEffect(() => {
        if (targetLook) { setLookDirection(targetLook); return; }
        if (!isAnimating) { setLookDirection({ x: 0, y: 0 }); return; }
        const interval = setInterval(() => {
            setLookDirection({ x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 0.5 });
        }, 2000 + Math.random() * 3000);
        return () => clearInterval(interval);
    }, [isAnimating, targetLook]);

    // --- Mouth Geometrical Logic ---
    const scale = MOUTH_SCALE;
    const xScale = scale * mouthScale; // Apply mouth width scaling
    const cx = 50;
    const cy = 135;

    // Red Blob Geometry Variables
    const Ap = Point(2, (2 + activeM) * (1 - s));
    const Cp = Point(0, 1 - p);
    const Cv = Point(1, 0);
    const Ep = Point(-2, (2 + activeM) * (1 - s));
    const Gp = Point(0, 1 + activeM + q);

    // Slopes (Tangents)
    const Av1 = Point(0.5 * (1 - r) * (Cp.x - Ap.x), Cp.y - Ap.y);
    const Av2 = Point(0.5 * (1 - r) * (Ap.x - Gp.x), Ap.y - Gp.y);
    const Ev1 = Point(0.5 * (1 - r) * (Gp.x - Ep.x), Gp.y - Ep.y);
    const Ev2 = Point(0.5 * (1 - r) * (Ep.x - Cp.x), Ep.y - Cp.y);
    const horizontal = Point(1, 0);

    const points = [Ap, Cp, Ep, Gp];
    const slopes = [[Av1, Av2], [Cv, Cv], [Ev1, Ev2], [horizontal, horizontal]];

    // Helper: Apply Skew, Rotate, Scale, and Translation
    const transformPoint = (pt) => {
        let x = pt.x;
        let y = pt.y;

        // 1. Skew
        x = x + y * (skew || 0);

        // 2. Rotate
        const angle = (rotate || 0); // Radians? Original is -1 to 1. 1 ~= 30deg?
        // Let's assume -1 to 1 maps to roughly -30 to 30 degrees (~0.5 rad)
        // Red Blob uses simple rotation matrix
        const theta = angle * 0.5;
        const rx = x * Math.cos(theta) - y * Math.sin(theta);
        const ry = x * Math.sin(theta) + y * Math.cos(theta);

        return {
            x: cx + rx * xScale,
            y: cy + ry * scale
        };
    };

    // Build the SVG path string
    // Start with the first point
    const startObj = transformPoint(points[0]);
    let d = `M ${startObj.x} ${startObj.y}`;

    for (let i = 0; i < 4; i++) {
        const p1 = points[i];
        const v1 = slopes[i][0];
        const p2 = points[(i + 1) % 4];
        const v2 = slopes[(i + 1) % 4][1];
        const ctrl = intersection(p1, v1, p2, v2);

        const ctrlObj = transformPoint(ctrl);
        const p2Obj = transformPoint(p2);

        d += ` Q ${ctrlObj.x} ${ctrlObj.y} ${p2Obj.x} ${p2Obj.y}`;
    }

    // Eyebrow positions – exact Red Blob formula
    const browCenterY = 25 - (eyeSize - DEFAULT_EYE_SIZE);
    const leftBrow = {
        x: cx - (eyeSpacing / 2), // Aligned with left eye
        y: browCenterY - 15 * browLift - (browJump * BROW_JUMP_INTENSITY),
        rotate: -browAngle * 30,
    };
    const rightBrow = {
        x: cx + (eyeSpacing / 2), // Aligned with right eye
        y: browCenterY - 15 * browLift - (browJump * BROW_JUMP_INTENSITY),
        rotate: browAngle * 30,
    };

    const Teeth = () => {
        // Normalized dimensions
        // Original: toothWidth = 0.6 * scale * activeM? No, 0.6 * scale * mouthScale
        // In normalized space (after scale(xScale, scale)), width is just 0.6!
        const toothWidth = 0.6;
        const toothLength = 4 / scale; // Normalize fixed pixel headers
        const rectHeight = 50 / scale; // Normalize
        const halfNumTeeth = 6;

        // Upper Normalized Y
        // Bite line = Cp.y + toothLength
        const upperBiteY = Cp.y + toothLength;
        const upperRectY = upperBiteY - rectHeight;

        // Lower Normalized Y
        // Bite line = Gp.y - toothLength
        const lowerBiteY = Gp.y - toothLength;
        const lowerRectY = lowerBiteY;

        // Calculate Transform String matching transformPoint logic
        // Logic: 
        // 1. Skew (x += y * skew) -> matrix(1 0 skew 1 0 0)
        // 2. Rotate (theta) -> rotate(deg)
        // 3. Scale (xScale, scale) -> scale(xScale, scale)
        // 4. Translate (cx, cy) -> translate(cx, cy)
        // SVG applies L-to-R: T * S * R * K * Point

        const thetaDeg = (rotate || 0) * 0.5 * (180 / Math.PI);
        const skewVal = skew || 0;

        const transformStr = `translate(${cx} ${cy}) scale(${xScale} ${scale}) rotate(${thetaDeg}) matrix(1 0 ${skewVal} 1 0 0)`;

        return (
            <g transform={transformStr}>
                {/* Dark oral cavity background - Normalized large rect */}
                <rect x="-10" y="-10" width="20" height="20" fill="#111" />

                {/* Upper Teeth Row */}
                {[...Array(halfNumTeeth * 2)].map((_, i) => (
                    <rect
                        key={`u-${i}`}
                        x={(i - halfNumTeeth) * toothWidth}
                        y={upperRectY}
                        width={toothWidth} height={rectHeight}
                        fill="#fff" stroke="#ccc" strokeWidth={0.5 / scale}
                    />
                ))}

                {/* Lower Teeth Row */}
                {[...Array(halfNumTeeth * 2)].map((_, i) => (
                    <rect
                        key={`l-${i}`}
                        x={(i - halfNumTeeth) * toothWidth}
                        y={lowerRectY}
                        width={toothWidth} height={rectHeight}
                        fill="#fff" stroke="#ccc" strokeWidth={0.5 / scale}
                    />
                ))}
            </g>
        );
    };

    return (
        <motion.svg
            width="200" height="200" viewBox="0 0 100 200"
            style={{
                position: 'absolute',
                top: '50%', left: '50%',
                x: `calc(-50% + ${transform.x}px)`,
                y: `calc(-50% + ${transform.y}px)`,
                scaleX: transform.scale,
                scaleY: transform.scale * squash,
                rotate: transform.rotate,
                overflow: 'visible',
                transformOrigin: '50% 50%' // Scale from center
            }}
        >
            <defs>
                <clipPath id="mouthClip">
                    <path d={d} />
                </clipPath>
            </defs>

            {/* Eyebrows: Inner edge x=10/-10, Outer edge x=50/-50 from center (Scaled) */}
            {/* Thicker, more cartoony eyebrows */}


            {/* Eyes Section */}
            <g transform="translate(50, 85)">
                {/* Eye Whites (Rendered First) */}
                <motion.ellipse
                    cx={-eyeSpacing / 2} cy="0" rx={eyeSize} ry={eyeSize}
                    initial={{ ry: eyeSize }}
                    animate={{ ry: isBlinking ? 0.5 : eyeSize }}
                    fill="white" stroke="black" strokeWidth="2.5"
                />
                <motion.ellipse
                    cx={eyeSpacing / 2} cy="0" rx={eyeSize} ry={eyeSize}
                    initial={{ ry: eyeSize }}
                    animate={{ ry: isBlinking ? 0.5 : eyeSize }}
                    fill="white" stroke="black" strokeWidth="2.5"
                />

                {/* Pupils (Rendered Last to stay on top) */}
                {!isBlinking && (
                    <>
                        <motion.circle
                            cx={-eyeSpacing / 2 + (lookDirection ? lookDirection.x || 0 : 0) * (eyeSize * 0.55)}
                            cy={(lookDirection ? lookDirection.y || 0 : 0) * (eyeSize * 0.45)}
                            r={eyeSize * 0.4}
                            fill="black"
                            initial={false}
                            animate={{
                                cx: -eyeSpacing / 2 + (lookDirection ? lookDirection.x || 0 : 0) * (eyeSize * 0.55),
                                cy: (lookDirection ? lookDirection.y || 0 : 0) * (eyeSize * 0.45)
                            }}
                        />
                        <motion.circle
                            cx={eyeSpacing / 2 + (lookDirection ? lookDirection.x || 0 : 0) * (eyeSize * 0.55)}
                            cy={(lookDirection ? lookDirection.y || 0 : 0) * (eyeSize * 0.45)}
                            r={eyeSize * 0.4}
                            fill="black"
                            initial={false}
                            animate={{
                                cx: eyeSpacing / 2 + (lookDirection ? lookDirection.x || 0 : 0) * (eyeSize * 0.55),
                                cy: (lookDirection ? lookDirection.y || 0 : 0) * (eyeSize * 0.45)
                            }}
                        />
                    </>
                )}
            </g>

            {/* Mouth */}
            <g>
                <motion.g clipPath="url(#mouthClip)">
                    <Teeth />
                </motion.g>
                <path
                    d={d}
                    fill="transparent"
                    stroke="black"
                    strokeWidth="4"
                    strokeLinejoin="round"
                    strokeLinecap="round" // Smooth ends
                />
            </g>

            {/* Eyebrows: Rendered LAST to be on top of eyes/hair (Cartoon logic) */}
            <g>
                <motion.rect
                    x={leftBrow.x - 20}
                    y={leftBrow.y - 4}
                    width="40"
                    height="8"
                    rx="4"
                    fill="black"
                    initial={false}
                    animate={{ y: leftBrow.y - 4, rotate: leftBrow.rotate }}
                    style={{ transformOrigin: `${leftBrow.x}px ${leftBrow.y}px` }}
                />
                <motion.rect
                    x={rightBrow.x - 20}
                    y={rightBrow.y - 4}
                    width="40"
                    height="8"
                    rx="4"
                    fill="black"
                    initial={false}
                    animate={{ y: rightBrow.y - 4, rotate: rightBrow.rotate }}
                    style={{ transformOrigin: `${rightBrow.x}px ${rightBrow.y}px` }}
                />
            </g>

            <metadata>Source Logic: Procedural Face Generator by Red Blob Games (Amit Patel)</metadata>
        </motion.svg>
    );
};

export default Face;
