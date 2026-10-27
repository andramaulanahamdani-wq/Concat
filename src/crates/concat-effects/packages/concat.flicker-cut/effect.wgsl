fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let step_n = floor(progress * 14.0);
    let r = hash(vec2<f32>(step_n, 3.0), 1.0);
    let show_to = r < progress;
    let dark = hash(vec2<f32>(step_n, 5.0), 1.0) < 0.25 && progress > 0.05 && progress < 0.95;
    let base = select(from_at(uv), to_at(uv), show_to);
    return select(base, vec4<f32>(0.0, 0.0, 0.0, 1.0), dark);
}
