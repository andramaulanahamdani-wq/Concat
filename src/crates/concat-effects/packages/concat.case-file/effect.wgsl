struct Params { mood: f32 }

// Less colour, teal under and amber over, the blacks lifted the way an
// old print's are, a little contrast back on top, and the walls close in.
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = sample(uv);
    let mood = params.mood / 100.0;
    var out = saturation(c.rgb, 1.0 - mood * 0.5);
    out = split_tone(out, vec3<f32>(-0.05, 0.03, 0.07), vec3<f32>(0.05, 0.02, -0.04), mood);
    out = matte(out, mood * 0.05, 1.0 - mood * 0.03);
    out = contrast(out, 1.0 + mood * 0.15);
    out = vignette(out, uv, mood * 0.6);
    return vec4<f32>(out, c.a);
}
