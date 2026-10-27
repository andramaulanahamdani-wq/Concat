// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer Abdullah and Concat contributors

//! The Stickers page's Backgrounds shelf: plain grounds to put under a
//! title or a cut-out - a colour, a gradient, a vignette, paper, fog, film
//! grain, a night sky.
//!
//! None of them ships as a file. Each is a few numbers here, painted at
//! the project's own size the first time it is used and written into the
//! project's `backgrounds/` folder as a PNG, which the bin then imports
//! like any other still: a 4K project gets a 4K ground, the app carries no
//! pictures, and the project owns its copy. The shelf's cards are the same
//! painter at a thumbnail's size, so a card is exactly what it lays down.

use std::path::PathBuf;

use concat_project::Command;
use image::{Rgb, RgbImage};

use crate::i18n::{t, tf};
use crate::studio::Studio;

/// One ground on the shelf.
pub struct Background {
    /// Stable for ever: it names the file a project keeps.
    pub id: &'static str,
    /// What the card says. In English, as an effect's name is.
    pub name: &'static str,
    look: Look,
}

/// How a ground is painted. Colours are `0xRRGGBB`.
#[derive(Clone, Copy)]
enum Look {
    /// One colour edge to edge.
    Solid(u32),
    /// From the first colour to the second, top to bottom.
    Vertical(u32, u32),
    /// From the first colour to the second, corner to corner.
    Diagonal(u32, u32),
    /// The first colour in the middle falling to the second at the corners.
    Radial(u32, u32),
    /// A sheet of old paper: the colour mottled, its edges darkened.
    Paper(u32, u32),
    /// Black with film's dancing grain and a soft vignette.
    Grain,
    /// Drifting fog of the second colour over the first.
    Fog(u32, u32),
    /// A night sky: scattered stars over a deep blue fall.
    Stars,
    /// Rough grey concrete.
    Concrete,
}

macro_rules! ground {
    ($id:literal, $name:literal, $look:expr) => {
        Background {
            id: $id,
            name: $name,
            look: $look,
        }
    };
}

/// Every ground, in the shelf's order.
pub const ALL: &[Background] = &[
    ground!("white", "White", Look::Solid(0xffffff)),
    ground!("black", "Black", Look::Solid(0x000000)),
    ground!("off-white", "Off-white", Look::Solid(0xf2efe8)),
    ground!("charcoal", "Charcoal", Look::Solid(0x1c1c1e)),
    ground!("grey", "Grey", Look::Solid(0x7f7f7f)),
    ground!("navy", "Navy", Look::Solid(0x0b1a33)),
    ground!("deep-red", "Deep Red", Look::Solid(0x4a0808)),
    ground!("forest", "Forest", Look::Solid(0x0f2b1d)),
    ground!("violet", "Violet", Look::Solid(0x2a0f3d)),
    ground!("green-screen", "Green Screen", Look::Solid(0x00b140)),
    ground!("blue-screen", "Blue Screen", Look::Solid(0x0047bb)),
    ground!("night-sky", "Night Sky", Look::Vertical(0x060a1f, 0x2b1055)),
    ground!("noxara", "Noxara", Look::Diagonal(0x0d001c, 0x3d1a6e)),
    ground!(
        "blood-moon",
        "Blood Moon",
        Look::Vertical(0x120000, 0x6e0a0a)
    ),
    ground!("old-gold", "Old Gold", Look::Diagonal(0x1a1206, 0x8a6a23)),
    ground!("sunset", "Sunset", Look::Vertical(0xff7e5f, 0xfeb47b)),
    ground!("ocean", "Ocean", Look::Diagonal(0x1e5f8a, 0x6dd5ed)),
    ground!("dusk-grey", "Dusk Grey", Look::Vertical(0x3a3a3c, 0x050505)),
    ground!("spotlight", "Spotlight", Look::Radial(0x5a5a5a, 0x000000)),
    ground!(
        "vignette",
        "Dark Vignette",
        Look::Radial(0x2a2a2e, 0x000000)
    ),
    ground!(
        "violet-glow",
        "Violet Glow",
        Look::Radial(0x4b2380, 0x07000f)
    ),
    ground!("parchment", "Parchment", Look::Paper(0xd9c49a, 0x5b3d17)),
    ground!("old-paper", "Old Paper", Look::Paper(0xe8e0cc, 0x8a7a5a)),
    ground!("film-grain", "Film Grain", Look::Grain),
    ground!("fog", "Fog", Look::Fog(0x0b0c10, 0x6a6f7a)),
    ground!(
        "violet-smoke",
        "Violet Smoke",
        Look::Fog(0x07000f, 0x6b3fa0)
    ),
    ground!("starfield", "Starfield", Look::Stars),
    ground!("concrete", "Concrete", Look::Concrete),
];

/// The ground by its id.
pub fn get(id: &str) -> Option<&'static Background> {
    ALL.iter().find(|ground| ground.id == id)
}

impl Background {
    /// The ground painted `width` by `height`.
    pub fn render(&self, width: u32, height: u32) -> RgbImage {
        let (w, h) = (width.max(1) as f32, height.max(1) as f32);
        // Noise is laid out in units of the frame's height, so a texture
        // has the same grain on any size and shape of frame.
        let unit = h;
        RgbImage::from_fn(width.max(1), height.max(1), |x, y| {
            let (u, v) = ((x as f32 + 0.5) / w, (y as f32 + 0.5) / h);
            let (nx, ny) = ((x as f32) / unit, (y as f32) / unit);
            // The distance from the middle, 0 there and 1 at a corner.
            let reach = {
                let (dx, dy) = ((u - 0.5) * w / unit, v - 0.5);
                let corner = (0.5 * w / unit).hypot(0.5);
                (dx.hypot(dy) / corner).min(1.0)
            };
            let colour = match self.look {
                Look::Solid(c) => rgb(c),
                Look::Vertical(a, b) => mix(rgb(a), rgb(b), smooth(v)),
                Look::Diagonal(a, b) => mix(rgb(a), rgb(b), smooth((u + v) * 0.5)),
                Look::Radial(a, b) => mix(rgb(a), rgb(b), smooth(reach)),
                Look::Paper(a, b) => {
                    let mottle = fbm(nx * 6.0, ny * 6.0, 1);
                    let fibre = fbm(nx * 40.0, ny * 3.0, 2) * 0.35;
                    let burn = smooth(((reach - 0.55) / 0.45).clamp(0.0, 1.0));
                    let paper = mix(rgb(a), rgb(b), (mottle * 0.45 + fibre * 0.2).min(1.0));
                    mix(paper, rgb(b), burn * 0.85)
                }
                Look::Grain => {
                    let grain = hash(x as i32, y as i32, 7) - 0.5;
                    let lift = 0.09 * (1.0 - smooth(reach)) + grain * 0.06;
                    [lift.max(0.0); 3]
                }
                Look::Fog(a, b) => {
                    let fog = fbm(nx * 2.2 + fbm(nx, ny, 5) * 1.5, ny * 3.0, 3);
                    let amount = smooth(((fog - 0.3) / 0.6).clamp(0.0, 1.0)) * (1.0 - 0.5 * reach);
                    mix(rgb(a), rgb(b), amount)
                }
                Look::Stars => {
                    let sky = mix(rgb(0x0a1030), rgb(0x010205), smooth(v));
                    // One star at most per cell, at a point inside it.
                    let cell = 160.0 / unit.max(1.0);
                    let (cx, cy) = (
                        (x as f32 * cell / 4.0) as i32,
                        (y as f32 * cell / 4.0) as i32,
                    );
                    let star = hash(cx, cy, 11);
                    let lit = if star > 0.985 {
                        let (sx, sy) = (hash(cx, cy, 12), hash(cx, cy, 13));
                        let (px, py) = (
                            x as f32 * cell / 4.0 - cx as f32,
                            y as f32 * cell / 4.0 - cy as f32,
                        );
                        let d = (px - sx).hypot(py - sy) * 4.0 / cell;
                        (1.0 - d * 1.6).max(0.0) * (0.5 + star * 0.5)
                    } else {
                        0.0
                    };
                    [sky[0] + lit, sky[1] + lit, sky[2] + lit * 1.05]
                }
                Look::Concrete => {
                    let base = fbm(nx * 8.0, ny * 8.0, 4);
                    let pit = if hash(x as i32 / 2, y as i32 / 2, 9) > 0.995 {
                        -0.15
                    } else {
                        0.0
                    };
                    let level = 0.42
                        + (base - 0.5) * 0.25
                        + pit
                        + (hash(x as i32, y as i32, 3) - 0.5) * 0.04;
                    [level, level, level * 0.98]
                }
            };
            Rgb(colour.map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8))
        })
    }

    /// The card's picture, at 16:9.
    pub fn thumbnail(&self) -> slint::Image {
        let (width, height) = (160, 90);
        let picture = self.render(width, height);
        let mut buffer = slint::SharedPixelBuffer::<slint::Rgb8Pixel>::new(width, height);
        buffer.make_mut_bytes().copy_from_slice(picture.as_raw());
        slint::Image::from_rgb8(buffer)
    }
}

fn rgb(colour: u32) -> [f32; 3] {
    [
        ((colour >> 16) & 0xff) as f32 / 255.0,
        ((colour >> 8) & 0xff) as f32 / 255.0,
        (colour & 0xff) as f32 / 255.0,
    ]
}

fn mix(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [0, 1, 2].map(|i| a[i] + (b[i] - a[i]) * t)
}

fn smooth(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// A number in `0..1` from a whole point and a seed, the same everywhere.
fn hash(x: i32, y: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x9e37_79b9)
        ^ (y as u32).wrapping_mul(0x85eb_ca6b)
        ^ seed.wrapping_mul(0xc2b2_ae35);
    h = (h ^ (h >> 16)).wrapping_mul(0x7feb_352d);
    h = (h ^ (h >> 15)).wrapping_mul(0x846c_a68b);
    h ^= h >> 16;
    (h >> 8) as f32 / 16_777_216.0
}

/// Smooth value noise at a point, `0..1`.
fn noise(x: f32, y: f32, seed: u32) -> f32 {
    let (ix, iy) = (x.floor() as i32, y.floor() as i32);
    let (fx, fy) = (x - x.floor(), y - y.floor());
    let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
    let top = hash(ix, iy, seed) + (hash(ix + 1, iy, seed) - hash(ix, iy, seed)) * sx;
    let bottom =
        hash(ix, iy + 1, seed) + (hash(ix + 1, iy + 1, seed) - hash(ix, iy + 1, seed)) * sx;
    top + (bottom - top) * sy
}

/// Five octaves of [`noise`], `0..1`.
fn fbm(x: f32, y: f32, seed: u32) -> f32 {
    let (mut sum, mut amplitude, mut scale) = (0.0, 0.5, 1.0);
    for octave in 0..5 {
        sum += amplitude * noise(x * scale + 17.0 * octave as f32, y * scale, seed + octave);
        amplitude *= 0.5;
        scale *= 2.0;
    }
    sum / 0.96875
}

impl Studio {
    /// Lays the ground `id` names at the playhead, under everything there:
    /// on the lowest lane when that stretch of it is free, else on a new
    /// lane put under every other - a ground on top would hide what it is
    /// meant to be behind. Painted at the timeline's size into the
    /// project's `backgrounds/` folder the first time, and imported into
    /// the bin once. Selects what it made.
    pub fn place_background(&mut self, id: &str) {
        let Some(ground) = get(id) else {
            return;
        };
        let media_id = match self.adopt_background(ground) {
            Ok(media_id) => media_id,
            Err(error) => {
                self.notify(&error, true);
                return;
            }
        };
        self.close_source();
        let start = f64::from(self.playhead);
        // A still runs five seconds when it is placed.
        let end = start + 5.0;
        let lowest_free = |studio: &Studio| {
            let timeline = studio.project().active();
            // The stack is stored bottom first.
            let lowest = timeline.tracks.first()?;
            let taken = timeline.clips.iter().any(|clip| {
                clip.track_id == lowest.id && clip.start < end && start < clip.start + clip.duration
            });
            (!taken).then(|| lowest.id.clone())
        };
        let track_id = match lowest_free(self) {
            Some(track_id) => Some(track_id),
            None => self.apply(Command::AddTrack { bottom: true }),
        };
        let created = match track_id {
            Some(track_id) => self.apply(Command::AddClip {
                media_id,
                track_id,
                start,
                ripple: false,
            }),
            None => self.apply(Command::AddClipAtFirstFree { media_id, start }),
        };
        if let Some(created) = created {
            self.selection = vec![created];
        }
    }

    /// The bin's id for `ground` at this timeline's size, painting and
    /// importing it when the project has not got it yet.
    fn adopt_background(&mut self, ground: &Background) -> Result<String, String> {
        let project = self
            .session
            .as_ref()
            .map(|session| PathBuf::from(session.path()))
            .ok_or_else(|| t("sounds.openProjectFirst"))?;
        let (width, height) = self.output_size();
        let folder = project.join("backgrounds");
        let target = folder.join(format!("{}-{width}x{height}.png", ground.id));
        let target_text = target.to_string_lossy().into_owned();
        if let Some(item) = self
            .project()
            .media
            .iter()
            .find(|item| item.path == target_text)
        {
            return Ok(item.id.clone());
        }
        if !target.exists() {
            std::fs::create_dir_all(&folder)
                .map_err(|error| tf("sounds.couldNotCopy", &[&ground.name, &error]))?;
            ground
                .render(width, height)
                .save(&target)
                .map_err(|error| tf("sounds.couldNotCopy", &[&ground.name, &error]))?;
        }
        let summary = concat_host::media::probe(&target_text)?;
        let mut item = summary.to_new_media();
        item.name = ground.name.to_owned();
        let created = self.apply(Command::AddMedia { item });
        created
            .or_else(|| {
                self.project()
                    .media
                    .iter()
                    .find(|item| item.path == target_text)
                    .map(|item| item.id.clone())
            })
            .ok_or_else(|| t("sounds.openProjectFirst"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_unique_and_file_safe() {
        for (index, ground) in ALL.iter().enumerate() {
            assert!(
                ground
                    .id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                "{}",
                ground.id
            );
            assert!(
                !ALL[..index].iter().any(|held| held.id == ground.id),
                "{} twice",
                ground.id
            );
        }
    }

    #[test]
    fn a_ground_paints_at_the_size_asked_and_a_solid_is_its_colour() {
        let white = get("white").expect("white").render(64, 36);
        assert_eq!(white.dimensions(), (64, 36));
        assert!(white.pixels().all(|pixel| pixel.0 == [255, 255, 255]));
        let night = get("night-sky").expect("night").render(16, 90);
        assert!(
            night.get_pixel(8, 0).0[2] < night.get_pixel(8, 89).0[2],
            "a fall top to bottom"
        );
    }

    #[test]
    fn every_ground_paints_without_a_flat_or_broken_texture() {
        for ground in ALL {
            let picture = ground.render(96, 54);
            assert_eq!(picture.dimensions(), (96, 54), "{}", ground.id);
            if matches!(ground.look, Look::Solid(_)) {
                continue;
            }
            let first = picture.get_pixel(0, 0).0;
            assert!(
                picture.pixels().any(|pixel| pixel.0 != first),
                "{} is one flat colour",
                ground.id
            );
        }
    }
}
