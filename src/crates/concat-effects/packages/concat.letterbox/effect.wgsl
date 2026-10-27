struct Params { aspect: f32 }

// The picture kept inside a box of `aspect`, centred, and black outside
// it: bars above and below a frame taller than the box, at the sides of
// one wider. The bars are opaque, so they hold over a layer beneath too.
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = sample(uv);
    let picture = frame.size.x / frame.size.y;
    let keep = min(vec2<f32>(params.aspect / picture, picture / params.aspect), vec2<f32>(1.0));
    let edge = (vec2<f32>(1.0) - keep) * 0.5;
    let inside = all(uv >= edge) && all(uv <= vec2<f32>(1.0) - edge);
    return select(vec4<f32>(0.0, 0.0, 0.0, 1.0), c, inside);
}
