fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let shut = sin(progress * 3.14159);
    let x = (uv.x - 0.5) * 2.0;
    // How far the lids are apart at this column: wide open at rest, an
    // almond shape as they close, nothing when shut.
    let gap = (1.0 - shut) * (0.5 + 0.25 * (1.0 - x * x));
    let seen = smoothstep(0.0, 0.04, gap - abs(uv.y - 0.5));
    let base = select(from_at(uv), to_at(uv), progress >= 0.5);
    return vec4<f32>(base.rgb * seen, base.a);
}
