struct Params { blocks: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let cell = floor(uv * vec2<f32>(params.blocks * frame.size.x / frame.size.y, params.blocks));
    let r = hash(cell, 7.0);
    let m = step(progress, r);
    return mix(to_at(uv), from_at(uv), m);
}
