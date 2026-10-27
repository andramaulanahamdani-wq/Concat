struct Params { squares: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let cells = floor(uv * vec2<f32>(params.squares * frame.size.x / frame.size.y, params.squares));
    let sum = cells.x + cells.y;
    let odd = sum - 2.0 * floor(sum * 0.5);
    let local = clamp((progress - odd * 0.5) * 2.0, 0.0, 1.0);
    return mix(from_at(uv), to_at(uv), smoothstep(0.3, 0.7, local));
}
