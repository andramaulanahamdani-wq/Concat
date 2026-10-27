
// Value noise from the prelude's hash: smooth, the same on every GPU.
fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
    let a = hash(i, 0.0);
    let b = hash(i + vec2<f32>(1.0, 0.0), 0.0);
    let c = hash(i + vec2<f32>(0.0, 1.0), 0.0);
    let d = hash(i + vec2<f32>(1.0, 1.0), 0.0);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Four octaves of it, 0..1.
fn fbm(p: vec2<f32>) -> f32 {
    var sum = 0.0;
    var amp = 0.5;
    var q = p;
    for (var i: i32 = 0; i < 4; i++) {
        sum += amp * vnoise(q);
        q = q * 2.03 + vec2<f32>(17.0, 9.0);
        amp *= 0.5;
    }
    return sum / 0.9375;
}
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let a = vec2<f32>(frame.size.x / frame.size.y, 1.0);
    let n = fbm(uv * a * 2.5 + vec2<f32>(progress * 1.5, -progress));
    let m = smoothstep(n - 0.15, n + 0.15, progress * 1.3 - 0.15);
    let haze = sin(progress * 3.14159) * (1.0 - abs(m * 2.0 - 1.0)) * 0.35;
    let out = mix(from_at(uv), to_at(uv), m);
    return vec4<f32>(out.rgb + vec3<f32>(haze), out.a);
}
