// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer Abdullah and Concat contributors

//! Ready-made movement: how a clip comes in, goes out, and what it does
//! while it is up.
//!
//! An [`Animation`](crate::animate::Animation)'s keys are the user's own;
//! a [`Motion`] is a choice from a list - "pop in", "slide out to the
//! left", "pulse" - laid over them. Each preset is a small function from
//! its progress to a [`Pose`]: a factor on the scale and the opacity, an
//! addition to the offsets and the rotation, the same relative terms the
//! keys ride in, so a preset moves a title the same way wherever it sits
//! and whatever the user keyed.
//!
//! Everything here is placement and opacity, so it costs the compositor
//! nothing a keyed clip does not already cost.
//!
//! Times are fractions of the clip, as the keys' are: [`Phase::span`] is
//! how much of the clip an entrance takes, or one round of a loop. The
//! caller, who knows the clip's length in seconds, does the division.

/// One instant of a preset: where it has the clip, relative to rest.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Pose {
    /// A factor on the scale; 1 is as placed.
    pub scale: f64,
    /// Added to the horizontal offset, in frame widths.
    pub dx: f64,
    /// Added to the vertical offset, in frame heights; positive is down.
    pub dy: f64,
    /// Added to the rotation, in degrees clockwise.
    pub rotation: f64,
    /// A factor on the opacity; 1 is as set.
    pub opacity: f64,
}

impl Pose {
    /// The clip as placed: nothing moved.
    pub const REST: Pose = Pose {
        scale: 1.0,
        dx: 0.0,
        dy: 0.0,
        rotation: 0.0,
        opacity: 1.0,
    };

    /// Both at once: factors multiplied, additions added.
    pub fn then(self, other: Pose) -> Pose {
        Pose {
            scale: self.scale * other.scale,
            dx: self.dx + other.dx,
            dy: self.dy + other.dy,
            rotation: self.rotation + other.rotation,
            opacity: self.opacity * other.opacity,
        }
    }
}

impl Default for Pose {
    fn default() -> Self {
        Pose::REST
    }
}

/// How a clip arrives, and - played backwards - how it leaves.
///
/// An exit is the entrance run in reverse: "From Top" going out rises off
/// the way it came. One list for both keeps the two sides of a title
/// matched, the way a pair chosen from one menu should be.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Entrance {
    /// Opacity alone.
    Fade,
    /// A short way down from above, fading up.
    FromTop,
    /// A short way up from below, fading up.
    FromBottom,
    /// A short way in from the left, fading up.
    FromLeft,
    /// A short way in from the right, fading up.
    FromRight,
    /// All the way in from past the top edge.
    FlyTop,
    /// All the way in from past the bottom edge.
    FlyBottom,
    /// All the way in from past the left edge.
    FlyLeft,
    /// All the way in from past the right edge.
    FlyRight,
    /// Up from nothing, a little past full size, and back.
    Pop,
    /// Up from small, fading in.
    Grow,
    /// Down from large, fading in.
    Shrink,
    /// Falls in from above and bounces to rest.
    Drop,
    /// Turns half a circle while growing from nothing.
    Spin,
    /// Swings down from a tilt, overshooting and settling.
    Swing,
    /// Springs up from nothing and wobbles to size.
    Elastic,
    /// A failing light: on and off, then on.
    Flicker,
    /// Torn sideways in jumps, flickering, before it holds.
    Glitch,
    /// A little rise and a little growth, fading in. The quiet one.
    Rise,
    /// Rolls in from the left, a full turn.
    Roll,
    /// Tips up from lying on its side, fading in.
    Tilt,
}

impl Entrance {
    /// Every entrance, in the order a menu lists them.
    pub const ALL: [Entrance; 21] = [
        Entrance::Fade,
        Entrance::FromTop,
        Entrance::FromBottom,
        Entrance::FromLeft,
        Entrance::FromRight,
        Entrance::FlyTop,
        Entrance::FlyBottom,
        Entrance::FlyLeft,
        Entrance::FlyRight,
        Entrance::Pop,
        Entrance::Grow,
        Entrance::Shrink,
        Entrance::Drop,
        Entrance::Spin,
        Entrance::Swing,
        Entrance::Elastic,
        Entrance::Flicker,
        Entrance::Glitch,
        Entrance::Rise,
        Entrance::Roll,
        Entrance::Tilt,
    ];

    /// The name a project file stores it by. Stable forever.
    pub fn id(self) -> &'static str {
        match self {
            Entrance::Fade => "fade",
            Entrance::FromTop => "from-top",
            Entrance::FromBottom => "from-bottom",
            Entrance::FromLeft => "from-left",
            Entrance::FromRight => "from-right",
            Entrance::FlyTop => "fly-top",
            Entrance::FlyBottom => "fly-bottom",
            Entrance::FlyLeft => "fly-left",
            Entrance::FlyRight => "fly-right",
            Entrance::Pop => "pop",
            Entrance::Grow => "grow",
            Entrance::Shrink => "shrink",
            Entrance::Drop => "drop",
            Entrance::Spin => "spin",
            Entrance::Swing => "swing",
            Entrance::Elastic => "elastic",
            Entrance::Flicker => "flicker",
            Entrance::Glitch => "glitch",
            Entrance::Rise => "rise",
            Entrance::Roll => "roll",
            Entrance::Tilt => "tilt",
        }
    }

    /// What a menu calls it, in English like an effect's name. Named for
    /// the side or the move rather than a direction of travel, since the
    /// same entry is an exit too: "Top" comes down from the top going in
    /// and rises off it going out.
    pub fn name(self) -> &'static str {
        match self {
            Entrance::Fade => "Fade",
            Entrance::FromTop => "Top",
            Entrance::FromBottom => "Bottom",
            Entrance::FromLeft => "Left",
            Entrance::FromRight => "Right",
            Entrance::FlyTop => "Fly Top",
            Entrance::FlyBottom => "Fly Bottom",
            Entrance::FlyLeft => "Fly Left",
            Entrance::FlyRight => "Fly Right",
            Entrance::Pop => "Pop",
            Entrance::Grow => "Grow",
            Entrance::Shrink => "Shrink",
            Entrance::Drop => "Drop",
            Entrance::Spin => "Spin",
            Entrance::Swing => "Swing",
            Entrance::Elastic => "Elastic",
            Entrance::Flicker => "Flicker",
            Entrance::Glitch => "Glitch",
            Entrance::Rise => "Rise",
            Entrance::Roll => "Roll",
            Entrance::Tilt => "Tilt",
        }
    }

    /// The entrance a stored name means; None for one this build does not
    /// know, which then plays as no entrance at all.
    pub fn parse(id: &str) -> Option<Entrance> {
        Entrance::ALL
            .into_iter()
            .find(|entrance| entrance.id() == id)
    }

    /// The pose `t` of the way in: 0 just arriving, 1 at rest.
    pub fn pose(self, t: f64) -> Pose {
        let t = t.clamp(0.0, 1.0);
        if t >= 1.0 {
            return Pose::REST;
        }
        let e = out_cubic(t);
        let away = 1.0 - e;
        // The short slides fade up over their first half, so the title is
        // never seen standing still at its starting point.
        let fade = smooth(t * 2.0);
        let rest = Pose::REST;
        match self {
            Entrance::Fade => Pose {
                opacity: smooth(t),
                ..rest
            },
            Entrance::FromTop => Pose {
                dy: -SLIDE * away,
                opacity: fade,
                ..rest
            },
            Entrance::FromBottom => Pose {
                dy: SLIDE * away,
                opacity: fade,
                ..rest
            },
            Entrance::FromLeft => Pose {
                dx: -SLIDE * away,
                opacity: fade,
                ..rest
            },
            Entrance::FromRight => Pose {
                dx: SLIDE * away,
                opacity: fade,
                ..rest
            },
            Entrance::FlyTop => Pose {
                dy: -FLY * away,
                ..rest
            },
            Entrance::FlyBottom => Pose {
                dy: FLY * away,
                ..rest
            },
            Entrance::FlyLeft => Pose {
                dx: -FLY * away,
                ..rest
            },
            Entrance::FlyRight => Pose {
                dx: FLY * away,
                ..rest
            },
            Entrance::Pop => Pose {
                scale: out_back(t, 2.2).max(0.0),
                opacity: smooth(t * 4.0),
                ..rest
            },
            Entrance::Grow => Pose {
                scale: 0.4 + 0.6 * e,
                opacity: smooth(t * 1.5),
                ..rest
            },
            Entrance::Shrink => Pose {
                scale: 1.0 + 0.8 * away,
                opacity: smooth(t * 1.5),
                ..rest
            },
            Entrance::Drop => Pose {
                dy: -0.3 * (1.0 - out_bounce(t)),
                opacity: smooth(t * 5.0),
                ..rest
            },
            Entrance::Spin => Pose {
                scale: e,
                rotation: -180.0 * away,
                opacity: smooth(t * 3.0),
                ..rest
            },
            Entrance::Swing => Pose {
                rotation: -40.0 * (1.0 - out_elastic(t, 0.45)),
                opacity: smooth(t * 3.0),
                ..rest
            },
            Entrance::Elastic => Pose {
                scale: out_elastic(t, 0.35).max(0.0),
                opacity: smooth(t * 4.0),
                ..rest
            },
            Entrance::Flicker => Pose {
                opacity: flicker(t),
                ..rest
            },
            Entrance::Glitch => {
                let step = (t * 12.0).floor();
                let tear = (noise(step, 3.0) - 0.5) * 0.12 * away;
                Pose {
                    dx: tear,
                    opacity: if noise(step, 7.0) < 0.35 * away {
                        0.0
                    } else {
                        1.0
                    },
                    ..rest
                }
            }
            Entrance::Rise => Pose {
                dy: 0.04 * away,
                scale: 0.96 + 0.04 * e,
                opacity: smooth(t),
                ..rest
            },
            Entrance::Roll => Pose {
                dx: -0.6 * away,
                rotation: -360.0 * away,
                opacity: smooth(t * 2.0),
                ..rest
            },
            Entrance::Tilt => Pose {
                rotation: 90.0 * away,
                opacity: smooth(t * 1.5),
                ..rest
            },
        }
    }
}

/// A move that repeats for as long as the clip is up.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Repeat {
    /// Swells a little and settles, every round.
    Pulse,
    /// A slow swell with the light rising and falling with it.
    Breathe,
    /// Drifts up and down, weightless.
    Float,
    /// Rocks gently either side of upright.
    Sway,
    /// A pendulum: wide swings either side.
    Pendulum,
    /// A quick side to side, as if knocked.
    Shake,
    /// A small nervous jitter every way, never still.
    Tremble,
    /// Two beats and a rest.
    Heartbeat,
    /// On, then off.
    Blink,
    /// A failing light: steady, with dips nearly to dark.
    Flicker,
    /// A tilt and a squeeze, back and forth.
    Wobble,
    /// Turns all the way round, again and again.
    Spin,
    /// Holds still, then jumps sideways for an instant.
    Glitch,
    /// Slides slowly side to side.
    Drift,
    /// A slow push in that starts again each round.
    Zoom,
    /// In a little and back out, slowly: a still or a shot kept alive. A
    /// round as long as the clip is one breath of a Ken Burns.
    SlowZoom,
    /// Drifts side to side across a slightly enlarged picture, so no edge
    /// shows.
    Pan,
    /// The small unsteady sway of a camera held in the hand: found
    /// footage, a witness's phone.
    Handheld,
    /// A hard, fast shake: a blast, a slam, something heavy landing.
    CameraShake,
}

impl Repeat {
    /// Every loop, in the order a menu lists them.
    pub const ALL: [Repeat; 19] = [
        Repeat::Pulse,
        Repeat::Breathe,
        Repeat::Float,
        Repeat::Sway,
        Repeat::Pendulum,
        Repeat::Shake,
        Repeat::Tremble,
        Repeat::Heartbeat,
        Repeat::Blink,
        Repeat::Flicker,
        Repeat::Wobble,
        Repeat::Spin,
        Repeat::Glitch,
        Repeat::Drift,
        Repeat::Zoom,
        Repeat::SlowZoom,
        Repeat::Pan,
        Repeat::Handheld,
        Repeat::CameraShake,
    ];

    /// The name a project file stores it by. Stable forever.
    pub fn id(self) -> &'static str {
        match self {
            Repeat::Pulse => "pulse",
            Repeat::Breathe => "breathe",
            Repeat::Float => "float",
            Repeat::Sway => "sway",
            Repeat::Pendulum => "pendulum",
            Repeat::Shake => "shake",
            Repeat::Tremble => "tremble",
            Repeat::Heartbeat => "heartbeat",
            Repeat::Blink => "blink",
            Repeat::Flicker => "flicker",
            Repeat::Wobble => "wobble",
            Repeat::Spin => "spin",
            Repeat::Glitch => "glitch",
            Repeat::Drift => "drift",
            Repeat::Zoom => "zoom",
            Repeat::SlowZoom => "slow-zoom",
            Repeat::Pan => "pan",
            Repeat::Handheld => "handheld",
            Repeat::CameraShake => "camera-shake",
        }
    }

    /// What a menu calls it, in English like an effect's name.
    pub fn name(self) -> &'static str {
        match self {
            Repeat::Pulse => "Pulse",
            Repeat::Breathe => "Breathe",
            Repeat::Float => "Float",
            Repeat::Sway => "Sway",
            Repeat::Pendulum => "Pendulum",
            Repeat::Shake => "Shake",
            Repeat::Tremble => "Tremble",
            Repeat::Heartbeat => "Heartbeat",
            Repeat::Blink => "Blink",
            Repeat::Flicker => "Flicker",
            Repeat::Wobble => "Wobble",
            Repeat::Spin => "Spin",
            Repeat::Glitch => "Glitch",
            Repeat::Drift => "Drift",
            Repeat::Zoom => "Zoom",
            Repeat::SlowZoom => "Slow Zoom",
            Repeat::Pan => "Pan",
            Repeat::Handheld => "Handheld",
            Repeat::CameraShake => "Camera Shake",
        }
    }

    /// The loop a stored name means; None for one this build does not know.
    pub fn parse(id: &str) -> Option<Repeat> {
        Repeat::ALL.into_iter().find(|repeat| repeat.id() == id)
    }

    /// The pose `t` of the way through round number `round`. Every round
    /// starts and ends at rest, so rounds join without a jump, except where
    /// a jump is the point (Blink, Glitch).
    pub fn pose(self, t: f64, round: f64) -> Pose {
        let t = t.rem_euclid(1.0);
        let wave = (t * TAU).sin();
        let swell = 0.5 - 0.5 * (t * TAU).cos();
        let rest = Pose::REST;
        match self {
            Repeat::Pulse => Pose {
                scale: 1.0 + 0.07 * swell,
                ..rest
            },
            Repeat::Breathe => Pose {
                scale: 1.0 + 0.04 * swell,
                opacity: 1.0 - 0.3 * swell,
                ..rest
            },
            Repeat::Float => Pose {
                dy: -0.015 * wave,
                ..rest
            },
            Repeat::Sway => Pose {
                rotation: 4.0 * wave,
                ..rest
            },
            Repeat::Pendulum => Pose {
                rotation: 14.0 * wave,
                ..rest
            },
            Repeat::Shake => Pose {
                dx: 0.012 * (t * TAU * 4.0).sin(),
                ..rest
            },
            Repeat::Tremble => {
                let step = (round * 16.0 + (t * 16.0).floor()).floor();
                Pose {
                    dx: (noise(step, 1.0) - 0.5) * 0.008,
                    dy: (noise(step, 2.0) - 0.5) * 0.008,
                    rotation: (noise(step, 4.0) - 0.5) * 1.5,
                    ..rest
                }
            }
            Repeat::Heartbeat => {
                // Each beat a single swell over its own stretch of the
                // round, at rest outside it, so the round ends still.
                let beat = |from: f64, to: f64| {
                    if t <= from || t >= to {
                        0.0
                    } else {
                        (((t - from) / (to - from)) * std::f64::consts::PI).sin()
                    }
                };
                Pose {
                    scale: 1.0 + 0.09 * beat(0.02, 0.2) + 0.06 * beat(0.24, 0.4),
                    ..rest
                }
            }
            Repeat::Blink => Pose {
                opacity: if t < 0.5 { 1.0 } else { 0.0 },
                ..rest
            },
            Repeat::Flicker => {
                let step = (round * 10.0 + (t * 10.0).floor()).floor();
                let dip = noise(step, 5.0);
                Pose {
                    opacity: if dip > 0.8 {
                        0.1
                    } else {
                        1.0 - 0.15 * noise(step, 6.0)
                    },
                    ..rest
                }
            }
            Repeat::Wobble => Pose {
                rotation: 5.0 * wave,
                scale: 1.0 + 0.03 * (t * TAU * 2.0).sin(),
                ..rest
            },
            Repeat::Spin => Pose {
                rotation: 360.0 * t,
                ..rest
            },
            Repeat::Glitch => {
                let jump = t > 0.86 && t < 0.92;
                let side = if noise(round, 8.0) < 0.5 { -1.0 } else { 1.0 };
                Pose {
                    dx: if jump { 0.03 * side } else { 0.0 },
                    opacity: if t > 0.88 && t < 0.9 { 0.4 } else { 1.0 },
                    ..rest
                }
            }
            Repeat::Drift => Pose {
                dx: 0.02 * wave,
                ..rest
            },
            Repeat::Zoom => Pose {
                scale: 1.0 + 0.08 * smooth(t),
                ..rest
            },
            Repeat::SlowZoom => Pose {
                scale: 1.0 + 0.12 * swell,
                ..rest
            },
            Repeat::Pan => Pose {
                scale: 1.12,
                dx: 0.05 * wave,
                ..rest
            },
            Repeat::Handheld => {
                // Sines at rates that never line up, on the clip's own
                // clock rather than the round's, so it never repeats and
                // never jumps where one round meets the next.
                let at = round + t;
                let sway = |rate: f64, phase: f64| (at * TAU * rate + phase).sin();
                Pose {
                    scale: 1.04,
                    dx: 0.006 * (sway(0.37, 0.0) + 0.5 * sway(1.13, 1.7)),
                    dy: 0.005 * (sway(0.29, 2.1) + 0.5 * sway(0.97, 0.4)),
                    rotation: 0.4 * (sway(0.23, 0.9) + 0.4 * sway(0.81, 2.6)),
                    ..rest
                }
            }
            Repeat::CameraShake => {
                let at = round + t;
                let jolt = |rate: f64, phase: f64| (at * TAU * rate + phase).sin();
                Pose {
                    scale: 1.08,
                    dx: 0.02 * (jolt(7.3, 0.0) + 0.5 * jolt(13.1, 1.3)),
                    dy: 0.016 * (jolt(6.1, 2.2) + 0.5 * jolt(11.7, 0.5)),
                    rotation: 1.2 * jolt(5.3, 1.1),
                    ..rest
                }
            }
        }
    }
}

/// One choice and how much of the clip it takes: the entrance's or the
/// exit's length, or one round of a loop, as a fraction of the clip.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Phase<P> {
    /// Which preset.
    pub preset: P,
    /// Its length as a fraction of the clip, `0..=1`.
    pub span: f64,
}

/// A clip's chosen entrance, exit and loop. Any may be absent.
#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub struct Motion {
    /// How it comes in, over the start of the clip.
    pub intro: Option<Phase<Entrance>>,
    /// How it goes out, over the end of the clip: the entrance reversed.
    pub outro: Option<Phase<Entrance>>,
    /// What it does all the while, a round every `span` of the clip.
    pub repeat: Option<Phase<Repeat>>,
}

impl Motion {
    /// True when nothing moves.
    pub fn is_empty(&self) -> bool {
        self.intro.is_none() && self.outro.is_none() && self.repeat.is_none()
    }

    /// The pose at `x`, a fraction of the clip's length.
    pub fn pose_at(&self, x: f64) -> Pose {
        let x = x.clamp(0.0, 1.0);
        let mut pose = Pose::REST;
        if let Some(Phase { preset, span }) = self.intro
            && span > 0.0
            && x < span
        {
            pose = pose.then(preset.pose(x / span));
        }
        if let Some(Phase { preset, span }) = self.outro
            && span > 0.0
            && x > 1.0 - span
        {
            pose = pose.then(preset.pose((1.0 - x) / span));
        }
        if let Some(Phase { preset, span }) = self.repeat
            && span > 0.0
        {
            let rounds = x / span;
            pose = pose.then(preset.pose(rounds.fract(), rounds.floor()));
        }
        pose
    }
}

/// How far the short slides travel: an eighth of the frame.
const SLIDE: f64 = 0.12;
/// How far the fly-ins travel: from wholly off the frame, for a title of
/// any size placed anywhere on it.
const FLY: f64 = 1.1;
const TAU: f64 = std::f64::consts::TAU;

/// Hermite smoothing of `t` clamped into `0..=1`.
fn smooth(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Fast out of the start, gentle into the end.
fn out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

/// Past the end by a little and back: `s` is how far past.
fn out_back(t: f64, s: f64) -> f64 {
    let u = t - 1.0;
    1.0 + u * u * ((s + 1.0) * u + s)
}

/// Lands and bounces, each bounce lower.
fn out_bounce(t: f64) -> f64 {
    const N: f64 = 7.5625;
    const D: f64 = 2.75;
    if t < 1.0 / D {
        N * t * t
    } else if t < 2.0 / D {
        let t = t - 1.5 / D;
        N * t * t + 0.75
    } else if t < 2.5 / D {
        let t = t - 2.25 / D;
        N * t * t + 0.9375
    } else {
        let t = t - 2.625 / D;
        N * t * t + 0.984375
    }
}

/// Overshoots and rings down to rest; `period` sets how fast it rings.
fn out_elastic(t: f64, period: f64) -> f64 {
    if t <= 0.0 {
        return 0.0;
    }
    if t >= 1.0 {
        return 1.0;
    }
    2f64.powf(-10.0 * t) * ((t - period / 4.0) * TAU / period).sin() + 1.0
}

/// A light that cannot decide: dark, a flash, dark, two flashes, then on.
fn flicker(t: f64) -> f64 {
    const LIT: [(f64, f64); 4] = [(0.15, 0.22), (0.38, 0.42), (0.5, 0.58), (0.7, 1.0)];
    if LIT.iter().any(|&(from, to)| t >= from && t < to) {
        1.0
    } else {
        0.0
    }
}

/// A number in `0..1` from a whole step and a seed: the same on every
/// machine, so a preview and an export flicker alike.
fn noise(step: f64, seed: f64) -> f64 {
    let mut h = (step as i64 as u64)
        .wrapping_mul(0x9e37_79b9_7f4a_7c15)
        .wrapping_add((seed as u64).wrapping_mul(0x85eb_ca6b));
    h ^= h >> 33;
    h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
    h ^= h >> 33;
    (h >> 11) as f64 / (1u64 << 53) as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn near(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    fn at_rest(pose: Pose) -> bool {
        near(pose.scale, 1.0)
            && near(pose.dx, 0.0)
            && near(pose.dy, 0.0)
            && near(pose.rotation, 0.0)
            && near(pose.opacity, 1.0)
    }

    #[test]
    fn every_entrance_ends_at_rest_and_starts_away_from_it() {
        for entrance in Entrance::ALL {
            assert!(at_rest(entrance.pose(1.0)), "{entrance:?} at its end");
            assert!(!at_rest(entrance.pose(0.0)), "{entrance:?} at its start");
            for n in 0..=100 {
                let pose = entrance.pose(f64::from(n) / 100.0);
                assert!(pose.scale >= 0.0, "{entrance:?} turned inside out");
                assert!(
                    (0.0..=1.0).contains(&pose.opacity),
                    "{entrance:?} opacity {}",
                    pose.opacity
                );
            }
        }
    }

    #[test]
    fn every_id_reads_back_as_its_preset() {
        for entrance in Entrance::ALL {
            assert_eq!(Entrance::parse(entrance.id()), Some(entrance));
        }
        for repeat in Repeat::ALL {
            assert_eq!(Repeat::parse(repeat.id()), Some(repeat));
        }
        assert_eq!(Entrance::parse("somersault"), None);
    }

    #[test]
    fn the_smooth_loops_join_their_rounds_without_a_jump() {
        for repeat in Repeat::ALL {
            if matches!(
                repeat,
                Repeat::Blink | Repeat::Glitch | Repeat::Flicker | Repeat::Tremble | Repeat::Zoom
            ) {
                continue;
            }
            let end = repeat.pose(0.999_999, 0.0);
            let start = repeat.pose(0.0, 1.0);
            let spin = if repeat == Repeat::Spin { 360.0 } else { 0.0 };
            assert!(
                (end.scale - start.scale).abs() < 1e-3
                    && (end.dx - start.dx).abs() < 1e-3
                    && (end.dy - start.dy).abs() < 1e-3
                    && (end.rotation - spin - start.rotation).abs() < 1e-2
                    && (end.opacity - start.opacity).abs() < 1e-3,
                "{repeat:?}: {end:?} then {start:?}"
            );
        }
    }

    #[test]
    fn an_intro_and_an_outro_hold_the_middle_still() {
        let motion = Motion {
            intro: Some(Phase {
                preset: Entrance::FromTop,
                span: 0.2,
            }),
            outro: Some(Phase {
                preset: Entrance::Fade,
                span: 0.25,
            }),
            repeat: None,
        };
        assert!(at_rest(motion.pose_at(0.5)));
        assert!(motion.pose_at(0.0).dy < 0.0, "starts above");
        assert!(near(motion.pose_at(0.0).opacity, 0.0), "and unseen");
        assert!(
            near(motion.pose_at(1.0).opacity, 0.0),
            "fades out to nothing"
        );
        assert!(motion.pose_at(0.9).opacity < 1.0, "on its way out");
    }

    #[test]
    fn an_exit_is_its_entrance_backwards() {
        let motion = Motion {
            outro: Some(Phase {
                preset: Entrance::FlyLeft,
                span: 0.5,
            }),
            ..Motion::default()
        };
        assert!(near(motion.pose_at(1.0).dx, Entrance::FlyLeft.pose(0.0).dx));
        assert!(near(
            motion.pose_at(0.75).dx,
            Entrance::FlyLeft.pose(0.5).dx
        ));
    }

    #[test]
    fn a_loop_repeats_every_span() {
        let motion = Motion {
            repeat: Some(Phase {
                preset: Repeat::Pulse,
                span: 0.25,
            }),
            ..Motion::default()
        };
        assert!(near(motion.pose_at(0.1).scale, motion.pose_at(0.35).scale));
        assert!(motion.pose_at(0.125).scale > 1.05, "swollen mid-round");
    }
}
