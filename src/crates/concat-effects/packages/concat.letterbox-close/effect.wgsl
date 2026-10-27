fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let shut = smoothstep(0.0, 1.0, sin(progress * 3.14159));
    let bar = shut * 0.5;
    let base = select(from_at(uv), to_at(uv), progress >= 0.5);
    let black = uv.y < bar || uv.y > 1.0 - bar;
    return select(base, vec4<f32>(0.0, 0.0, 0.0, 1.0), black);
}
